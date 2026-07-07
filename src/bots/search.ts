import type { GameState, RuleConfig, Side } from '../engine'
import { BOTTOM_STORE, TOP_STORE, BOARD_LENGTH } from '../engine'
import { legalMoves, applyMove, cloneState } from '../engine'
import type { EvaluationFn } from './evaluation'
import { evaluateSimple, evaluateStrong, evaluateExpert, WIN_SCORE, MAX_PLY } from './evaluation'

export type TablebaseProbe = (state: GameState) => number | undefined

export interface CancelSignal {
  cancelled: boolean
}

export interface SearchLimits {
  deadlineMs: number | null
  nodeCount: number
  aborted: boolean
  checkInterval: number
}

export interface SearchResult {
  score: number
  pv: number[]
  rootScores?: Record<number, number>
}

export interface IterativeResult {
  score: number
  pv: number[]
  depth: number
  rootScores: Record<number, number>
}

// ── Zobrist Transposition Table ──────────────────────────────────────────

function createZobristTables(seed: number): {
  pieceTable: number[][]
  sideToMove: [number, number]
} {
  let state = seed
  const nextRand = (): number => {
    state = (state + 0x9e3779b9) | 0
    let z = state
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b)
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35)
    return (z ^ (z >>> 16)) >>> 0
  }

  const pieceTable: number[][] = []
  for (let pos = 0; pos < 14; pos++) {
    pieceTable[pos] = []
    for (let stones = 0; stones <= 80; stones++) {
      pieceTable[pos]![stones] = nextRand()
    }
  }

  const sideToMove: [number, number] = [nextRand(), nextRand()]
  return { pieceTable, sideToMove }
}

const { pieceTable, sideToMove } = createZobristTables(0x9e3779b9)
const { pieceTable: lockPieceTable, sideToMove: lockSideToMove } = createZobristTables(0x6d2b79f5)

function zobristHashFromTables(
  board: number[],
  currentPlayer: Side,
  pieceTbl: number[][],
  sideTbl: [number, number],
): number {
  let hash = 0
  for (let i = 0; i < board.length; i++) {
    const stones = board[i]!
    if (stones > 0) {
      hash ^= pieceTbl[i]![stones]!
    }
  }
  hash ^= sideTbl[currentPlayer === 'bottom' ? 0 : 1]!
  return hash >>> 0
}

function computeZobristHash(board: number[], currentPlayer: Side): number {
  return zobristHashFromTables(board, currentPlayer, pieceTable, sideToMove)
}

function computeZobristLock(board: number[], currentPlayer: Side): number {
  return zobristHashFromTables(board, currentPlayer, lockPieceTable, lockSideToMove)
}

export interface TTEntry {
  score: number
  depth: number
  flag: 'exact' | 'lower' | 'upper'
  bestMove: number
  lock: number
}

export class TranspositionTable {
  private table = new Map<number, TTEntry>()
  readonly maxEntries: number

  constructor(maxEntries = 2_000_000) {
    this.maxEntries = maxEntries
  }

  computeHash(state: GameState): number {
    return computeZobristHash(state.board, state.currentPlayer)
  }

  computeLock(state: GameState): number {
    return computeZobristLock(state.board, state.currentPlayer)
  }

  get(hash: number, lock: number): TTEntry | undefined {
    const entry = this.table.get(hash)
    if (!entry || entry.lock !== lock) return undefined
    return entry
  }

  set(hash: number, entry: TTEntry): void {
    const existing = this.table.get(hash)
    if (!existing || entry.depth >= existing.depth) {
      // Cap map size. A full reset is acceptable and simple.
      // Per-slot depth-preferred replacement cannot bound a Map keyed by hash
      // because the hash space is too large to walk every slot.
      if (!existing && this.table.size >= this.maxEntries) {
        this.table.clear()
      }
      this.table.set(hash, entry)
    }
  }

  clear(): void {
    this.table.clear()
  }

  get size(): number {
    return this.table.size
  }
}

// ── Extra-Turn Chain Safety ──────────────────────────────────────────────

export const ExtraTurnConfig = {
  MAX_EXTRA_TURN_EXTENSION: 3,
}


// ── Move Ordering ────────────────────────────────────────────────────────

const HISTORY_MAX = 1 << 24

function orderMoves(
  moves: number[],
  state: GameState,
  rules: RuleConfig,
  ttBestMove?: number,
  killers?: number[],
  historyTable?: number[][],
  prevRootScores?: Record<number, number>,
): number[] {
  const scored = moves.map((pit) => {
    let score = state.board[pit] ?? 0

    if (pit === ttBestMove) score += 10000

    if (prevRootScores && prevRootScores[pit] !== undefined) {
      score += 5000 + prevRootScores[pit]! * 0.5
    }

    const ownStore = state.currentPlayer === 'bottom' ? BOTTOM_STORE : TOP_STORE
    const distToStore = (ownStore - pit + BOARD_LENGTH) % BOARD_LENGTH || BOARD_LENGTH
    const stonesInPit = state.board[pit] ?? 0
    if (stonesInPit === distToStore) score += 50

    const child = applyMove(state, pit, rules)
    const childMove = child.moveHistory[child.moveHistory.length - 1]
    if (childMove?.captured) score += 100

    if (killers) {
      if (pit === killers[0]) score += 75
      else if (pit === killers[1]) score += 75
    }

    if (childMove?.wasExtraTurn && stonesInPit !== distToStore) score += 25

    if (historyTable) {
      const sideIdx = state.currentPlayer === 'bottom' ? 0 : 1
      const h = historyTable[sideIdx]![pit] ?? 0
      score += Math.min(h, 6400) / 256
    }

    return { pit, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.pit)
}

// ── Quiescence Search ────────────────────────────────────────────────────

const MAX_QDEPTH = 5

function quiesce(
  state: GameState,
  qDepth: number,
  alpha: number,
  beta: number,
  rules: RuleConfig,
  evalFn: EvaluationFn,
  cancelSignal?: CancelSignal,
  ply = 0,
  limits?: SearchLimits,
  tablebase?: TablebaseProbe,
): SearchResult {
  if (cancelSignal?.cancelled) return { score: 0, pv: [] }
  if (limits) {
    limits.nodeCount++
    if (limits.aborted) return { score: NaN, pv: [] }
    if (limits.deadlineMs !== null && limits.nodeCount % limits.checkInterval === 0 && performance.now() >= limits.deadlineMs) {
      limits.aborted = true
      return { score: NaN, pv: [] }
    }
  }

  if (tablebase && state.status === 'in-progress') {
    const tbScore = tablebase(state)
    if (tbScore !== undefined) {
      return { score: tbScore, pv: [] }
    }
  }

  if (state.status === 'finished') {
    const base = evalFn(state, rules)
    const score = adjustTerminalScore(base, ply)
    return { score, pv: [] }
  }
  if (qDepth >= MAX_QDEPTH) {
    return { score: evalFn(state, rules), pv: [] }
  }

  const standPat = evalFn(state, rules)
  if (standPat >= beta) return { score: beta, pv: [] }
  if (standPat > alpha) alpha = standPat

  const moves = legalMoves(state, rules)
  if (moves.length === 0) return { score: standPat, pv: [] }

  // Collect quiescence moves: captures and extra-turn moves.
  // Historically ordering was deliberately omitted; with the wider move set
  // (extra-turn moves added alongside captures) it now pays to sort.
  interface QMove { pit: number; captured: number; wasExtraTurn: boolean }
  const qMoves: QMove[] = []
  for (const pit of moves) {
    const child = applyMove(state, pit, rules)
    const lastMove = child.moveHistory[child.moveHistory.length - 1]
    if (!lastMove?.captured && !lastMove?.wasExtraTurn) continue
    qMoves.push({
      pit,
      captured: lastMove?.captured?.count ?? 0,
      wasExtraTurn: lastMove?.wasExtraTurn ?? false,
    })
  }

  if (qMoves.length === 0) return { score: standPat, pv: [] }

  // Order: capture moves first, sorted by captured stone count descending,
  // then extra-turn moves.
  qMoves.sort((a, b) => {
    if (a.captured > 0 && b.captured === 0) return -1
    if (a.captured === 0 && b.captured > 0) return 1
    if (a.captured > 0) return b.captured - a.captured
    return 0
  })

  let bestScore = standPat
  let bestPV: number[] = []

  for (const qMove of qMoves) {
    const child = applyMove(state, qMove.pit, rules)

    const result = qMove.wasExtraTurn
      ? quiesce(child, qDepth + 1, alpha, beta, rules, evalFn, cancelSignal, ply + 1, limits, tablebase)
      : quiesce(child, qDepth + 1, -beta, -alpha, rules, evalFn, cancelSignal, ply + 1, limits, tablebase)
    if (limits?.aborted) break
    const score = qMove.wasExtraTurn ? result.score : -result.score

    if (score > bestScore) {
      bestScore = score
      bestPV = [qMove.pit, ...result.pv]
    }
    if (score > alpha) alpha = score
    if (alpha >= beta) break
  }

  if (limits?.aborted) return { score: NaN, pv: [] }
  return { score: bestScore, pv: bestPV }
}

function adjustTerminalScore(base: number, ply: number): number {
  if (base === WIN_SCORE) return WIN_SCORE - ply
  if (base === -WIN_SCORE) return -WIN_SCORE + ply
  return base
}

// ── Search Functions ─────────────────────────────────────────────────────

function minimax(
  state: GameState,
  depth: number,
  rules: RuleConfig,
  evalFn: EvaluationFn,
  cancelSignal?: CancelSignal,
  rootScores?: Record<number, number>,
  quiesceDepth?: number,
  ply = 0,
  extraTurnChain = 0,
  limits?: SearchLimits,
  maxExtraTurnExtension = ExtraTurnConfig.MAX_EXTRA_TURN_EXTENSION,
): SearchResult {
  if (cancelSignal?.cancelled) return { score: 0, pv: [] }
  if (limits) {
    limits.nodeCount++
    if (limits.aborted) return { score: NaN, pv: [] }
    if (limits.deadlineMs !== null && limits.nodeCount % limits.checkInterval === 0 && performance.now() >= limits.deadlineMs) {
      limits.aborted = true
      return { score: NaN, pv: [] }
    }
  }
  if (state.status === 'finished') {
    const base = evalFn(state, rules)
    return { score: adjustTerminalScore(base, ply), pv: [] }
  }
  if (depth === 0) {
    return quiesceDepth && quiesceDepth > 0
      ? quiesce(state, 0, -Infinity, +Infinity, rules, evalFn, cancelSignal, ply, limits)
      : { score: evalFn(state, rules), pv: [] }
  }

  const moves = legalMoves(state, rules)
  if (moves.length === 0) {
    return { score: evalFn(state, rules), pv: [] }
  }

  const ordered = orderMoves(moves, state, rules)
  let bestScore = -Infinity
  let bestPV: number[] = []

  for (const pit of ordered) {
    if (cancelSignal?.cancelled) break
    if (limits?.aborted) break
    const child = applyMove(state, pit, rules)
    const childMove = child.moveHistory[child.moveHistory.length - 1]
    const isExtra = childMove?.wasExtraTurn && extraTurnChain < maxExtraTurnExtension
    const nextDepth = isExtra ? depth : depth - 1
    const nextChain = isExtra ? extraTurnChain + 1 : 0
    const result = isExtra
      ? minimax(child, nextDepth, rules, evalFn, cancelSignal, undefined, quiesceDepth, ply + 1, nextChain, limits, maxExtraTurnExtension)
      : minimax(child, nextDepth, rules, evalFn, cancelSignal, undefined, quiesceDepth, ply + 1, 0, limits, maxExtraTurnExtension)
    if (limits?.aborted) break
    const score = isExtra ? result.score : -result.score

    if (rootScores !== undefined) {
      rootScores[pit] = score
    }

    if (score > bestScore) {
      bestScore = score
      bestPV = [pit, ...result.pv]
    }
  }

  if (limits?.aborted) return { score: NaN, pv: [] }
  return { score: bestScore, pv: bestPV }
}

function minimaxWithAB(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  rules: RuleConfig,
  evalFn: EvaluationFn,
  cancelSignal?: CancelSignal,
  rootScores?: Record<number, number>,
  quiesceDepth?: number,
  ply = 0,
  extraTurnChain = 0,
  limits?: SearchLimits,
  maxExtraTurnExtension = ExtraTurnConfig.MAX_EXTRA_TURN_EXTENSION,
): SearchResult {
  if (cancelSignal?.cancelled) return { score: 0, pv: [] }
  if (limits) {
    limits.nodeCount++
    if (limits.aborted) return { score: NaN, pv: [] }
    if (limits.deadlineMs !== null && limits.nodeCount % limits.checkInterval === 0 && performance.now() >= limits.deadlineMs) {
      limits.aborted = true
      return { score: NaN, pv: [] }
    }
  }
  if (state.status === 'finished') {
    const base = evalFn(state, rules)
    return { score: adjustTerminalScore(base, ply), pv: [] }
  }
  if (depth === 0) {
    return quiesceDepth && quiesceDepth > 0
      ? quiesce(state, 0, alpha, beta, rules, evalFn, cancelSignal, ply, limits)
      : { score: evalFn(state, rules), pv: [] }
  }

  const moves = legalMoves(state, rules)
  if (moves.length === 0) {
    return { score: evalFn(state, rules), pv: [] }
  }

  const ordered = orderMoves(moves, state, rules)
  let bestScore = -Infinity
  let bestPV: number[] = []

  for (const pit of ordered) {
    if (cancelSignal?.cancelled) break
    if (limits?.aborted) break
    const child = applyMove(state, pit, rules)
    const childMove = child.moveHistory[child.moveHistory.length - 1]
    const isExtra = childMove?.wasExtraTurn && extraTurnChain < maxExtraTurnExtension
    const nextDepth = isExtra ? depth : depth - 1
    const nextChain = isExtra ? extraTurnChain + 1 : 0
    const result = isExtra
      ? minimaxWithAB(child, nextDepth, alpha, beta, rules, evalFn, cancelSignal, undefined, quiesceDepth, ply + 1, nextChain, limits, maxExtraTurnExtension)
      : minimaxWithAB(child, nextDepth, -beta, -alpha, rules, evalFn, cancelSignal, undefined, quiesceDepth, ply + 1, 0, limits, maxExtraTurnExtension)
    if (limits?.aborted) break
    const score = isExtra ? result.score : -result.score

    if (rootScores !== undefined) {
      rootScores[pit] = score
    }

    if (score > bestScore) {
      bestScore = score
      bestPV = [pit, ...result.pv]
    }

    if (score > alpha) alpha = score
    if (alpha >= beta) break
  }

  if (limits?.aborted) return { score: NaN, pv: [] }
  return { score: bestScore, pv: bestPV }
}

function minimaxWithABTT(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  rules: RuleConfig,
  evalFn: EvaluationFn,
  tt: TranspositionTable,
  cancelSignal?: CancelSignal,
  rootScores?: Record<number, number>,
  quiesceDepth?: number,
  ply = 0,
  extraTurnChain = 0,
  limits?: SearchLimits,
  maxExtraTurnExtension = ExtraTurnConfig.MAX_EXTRA_TURN_EXTENSION,
  tablebase?: TablebaseProbe,
  killers?: number[][],
  historyTable?: number[][],
  usePVS = false,
  prevRootScores?: Record<number, number>,
  nullWinNoWrite = false,
): SearchResult {
  if (cancelSignal?.cancelled) return { score: 0, pv: [] }
  if (limits) {
    limits.nodeCount++
    if (limits.aborted) return { score: NaN, pv: [] }
    if (limits.deadlineMs !== null && limits.nodeCount % limits.checkInterval === 0 && performance.now() >= limits.deadlineMs) {
      limits.aborted = true
      return { score: NaN, pv: [] }
    }
  }

  // Tablebase probe: exact score, no search needed
  if (tablebase && state.status === 'in-progress') {
    const tbScore = tablebase(state)
    if (tbScore !== undefined) {
      return { score: tbScore, pv: [] }
    }
  }

  const originalAlpha = alpha
  const originalBeta = beta

  const hash = tt.computeHash(state)
  const lock = tt.computeLock(state)
  const entry = tt.get(hash, lock)
  let ttBestMove: number | undefined

  if (entry && entry.depth >= depth) {
    if (entry.flag === 'exact' || entry.flag === 'lower') {
      if (entry.score > alpha) {
        alpha = entry.score
        ttBestMove = entry.bestMove
      }
    }
    if (entry.flag === 'exact' || entry.flag === 'upper') {
      if (entry.score < beta) {
        beta = entry.score
        ttBestMove = entry.bestMove
      }
    }
    if (alpha >= beta) {
      return { score: entry.score, pv: [entry.bestMove] }
    }
  }

  if (state.status === 'finished') {
    const base = evalFn(state, rules)
    return { score: adjustTerminalScore(base, ply), pv: [] }
  }
  if (depth === 0) {
    return quiesceDepth && quiesceDepth > 0
      ? quiesce(state, 0, alpha, beta, rules, evalFn, cancelSignal, ply, limits, tablebase)
      : { score: evalFn(state, rules), pv: [] }
  }

  const moves = legalMoves(state, rules)
  if (moves.length === 0) {
    return { score: evalFn(state, rules), pv: [] }
  }

  const ordered = orderMoves(moves, state, rules, ttBestMove, killers?.[ply], historyTable, ply === 0 ? prevRootScores : undefined)
  let bestScore = -Infinity
  let bestPV: number[] = []
  let isFirstChild = true

  for (const pit of ordered) {
    if (cancelSignal?.cancelled) break
    if (limits?.aborted) break
    const child = applyMove(state, pit, rules)
    const childMove = child.moveHistory[child.moveHistory.length - 1]
    const isExtra = childMove?.wasExtraTurn && extraTurnChain < maxExtraTurnExtension
    const nextDepth = isExtra ? depth : depth - 1
    const nextChain = isExtra ? extraTurnChain + 1 : 0

    let score: number
    let childPV: number[]

    if (!isFirstChild && usePVS) {
      // Null-window search: skip TT writes to guarantee correctness
      const nullResult = isExtra
        ? minimaxWithABTT(child, nextDepth, alpha, alpha + 1, rules, evalFn, tt, cancelSignal, undefined, quiesceDepth, ply + 1, nextChain, limits, maxExtraTurnExtension, tablebase, killers, historyTable, false, undefined, true)
        : minimaxWithABTT(child, nextDepth, -alpha - 1, -alpha, rules, evalFn, tt, cancelSignal, undefined, quiesceDepth, ply + 1, 0, limits, maxExtraTurnExtension, tablebase, killers, historyTable, false, undefined, true)

      if (limits?.aborted) break
      const nullScore = isExtra ? nullResult.score : -nullResult.score

      if (nullScore > alpha) {
        // Re-search with full window
        const fullResult = isExtra
          ? minimaxWithABTT(child, nextDepth, alpha, beta, rules, evalFn, tt, cancelSignal, undefined, quiesceDepth, ply + 1, nextChain, limits, maxExtraTurnExtension, tablebase, killers, historyTable, usePVS, undefined, nullWinNoWrite)
          : minimaxWithABTT(child, nextDepth, -beta, -alpha, rules, evalFn, tt, cancelSignal, undefined, quiesceDepth, ply + 1, 0, limits, maxExtraTurnExtension, tablebase, killers, historyTable, usePVS, undefined, nullWinNoWrite)

        if (limits?.aborted) break
        score = isExtra ? fullResult.score : -fullResult.score
        childPV = fullResult.pv
      } else {
        isFirstChild = false
        continue
      }
    } else {
      // Full-window search (first child or PVS disabled)
      const result = isExtra
        ? minimaxWithABTT(child, nextDepth, alpha, beta, rules, evalFn, tt, cancelSignal, undefined, quiesceDepth, ply + 1, nextChain, limits, maxExtraTurnExtension, tablebase, killers, historyTable, usePVS, undefined, nullWinNoWrite)
        : minimaxWithABTT(child, nextDepth, -beta, -alpha, rules, evalFn, tt, cancelSignal, undefined, quiesceDepth, ply + 1, 0, limits, maxExtraTurnExtension, tablebase, killers, historyTable, usePVS, undefined, nullWinNoWrite)

      if (limits?.aborted) break
      score = isExtra ? result.score : -result.score
      childPV = result.pv
    }

    if (rootScores !== undefined) {
      rootScores[pit] = score
    }

    if (score > bestScore) {
      bestScore = score
      bestPV = [pit, ...childPV]
    }

    if (score > alpha) alpha = score
    if (alpha >= beta) {
      // Record killer and history for non-capture beta cutoffs
      if (killers && !childMove?.captured) {
        const k = killers[ply] ?? (killers[ply] = [0, 0])
        if (k[0] !== pit) {
          k[1] = k[0]!
          k[0] = pit
        }
      }
      if (historyTable && !childMove?.captured) {
        const sideIdx = state.currentPlayer === 'bottom' ? 0 : 1
        historyTable[sideIdx]![pit]! += depth * depth
        if (historyTable[sideIdx]![pit]! >= HISTORY_MAX) {
          for (let s = 0; s < 2; s++) {
            for (let p = 0; p < 14; p++) {
              historyTable[s]![p]! >>= 1
            }
          }
        }
      }
      break
    }
    isFirstChild = false
  }

  if (limits?.aborted) return { score: NaN, pv: [] }

  const bestMove = bestPV[0]
  if (!nullWinNoWrite && bestMove !== undefined) {
    let flag: TTEntry['flag']
    if (bestScore <= originalAlpha) {
      flag = 'upper'
    } else if (bestScore >= originalBeta) {
      flag = 'lower'
    } else {
      flag = 'exact'
    }
    tt.set(hash, { score: bestScore, depth, flag, bestMove, lock })
  }

  return { score: bestScore, pv: bestPV }
}

// ── Iterative Deepening (synchronous, called between async yields) ──────

const ASPIRATION_WINDOW = 5.0

function isInMateBand(score: number): boolean {
  return Math.abs(score) >= WIN_SCORE - MAX_PLY
}

export function iterativeDeepening(
  state: GameState,
  timeBudgetMs: number,
  rules: RuleConfig,
  evalFn: EvaluationFn,
  tt: TranspositionTable | null,
  cancelSignal?: CancelSignal,
  quiesceDepth?: number,
  maxDepth?: number,
  tablebase?: TablebaseProbe,
  usePVS = true,
): IterativeResult {
  const startTime = performance.now()
  let bestResult: IterativeResult = { score: 0, pv: [], depth: 0, rootScores: {} }
  let prevScore: number | null = null

  // Tablebase probe: if position is in the table, return exact score immediately
  if (tablebase && state.status === 'in-progress') {
    const tbScore = tablebase(state)
    if (tbScore !== undefined) {
      return { score: tbScore, pv: [], depth: 0, rootScores: {} }
    }
  }

  const limits: SearchLimits = {
    deadlineMs: startTime + timeBudgetMs,
    nodeCount: 0,
    aborted: false,
    checkInterval: 2048,
  }

  const killers: number[][] | undefined = usePVS && tt ? [] : undefined
  const historyTable: number[][] | undefined = usePVS && tt ? [new Array<number>(14).fill(0), new Array<number>(14).fill(0)] : undefined

  let prevRootScores: Record<number, number> | undefined

  for (let depth = 1; ; depth++) {
    if (cancelSignal?.cancelled) break
    if (maxDepth !== undefined && depth > maxDepth) break
    if (depth > 1 && performance.now() - startTime >= timeBudgetMs) break

    const rootScores: Record<number, number> = {}
    const useAspiration = prevScore !== null && !isInMateBand(prevScore)
    const alpha = useAspiration ? prevScore! - ASPIRATION_WINDOW : -Infinity
    const beta = useAspiration ? prevScore! + ASPIRATION_WINDOW : +Infinity

    // Depth 1 runs without deadline enforcement so we always have a valid result
    const useLimits = depth === 1 ? undefined : limits
    if (useLimits) {
      limits.aborted = false
    }

    let result: SearchResult
    if (tt) {
      result = minimaxWithABTT(state, depth, alpha, beta, rules, evalFn, tt, cancelSignal, rootScores, quiesceDepth, 0, 0, useLimits, ExtraTurnConfig.MAX_EXTRA_TURN_EXTENSION, tablebase, killers, historyTable, usePVS, depth > 1 ? prevRootScores : undefined)
    } else {
      result = minimaxWithAB(state, depth, alpha, beta, rules, evalFn, cancelSignal, rootScores, quiesceDepth, 0, 0, useLimits)
    }

    if (cancelSignal?.cancelled) break

    // Discard aborted (partial) results
    if (isNaN(result.score) || limits.aborted) {
      break
    }

    if (useAspiration && (result.score <= alpha || result.score >= beta)) {
      let reResult: SearchResult
      if (tt) {
        reResult = minimaxWithABTT(state, depth, -Infinity, +Infinity, rules, evalFn, tt, cancelSignal, rootScores, quiesceDepth, 0, 0, useLimits, ExtraTurnConfig.MAX_EXTRA_TURN_EXTENSION, tablebase, killers, historyTable, usePVS, depth > 1 ? prevRootScores : undefined)
      } else {
        reResult = minimaxWithAB(state, depth, -Infinity, +Infinity, rules, evalFn, cancelSignal, rootScores, quiesceDepth, 0, 0, useLimits)
      }
      if (cancelSignal?.cancelled) break
      if (isNaN(reResult.score) || limits.aborted) break
      result = reResult
    }

    prevScore = result.score
    bestResult = { score: result.score, pv: result.pv, depth, rootScores }
    prevRootScores = rootScores

    if (bestResult.score > WIN_SCORE - MAX_PLY) break
    if (performance.now() - startTime >= timeBudgetMs) break
  }

  return bestResult
}

// ── Beginner Bot ─────────────────────────────────────────────────────────

export type RandomFn = () => number

export function pickMoveBeginner(
  state: GameState,
  rules: RuleConfig,
  random: RandomFn = Math.random,
): number {
  const moves = legalMoves(state, rules)
  if (moves.length === 0) return -1

  const extraTurnMoves: number[] = []
  for (const pit of moves) {
    const child = applyMove(state, pit, rules)
    const lastMove = child.moveHistory[child.moveHistory.length - 1]
    if (lastMove?.wasExtraTurn) {
      extraTurnMoves.push(pit)
    }
  }

  const candidates = extraTurnMoves.length > 0 ? extraTurnMoves : moves
  return candidates[Math.floor(random() * candidates.length)]!
}

// ── Level-specific pick-move helpers ─────────────────────────────────────

export function pickMoveCasual(
  state: GameState,
  rules: RuleConfig,
  cancelSignal?: CancelSignal,
): SearchResult {
  return minimax(state, 4, rules, evaluateSimple, cancelSignal)
}

export function pickMoveStrong(
  state: GameState,
  rules: RuleConfig,
  timeBudgetMs = 1500,
  cancelSignal?: CancelSignal,
): IterativeResult {
  return iterativeDeepening(state, timeBudgetMs, rules, evaluateStrong, null, cancelSignal)
}

export function pickMoveExpert(
  state: GameState,
  rules: RuleConfig,
  timeBudgetMs = 3000,
  cancelSignal?: CancelSignal,
  usePVS = true,
): IterativeResult {
  const tt = new TranspositionTable()
  return iterativeDeepening(state, timeBudgetMs, rules, evaluateExpert, tt, cancelSignal, undefined, undefined, undefined, usePVS)
}

// ── Principal Variation Extraction via Re-search ─────────────────────────

export interface ExtractPVOptions {
  perStepBudgetMs?: number
  totalBudgetMs?: number
  maxPlies?: number
  cancelSignal?: CancelSignal
}

export interface ExtractedPV {
  pv: number[]
  players: Side[]
  finalState: GameState
  reachedTerminal: boolean
}

function greedyMove(
  current: GameState,
  moves: number[],
  rules: RuleConfig,
  evalFn: EvaluationFn,
): number {
  let best = moves[0]!
  let bestScore = -Infinity
  for (const pit of moves) {
    const child = applyMove(current, pit, rules)
    const lastMove = child.moveHistory[child.moveHistory.length - 1]
    const score = lastMove?.wasExtraTurn ? evalFn(child, rules) : -evalFn(child, rules)
    if (score > bestScore) {
      bestScore = score
      best = pit
    }
  }
  return best
}

export function extractPrincipalVariation(
  state: GameState,
  rules: RuleConfig,
  tt: TranspositionTable,
  evalFn: EvaluationFn,
  options: ExtractPVOptions = {},
  tablebaseBestMove?: (state: GameState) => number | undefined,
): ExtractedPV {
  const {
    perStepBudgetMs = 250,
    totalBudgetMs = 2500,
    maxPlies = 300,
    cancelSignal,
  } = options

  const pv: number[] = []
  const players: Side[] = []
  let current = cloneState(state)
  const totalStart = performance.now()

  while (true) {
    if (cancelSignal?.cancelled) break
    if (current.status === 'finished') break
    if (pv.length >= maxPlies) break

    const elapsed = performance.now() - totalStart
    if (elapsed >= totalBudgetMs) break

    const moves = legalMoves(current, rules)
    if (moves.length === 0) break
    let chosenMove: number | undefined

    // Tablebase PV extraction: skip search, use TB argmax directly
    if (tablebaseBestMove) {
      const tbMove = tablebaseBestMove(current)
      if (tbMove !== undefined && moves.includes(tbMove)) {
        chosenMove = tbMove
      }
    }

    if (chosenMove === undefined) {
      const stepBudget = Math.min(perStepBudgetMs, totalBudgetMs - elapsed)

      const result = iterativeDeepening(
        current,
        stepBudget,
        rules,
        evalFn,
        tt,
        cancelSignal,
        1,
      )

      if (cancelSignal?.cancelled) break

      if (result.pv[0] !== undefined && moves.includes(result.pv[0])) {
        chosenMove = result.pv[0]
      }
    }

    if (chosenMove === undefined) {
      const hash = tt.computeHash(current)
      const lock = tt.computeLock(current)
      const entry = tt.get(hash, lock)
      if (entry && entry.bestMove !== undefined && moves.includes(entry.bestMove)) {
        chosenMove = entry.bestMove
      }
    }

    if (chosenMove === undefined) {
      chosenMove = greedyMove(current, moves, rules, evalFn)
    }

    pv.push(chosenMove)
    players.push(current.currentPlayer)
    current = applyMove(current, chosenMove, rules)
  }

  return { pv, players, finalState: current, reachedTerminal: current.status === 'finished' }
}

export { minimax, minimaxWithAB, minimaxWithABTT, adjustTerminalScore }
