import type { GameState, RuleConfig, Side } from '../engine'
import { BOTTOM_STORE, TOP_STORE, BOARD_LENGTH } from '../engine'
import { legalMoves, applyMove } from '../engine'
import type { EvaluationFn } from './evaluation'
import { evaluateSimple, evaluateStrong, evaluateExpert } from './evaluation'

export interface CancelSignal {
  cancelled: boolean
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

function createZobristTables(): {
  pieceTable: number[][]
  sideToMove: [number, number]
} {
  let state = 0x9e3779b9
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

const { pieceTable, sideToMove } = createZobristTables()

function computeZobristHash(board: number[], currentPlayer: Side): number {
  let hash = 0
  for (let i = 0; i < board.length; i++) {
    const stones = board[i]!
    if (stones > 0) {
      hash ^= pieceTable[i]![stones]!
    }
  }
  hash ^= sideToMove[currentPlayer === 'bottom' ? 0 : 1]!
  return hash >>> 0
}

export interface TTEntry {
  score: number
  depth: number
  flag: 'exact' | 'lower' | 'upper'
  bestMove: number
}

export class TranspositionTable {
  private table = new Map<number, TTEntry>()

  computeHash(state: GameState): number {
    return computeZobristHash(state.board, state.currentPlayer)
  }

  get(hash: number): TTEntry | undefined {
    return this.table.get(hash)
  }

  set(hash: number, entry: TTEntry): void {
    const existing = this.table.get(hash)
    if (!existing || entry.depth >= existing.depth) {
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

// ── Move Ordering ────────────────────────────────────────────────────────

function orderMoves(
  moves: number[],
  state: GameState,
  rules: RuleConfig,
  ttBestMove?: number,
): number[] {
  const scored = moves.map((pit) => {
    let score = state.board[pit] ?? 0

    if (pit === ttBestMove) score += 10000

    const ownStore = state.currentPlayer === 'bottom' ? BOTTOM_STORE : TOP_STORE
    const distToStore = (ownStore - pit + BOARD_LENGTH) % BOARD_LENGTH || BOARD_LENGTH
    if (score === distToStore) score += 50

    const child = applyMove(state, pit, rules)
    const childMove = child.moveHistory[child.moveHistory.length - 1]
    if (childMove?.captured) score += 100
    if (childMove?.wasExtraTurn && score !== distToStore) score += 25

    return { pit, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.pit)
}

// ── Quiescence Search ────────────────────────────────────────────────────

const MAX_QDEPTH = 3

function quiesce(
  state: GameState,
  qDepth: number,
  alpha: number,
  beta: number,
  rules: RuleConfig,
  evalFn: EvaluationFn,
  cancelSignal?: CancelSignal,
): SearchResult {
  if (cancelSignal?.cancelled) return { score: 0, pv: [] }
  if (state.status === 'finished') {
    return { score: evalFn(state, rules), pv: [] }
  }
  if (qDepth >= MAX_QDEPTH) {
    return { score: evalFn(state, rules), pv: [] }
  }

  const standPat = evalFn(state, rules)
  if (standPat >= beta) return { score: beta, pv: [] }
  if (standPat > alpha) alpha = standPat

  const moves = legalMoves(state, rules)
  if (moves.length === 0) return { score: standPat, pv: [] }

  // Quick check: if the current player has no empty pits, no capture is
  // possible → skip the expensive loop entirely.
  const { pitsPerSide } = rules
  const ownStart = state.currentPlayer === 'bottom' ? 0 : pitsPerSide + 1
  const ownEnd = state.currentPlayer === 'bottom' ? pitsPerSide - 1 : pitsPerSide * 2
  let hasEmptyPit = false
  for (let i = ownStart; i <= ownEnd && !hasEmptyPit; i++) {
    if ((state.board[i] ?? 0) === 0) hasEmptyPit = true
  }
  if (!hasEmptyPit) return { score: standPat, pv: [] }

  // No move ordering needed — captures are rare and stand-pat prunes well.
  let bestScore = standPat
  let bestPV: number[] = []

  for (const pit of moves) {
    const child = applyMove(state, pit, rules)
    const lastMove = child.moveHistory[child.moveHistory.length - 1]
    if (!lastMove?.captured) continue

    const result = quiesce(child, qDepth + 1, -(beta), -(alpha), rules, evalFn, cancelSignal)
    const score = lastMove?.wasExtraTurn ? result.score : -result.score

    if (score > bestScore) {
      bestScore = score
      bestPV = [pit, ...result.pv]
    }
    if (score > alpha) alpha = score
    if (alpha >= beta) break
  }

  return { score: bestScore, pv: bestPV }
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
): SearchResult {
  if (cancelSignal?.cancelled) return { score: 0, pv: [] }
  if (state.status === 'finished') {
    return { score: evalFn(state, rules), pv: [] }
  }
  if (depth === 0) {
    return quiesceDepth && quiesceDepth > 0
      ? quiesce(state, 0, -Infinity, +Infinity, rules, evalFn, cancelSignal)
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
    const child = applyMove(state, pit, rules)
    const childMove = child.moveHistory[child.moveHistory.length - 1]
    const result = minimax(child, depth - 1, rules, evalFn, cancelSignal, undefined, quiesceDepth)
    const score = childMove?.wasExtraTurn ? result.score : -result.score

    if (rootScores !== undefined) {
      rootScores[pit] = score
    }

    if (score > bestScore) {
      bestScore = score
      bestPV = [pit, ...result.pv]
    }
  }

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
): SearchResult {
  if (cancelSignal?.cancelled) return { score: 0, pv: [] }
  if (state.status === 'finished') {
    return { score: evalFn(state, rules), pv: [] }
  }
  if (depth === 0) {
    return quiesceDepth && quiesceDepth > 0
      ? quiesce(state, 0, alpha, beta, rules, evalFn, cancelSignal)
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
    const child = applyMove(state, pit, rules)
    const childMove = child.moveHistory[child.moveHistory.length - 1]
    const result = minimaxWithAB(child, depth - 1, -beta, -alpha, rules, evalFn, cancelSignal, undefined, quiesceDepth)
    const score = childMove?.wasExtraTurn ? result.score : -result.score

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
): SearchResult {
  if (cancelSignal?.cancelled) return { score: 0, pv: [] }

  const originalAlpha = alpha
  const originalBeta = beta

  const hash = tt.computeHash(state)
  const entry = tt.get(hash)
  let ttBestMove: number | undefined

  if (entry && entry.depth >= depth) {
    if (entry.flag === 'exact') {
      return { score: entry.score, pv: [entry.bestMove] }
    }
    if (entry.flag === 'lower' && entry.score > alpha) {
      alpha = entry.score
      ttBestMove = entry.bestMove
    }
    if (entry.flag === 'upper' && entry.score < beta) {
      beta = entry.score
      ttBestMove = entry.bestMove
    }
    if (alpha >= beta) {
      return { score: entry.score, pv: [entry.bestMove] }
    }
  }

  if (state.status === 'finished') {
    return { score: evalFn(state, rules), pv: [] }
  }
  if (depth === 0) {
    return quiesceDepth && quiesceDepth > 0
      ? quiesce(state, 0, alpha, beta, rules, evalFn, cancelSignal)
      : { score: evalFn(state, rules), pv: [] }
  }

  const moves = legalMoves(state, rules)
  if (moves.length === 0) {
    return { score: evalFn(state, rules), pv: [] }
  }

  const ordered = orderMoves(moves, state, rules, ttBestMove)
  let bestScore = -Infinity
  let bestPV: number[] = []

  for (const pit of ordered) {
    if (cancelSignal?.cancelled) break
    const child = applyMove(state, pit, rules)
    const childMove = child.moveHistory[child.moveHistory.length - 1]
    const result = minimaxWithABTT(child, depth - 1, -beta, -alpha, rules, evalFn, tt, cancelSignal, undefined, quiesceDepth)
    const score = childMove?.wasExtraTurn ? result.score : -result.score

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

  // Store in TT
  const bestMove = bestPV[0]
  if (bestMove !== undefined) {
    let flag: TTEntry['flag']
    if (bestScore <= originalAlpha) {
      flag = 'upper'
    } else if (bestScore >= originalBeta) {
      flag = 'lower'
    } else {
      flag = 'exact'
    }
    tt.set(hash, { score: bestScore, depth, flag, bestMove })
  }

  return { score: bestScore, pv: bestPV }
}

// ── Iterative Deepening (synchronous, called between async yields) ──────

export function iterativeDeepening(
  state: GameState,
  timeBudgetMs: number,
  rules: RuleConfig,
  evalFn: EvaluationFn,
  tt: TranspositionTable | null,
  cancelSignal?: CancelSignal,
  quiesceDepth?: number,
): IterativeResult {
  const startTime = performance.now()
  let bestResult: IterativeResult = { score: 0, pv: [], depth: 0, rootScores: {} }

  for (let depth = 1; ; depth++) {
    if (cancelSignal?.cancelled) break
    if (performance.now() - startTime >= timeBudgetMs) break

    const rootScores: Record<number, number> = {}
    let result: SearchResult
    if (tt) {
      result = minimaxWithABTT(state, depth, -Infinity, +Infinity, rules, evalFn, tt, cancelSignal, rootScores, quiesceDepth)
    } else {
      result = minimaxWithAB(state, depth, -Infinity, +Infinity, rules, evalFn, cancelSignal, rootScores, quiesceDepth)
    }

    if (cancelSignal?.cancelled) break

    bestResult = { score: result.score, pv: result.pv, depth, rootScores }

    if (bestResult.score > 9000) break
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
): IterativeResult {
  const tt = new TranspositionTable()
  return iterativeDeepening(state, timeBudgetMs, rules, evaluateExpert, tt, cancelSignal)
}

export { minimax, minimaxWithAB, minimaxWithABTT }
