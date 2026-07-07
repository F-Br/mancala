import type { GameState, RuleConfig } from '../engine'
import {
  KALAH_STANDARD,
  legalMoves,
  applyMove,
  generateTablebase,
  getTotalSize,
} from '../engine'
import {
  minimaxWithABTT,
  TranspositionTable,
  extractPrincipalVariation,
  iterativeDeepening,
  adjustTerminalScore,
  ExtraTurnConfig,
} from './search'
import type { CancelSignal, SearchLimits, TablebaseProbe } from './search'
import { evaluateExpert, WIN_SCORE } from './evaluation'
import type { AnalysisMessage, AnalysisWorkerMessage, AnalysisRequest } from './types'
import type { TbProgressMsg } from '../engine'
import { loadTablebaseFromIDB, saveTablebaseToIDB, buildProbes, TB_K } from './tbStore'

export class AnalysisWorkerHandler {
  private currentCancel: CancelSignal | null = null
  private sharedTT: TranspositionTable
  private readonly postMsg: (msg: AnalysisWorkerMessage | TbProgressMsg) => void
  private probe: TablebaseProbe | null = null
  private tbBestMove: ((state: GameState) => number | undefined) | null = null
  private tbReady = false
  private tbInitStarted = false
  private queue: AnalysisRequest[] = []
  private runningRequestId: number | null = null

  constructor(
    postMsg: (msg: AnalysisWorkerMessage | TbProgressMsg) => void,
    maxTTEntries?: number,
    skipTablebase = false,
  ) {
    this.postMsg = postMsg
    this.sharedTT = new TranspositionTable(maxTTEntries)
    if (skipTablebase) {
      this.tbInitStarted = true
    }
  }

  handleMessage(msg: AnalysisMessage): void {
    if (msg.type === 'cancel') {
      if (msg.requestId === this.runningRequestId && this.currentCancel) {
        this.currentCancel.cancelled = true
      } else {
        this.queue = this.queue.filter(r => r.requestId !== msg.requestId)
      }
      return
    }

    if (msg.type === 'analyze') {
      this.ensureTablebaseInit()
      this.queue.push(msg)
      if (this.runningRequestId === null) {
        this.dequeueAndStart()
      }
    }
  }

  private ensureTablebaseInit(): void {
    if (this.tbInitStarted) return
    this.tbInitStarted = true
    this.initTablebase()
  }

  private async initTablebase(): Promise<void> {
    try {
      const cached = await loadTablebaseFromIDB()
      if (cached && cached.length === getTotalSize(TB_K)) {
        const { probe, tbBestMove } = buildProbes(cached)
        this.probe = probe
        this.tbBestMove = tbBestMove
        this.tbReady = true
        return
      }
    } catch {
      // IndexedDB unavailable or corrupt — generate fresh
    }

    try {
      const { table, nonProbeableCount } = generateTablebase(
        TB_K,
        KALAH_STANDARD,
        (msg: TbProgressMsg) => {
          this.postMsg(msg)
        },
      )

      const { probe, tbBestMove } = buildProbes(table)
      this.probe = probe
      this.tbBestMove = tbBestMove
      this.tbReady = true

      if (nonProbeableCount > 0) {
        console.warn(
          `Tablebase generation: ${nonProbeableCount} non-probeable entries at K=${TB_K}`,
        )
      }

      saveTablebaseToIDB(table).catch(() => {})
    } catch (err) {
      console.error('Tablebase generation failed:', err)
      // Continue without tablebase — search works normally
    }
  }

  private handleAnalyze(msg: AnalysisRequest): void {
    const cancelSignal: CancelSignal = { cancelled: false }
    this.currentCancel = cancelSignal
    this.runningRequestId = msg.requestId

    const {
      state,
      timeBudgetMs,
      requestId,
      playedPitIndex,
      totalExtractionBudgetMs,
      perStepExtractionBudgetMs,
    } = msg
    const rules = KALAH_STANDARD

    try {
      this.runExpertSearch(
        state,
        timeBudgetMs,
        rules,
        requestId,
        cancelSignal,
        playedPitIndex,
        totalExtractionBudgetMs,
        perStepExtractionBudgetMs,
      )
    } catch (err) {
      this.postMsg({
        type: 'error',
        requestId,
        message: err instanceof Error ? err.message : String(err),
      })
      this.currentCancel = null
      this.runningRequestId = null
      if (this.queue.length > 0) {
        setTimeout(() => this.dequeueAndStart(), 0)
      }
    }
  }

  private dequeueAndStart(): void {
    if (this.queue.length === 0 || this.runningRequestId !== null) return
    const next = this.queue.shift()
    if (next) {
      this.handleAnalyze(next)
    }
  }

  private runExpertSearch(
    state: GameState,
    timeBudgetMs: number,
    rules: RuleConfig,
    requestId: number,
    cancelSignal: CancelSignal,
    playedPitIndex: number | undefined,
    totalExtractionBudgetMs?: number,
    perStepExtractionBudgetMs?: number,
  ): void {
    const startTime = performance.now()
    const budget = timeBudgetMs
    const deadlineMs = startTime + timeBudgetMs
    const evalFn = evaluateExpert
    const tt = this.sharedTT

    const limits: SearchLimits = {
      deadlineMs,
      nodeCount: 0,
      aborted: false,
      checkInterval: 2048,
    }

    let bestResult = {
      score: 0,
      pv: [] as number[],
      depth: 0,
      rootScores: {} as Record<number, number>,
    }
    let depth = 1

    const sendBestResult = (): void => {
      let reachedTerminal = false

      if (bestResult.pv.length === 0) {
        const moves = legalMoves(state, rules)
        if (moves.length > 0) {
          bestResult = {
            score: 0,
            pv: [moves[Math.floor(Math.random() * moves.length)]!],
            depth: 0,
            rootScores: {},
          }
        }
      }

      if (!cancelSignal.cancelled && bestResult.pv.length > 0) {
        const effTotalExtrBudget =
          totalExtractionBudgetMs ?? Math.min(2500, Math.max(500, Math.floor(timeBudgetMs * 0.83)))
        const effPerStepExtrBudget =
          perStepExtractionBudgetMs ?? Math.min(250, Math.max(50, Math.floor(timeBudgetMs * 0.08)))
        const extracted = extractPrincipalVariation(
          state,
          rules,
          tt,
          evalFn,
          {
            cancelSignal,
            perStepBudgetMs: effPerStepExtrBudget,
            totalBudgetMs: effTotalExtrBudget,
          },
          this.tbReady ? this.tbBestMove ?? undefined : undefined,
        )
        if (extracted.pv.length > 0) {
          bestResult = { ...bestResult, pv: extracted.pv }
        }
        reachedTerminal = extracted.reachedTerminal
      }

      let exactPlayedEval: number | undefined
      const bestMove = bestResult.pv[0]
      if (
        playedPitIndex !== undefined &&
        bestMove !== undefined &&
        playedPitIndex !== bestMove &&
        !cancelSignal.cancelled
      ) {
        const moves = legalMoves(state, rules)
        if (moves.includes(playedPitIndex)) {
          try {
            exactPlayedEval = this.computeExactPlayedEval(
              state,
              playedPitIndex,
              timeBudgetMs,
              rules,
              evalFn,
              tt,
              cancelSignal,
            )
          } catch {
            // Verification failed — leave exactPlayedEval undefined
          }
        }
      }

      this.postMsg({
        type: 'result',
        pitIndex: bestResult.pv[0] ?? -1,
        evalScore: bestResult.score,
        principalVariation: bestResult.pv,
        depthReached: bestResult.depth,
        requestId,
        rootScores: bestResult.rootScores,
        reachedTerminal,
        ...(exactPlayedEval !== undefined ? { exactPlayedEval } : {}),
        ...(cancelSignal.cancelled ? { cancelled: true } : {}),
      })
      if (this.currentCancel === cancelSignal) {
        this.currentCancel = null
      }
      this.runningRequestId = null
      if (this.queue.length > 0) {
        setTimeout(() => this.dequeueAndStart(), 0)
      }
    }

    const iterate = (): void => {
      if (cancelSignal.cancelled) {
        sendBestResult()
        return
      }
      if (performance.now() - startTime >= budget) {
        sendBestResult()
        return
      }

      limits.aborted = false

      const rootScores: Record<number, number> = {}
      const result = minimaxWithABTT(
        state,
        depth,
        -Infinity,
        +Infinity,
        rules,
        evalFn,
        tt,
        cancelSignal,
        rootScores,
        1,
        0,
        0,
        depth === 1 ? undefined : limits,
        ExtraTurnConfig.MAX_EXTRA_TURN_EXTENSION,
        this.probe ?? undefined,
      )

      if (cancelSignal.cancelled) {
        sendBestResult()
        return
      }

      if (isNaN(result.score) || limits.aborted) {
        sendBestResult()
        return
      }

      bestResult = { score: result.score, pv: result.pv, depth, rootScores }

      depth++
      setTimeout(iterate, 0)
    }

    setTimeout(iterate, 0)
  }

  private computeExactPlayedEval(
    state: GameState,
    playedPitIndex: number,
    timeBudgetMs: number,
    rules: RuleConfig,
    evalFn: (state: GameState, rules: RuleConfig) => number,
    tt: TranspositionTable,
    cancelSignal: CancelSignal,
  ): number {
    const verificationBudget = Math.max(300, Math.floor(timeBudgetMs * 0.35))
    const childState = applyMove(state, playedPitIndex, rules)
    const childMove = childState.moveHistory[childState.moveHistory.length - 1]
    const wasExtraTurn = childMove?.wasExtraTurn ?? false

    let childScore: number

    if (childState.status === 'finished') {
      const base = evalFn(childState, rules)
      childScore =
        base === WIN_SCORE || base === -WIN_SCORE
          ? adjustTerminalScore(base, 1)
          : base
    } else {
      const idResult = iterativeDeepening(
        childState,
        verificationBudget,
        rules,
        evalFn,
        tt,
        cancelSignal,
        1,
        undefined,
        this.probe ?? undefined,
      )
      childScore = idResult.score
    }

    return wasExtraTurn ? childScore : -childScore
  }
}

// Self-hosted worker entry
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  const postMsg = (msg: AnalysisWorkerMessage | TbProgressMsg) => {
    try {
      self.postMessage(msg)
    } catch {
      self.postMessage(msg as unknown as MessageEvent, '*')
    }
  }
  const handler = new AnalysisWorkerHandler(postMsg)
  self.onmessage = (event: MessageEvent<AnalysisMessage>) => {
    handler.handleMessage(event.data)
  }
}
