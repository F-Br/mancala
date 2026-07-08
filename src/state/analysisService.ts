import { create } from 'zustand'
import type { GameState, RuleConfig, Side, TbProgressMsg } from '../engine'
import { gameToText } from '../engine'
import { requestAnalysis, setOnTBProgress } from '../bots/analysisClient'
import type { AnalysisHandle, AnalysisResult } from '../bots/analysisClient'
import { useGameStore, type AnalysisCacheEntry } from './gameStore'
import { useHistoryStore } from './historyStore'
import {
  executeBatchAnalysis,
  replayPositions,
  ANALYSIS_POSITION_BUDGET_MS,
  ANALYSIS_CEILING_MS_PER_POSITION,
  isCacheHealthy,
  type BatchProgress,
} from '../ui/batchAnalysis'

export interface AnalysisJob {
  gameText: string
  gameState: GameState
  firstPlayer: Side
  rules: RuleConfig
}

export interface ProgressInfo {
  current: number
  total: number
  remainingS: number
}

export interface CurrentJob {
  gameText: string
  progress: ProgressInfo
  tbPhase: boolean
}

export interface AnalysisServiceState {
  current: CurrentJob | null
  queue: string[]

  requestAnalysis: (job: AnalysisJob, opts?: { foreground?: boolean }) => void
  cancelAll: () => void
}

// ── Injection point for tests ──────────────────────────────────────

type AnalyzeFn = (state: GameState, budgetMs: number, playedPitIndex?: number) => Promise<AnalysisResult>
let _analyzeFn: AnalyzeFn | null = null

export function _setAnalyzeFn(fn: AnalyzeFn | null): void {
  _analyzeFn = fn
}

// ── Module-level runner state ───────────────────────────────────────

const jobMap = new Map<string, AnalysisJob>()
let activeSignal: { cancelled: boolean } | null = null
let activeHandle: AnalysisHandle | null = null
let isProcessing = false

// ── TB progress wiring ──────────────────────────────────────────────

let tbPhaseRef = false
let firstProgressRef = true

setOnTBProgress((_msg: TbProgressMsg) => {
  if (!tbPhaseRef) {
    tbPhaseRef = true
    useAnalysisService.setState((s) => {
      if (!s.current) return {}
      return { current: { ...s.current, tbPhase: true } }
    })
  }
})

// ── Store ───────────────────────────────────────────────────────────
//
// NOTE: Bulk backfill of old unanalyzed history records was considered and
// deliberately rejected. Auto-analyzing every legacy record on startup
// could queue dozens of multi-minute jobs unprompted. The existing per-game
// path covers them: opening any old game's review triggers a foreground job.

export const useAnalysisService = create<AnalysisServiceState>()((set, get) => ({
  current: null,
  queue: [],

  requestAnalysis: (job, opts) => {
    const { gameText } = job
    const state = get()

    if (state.current?.gameText === gameText || state.queue.includes(gameText)) {
      return
    }

    const historyRecord = useHistoryStore.getState().records.find(
      (r) => r.gameText === gameText,
    )
    if (historyRecord?.analysisResult && isCacheHealthy(historyRecord.analysisResult)) {
      return
    }

    jobMap.set(gameText, job)

    if (opts?.foreground && state.current && state.current.gameText !== gameText) {
      if (activeSignal) activeSignal.cancelled = true
      if (activeHandle) {
        activeHandle.cancel()
        activeHandle = null
      }
      const preemptedGameText = state.current.gameText
      set({
        queue: [gameText, preemptedGameText, ...state.queue.filter((gt) => gt !== gameText)],
      })
    } else {
      set({ queue: [...state.queue, gameText] })
    }

    if (!state.current) {
      processQueue()
    }
  },

  cancelAll: () => {
    if (activeSignal) activeSignal.cancelled = true
    if (activeHandle) {
      activeHandle.cancel()
      activeHandle = null
    }
    set({ queue: [], current: null })
    activeSignal = null
  },
}))

// ── Runner ──────────────────────────────────────────────────────────

async function processQueue(): Promise<void> {
  if (isProcessing) return
  isProcessing = true

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const state = useAnalysisService.getState()
      if (state.queue.length === 0) {
        useAnalysisService.setState({ current: null })
        break
      }

      const gameText = state.queue[0]!
      const job = jobMap.get(gameText)
      if (!job) {
        useAnalysisService.setState({ queue: state.queue.slice(1) })
        continue
      }

      const signal = { cancelled: false }
      activeSignal = signal
      tbPhaseRef = false
      firstProgressRef = true

      useAnalysisService.setState({
        current: {
          gameText,
          progress: { current: 0, total: 0, remainingS: 0 },
          tbPhase: false,
        },
        queue: state.queue.slice(1),
      })

      await runJob(job, signal)
      activeSignal = null
      activeHandle = null
    }
  } finally {
    isProcessing = false
  }
}

async function runJob(job: AnalysisJob, signal: { cancelled: boolean }): Promise<void> {
  const { gameText, gameState, firstPlayer, rules } = job
  const positions = replayPositions(gameState, firstPlayer, rules)

  if (positions.length <= 1) return

  const analyze = createAnalyzeCallback(signal)

  const batchResult = await executeBatchAnalysis({
    positions,
    analyze,
    positionBudgetMs: ANALYSIS_POSITION_BUDGET_MS,
    onProgress: (p: BatchProgress) => {
      if (tbPhaseRef && p.current > 0) {
        tbPhaseRef = false
        useAnalysisService.setState((s) => {
          if (!s.current || s.current.gameText !== gameText) return {}
          return { current: { ...s.current, tbPhase: false } }
        })
      }
      let remaining = p.remainingS
      if (firstProgressRef && remaining === 0 && p.current > 0 && p.current < p.total) {
        remaining = Math.round((p.total - p.current) * ANALYSIS_CEILING_MS_PER_POSITION / 1000)
        firstProgressRef = false
      }
      useAnalysisService.setState((s) => {
        if (!s.current || s.current.gameText !== gameText) return {}
        return {
          current: {
            ...s.current,
            progress: { current: p.current, total: p.total, remainingS: remaining },
          },
        }
      })
    },
    signal,
  })

  if (signal.cancelled) return

  const entries: AnalysisCacheEntry[] = batchResult.map((r) => r.entry)

  useHistoryStore.getState().updateAnalysis(gameText, entries)
  jobMap.delete(gameText)

  const currentStoreGame = useGameStore.getState()
  if (currentStoreGame.gameState && gameToText(currentStoreGame.gameState) === gameText) {
    useGameStore.getState().setAnalysisCache(entries)
  }
}

function createAnalyzeCallback(signal: { cancelled: boolean }) {
  return async (state: GameState, budgetMs: number, playedPitIndex?: number): Promise<AnalysisResult> => {
    while (useGameStore.getState().gameState?.status === 'in-progress') {
      if (signal.cancelled) throw new Error('Analysis cancelled')
      await new Promise((r) => setTimeout(r, 500))
    }

    if (_analyzeFn) {
      return _analyzeFn(state, budgetMs, playedPitIndex)
    }

    const handle = await requestAnalysis(state, budgetMs, playedPitIndex)
    activeHandle = handle
    const result = await handle.promise
    activeHandle = null
    return result
  }
}

// ── Pure helpers (testable without rendering) ────────────────────────

export function recordAnalysisStatus(
  gameText: string,
  serviceState: { current: CurrentJob | null; queue: string[] },
  hasAnalysis: boolean,
): 'analyzing' | 'queued' | 'done' | 'none' {
  if (serviceState.current?.gameText === gameText) return 'analyzing'
  if (serviceState.queue.includes(gameText)) return 'queued'
  if (hasAnalysis) return 'done'
  return 'none'
}

// ── Test reset ──────────────────────────────────────────────────────

export function _resetForTest(): void {
  activeSignal = null
  activeHandle = null
  jobMap.clear()
  isProcessing = false
  _analyzeFn = null
  tbPhaseRef = false
  firstProgressRef = true
  useAnalysisService.setState({ current: null, queue: [] })
}
