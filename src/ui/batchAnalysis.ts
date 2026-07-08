import type { GameState, Move, Side, RuleConfig } from '../engine'
import { createInitialState, cloneState, applyMove } from '../engine'
import type { AnalysisResult } from '../bots/analysisClient'
import type { AnalysisCacheEntry } from '../state/gameStore'

export interface PositionInfo {
  state: GameState
  move: Move | undefined
  index: number
  player: Side
}

export interface BatchProgress {
  current: number
  total: number
  remainingS: number
}

export interface BatchAnalysisEntry {
  entry: AnalysisCacheEntry
  reachedTerminal: boolean
}

export interface BatchAnalysisInput {
  positions: PositionInfo[]
  analyze: (state: GameState, budgetMs: number, playedPitIndex?: number) => Promise<AnalysisResult>
  /**
   * Per-position time budget in milliseconds for the main best-move search.
   *
   * Budget arithmetic (for default 8500 ms):
   *   8500 (best move)
   *   + max(2975, 300) (played-move verification search, capped at 0.35× budget)
   *   + 2500 (PV extraction, ~25 steps × 100 ms)
   *   = ≤ 13975 ms worst case per position
   *
   * This ceiling is used for time-remaining estimates in the UI until
   * real wall-clock timings accumulate.
   */
  positionBudgetMs: number
  onProgress?: (progress: BatchProgress) => void
  signal?: { cancelled: boolean }
}

export const ANALYSIS_POSITION_BUDGET_MS = 8500

/**
 * Time-remaining estimate fallback used before any real wall-clock timings
 * are available. Based on max(8500, 2975, 2500) ≈ 13975 ms per position,
 * rounded up to 14000 for safety margin.
 */
export const ANALYSIS_CEILING_MS_PER_POSITION = 14000

export function replayPositions(
  gameState: GameState,
  firstPlayer: Side,
  rules: RuleConfig,
): PositionInfo[] {
  const initial = createInitialState(rules, firstPlayer)
  const positions: PositionInfo[] = []

  let current = cloneState(initial)

  for (let i = 0; i < gameState.moveHistory.length; i++) {
    const move = gameState.moveHistory[i]!
    positions.push({
      state: cloneState(current),
      move,
      index: i,
      player: move.player,
    })
    current = applyMove(current, move.pitIndex, rules)
  }

  positions.push({
    state: cloneState(current),
    move: undefined,
    index: gameState.moveHistory.length,
    player: current.currentPlayer,
  })

  return positions
}

/**
 * Core batch-analysis loop. Processes positions sequentially because the
 * shared transposition table across consecutive positions is worth more
 * than parallelism — later positions benefit from TT entries accumulated
 * during earlier analyses.
 */
export async function executeBatchAnalysis({
  positions,
  analyze,
  positionBudgetMs,
  onProgress,
  signal,
}: BatchAnalysisInput): Promise<BatchAnalysisEntry[]> {
  const moveCount = positions.length - 1 // last position is terminal, no move
  const results: BatchAnalysisEntry[] = []

  const startTime = performance.now()

  for (let i = 0; i < moveCount; i++) {
    if (signal?.cancelled) break

    const pos = positions[i]
    if (!pos || !pos.move || pos.state.status !== 'in-progress') {
      results.push({
        entry: {
          bestPitIndex: -1,
          bestEval: 0,
          pv: [],
          depth: 0,
          playedEval: 0,
          rootScores: {},
          reachedTerminal: false,
        },
        reachedTerminal: false,
      })
      onProgress?.({ current: i + 1, total: moveCount, remainingS: 0 })
      continue
    }

    let remainingS = 0
    try {
      const result = await analyze(pos.state, positionBudgetMs, pos.move.pitIndex)

      const elapsed = performance.now() - startTime
      const avgMsPerPos = elapsed / (i + 1)
      remainingS = Math.round((moveCount - i - 1) * avgMsPerPos / 1000)

      const playedMove = pos.move
      let playedEval: number

      if (playedMove.pitIndex === result.pitIndex || result.pitIndex < 0) {
        playedEval = result.evalScore
      } else {
        playedEval = result.exactPlayedEval ?? result.evalScore
      }

      results.push({
        entry: {
          bestPitIndex: result.pitIndex,
          bestEval: result.evalScore,
          pv: result.principalVariation,
          depth: result.depthReached,
          playedEval,
          rootScores: result.rootScores ?? {},
          reachedTerminal: result.reachedTerminal ?? false,
        },
        reachedTerminal: result.reachedTerminal ?? false,
      })
      } catch {
        if (signal?.cancelled) break
        results.push({
          entry: {
            bestPitIndex: -1,
            bestEval: 0,
            pv: [],
            depth: 0,
            playedEval: 0,
            rootScores: {},
            reachedTerminal: false,
          },
          reachedTerminal: false,
        })
      }

    onProgress?.({ current: i + 1, total: moveCount, remainingS })
  }

  return results
}

export function isCacheHealthy(entries: AnalysisCacheEntry[]): boolean {
  for (const entry of entries) {
    if (!entry) continue
    if (entry.bestPitIndex < 0) return false
    if (!('reachedTerminal' in entry)) return false
    if (entry.bestPitIndex >= 0 && entry.pv.length <= 1 && entry.reachedTerminal !== true) return false
  }
  return true
}

export function isPVActive(showPV: boolean, startIndex: number | null, currentIndex: number): boolean {
  return showPV && startIndex === currentIndex
}
