import type { GameState, RuleConfig, Side } from '../engine'
import { BOTTOM_STORE, TOP_STORE } from '../engine'
import { legalMoves, applyMove } from '../engine'

const WIN_SCORE = 10000
const MAX_PLY = 1000

function terminalScore(state: GameState): number | null {
  if (state.status !== 'finished') return null
  if (state.winner === 'draw') return 0
  return state.winner === state.currentPlayer ? WIN_SCORE : -WIN_SCORE
}

function storeDifference(state: GameState): number {
  const ownStore = state.currentPlayer === 'bottom' ? BOTTOM_STORE : TOP_STORE
  const oppStore = state.currentPlayer === 'bottom' ? TOP_STORE : BOTTOM_STORE
  return (state.board[ownStore] ?? 0) - (state.board[oppStore] ?? 0)
}

function countLegalMoves(board: number[], player: Side, pitsPerSide: number): number {
  const start = player === 'bottom' ? 0 : pitsPerSide + 1
  const end = player === 'bottom' ? pitsPerSide - 1 : pitsPerSide * 2
  let count = 0
  for (let i = start; i <= end; i++) {
    if (board[i] !== 0) count++
  }
  return count
}

function mobilityScore(state: GameState, rules: RuleConfig): number {
  const opponent: Side = state.currentPlayer === 'bottom' ? 'top' : 'bottom'
  const myMoves = countLegalMoves(state.board, state.currentPlayer, rules.pitsPerSide)
  const oppMoves = countLegalMoves(state.board, opponent, rules.pitsPerSide)
  return myMoves - oppMoves
}

function emptyPitSetupScore(state: GameState, rules: RuleConfig): number {
  const ownStart = state.currentPlayer === 'bottom' ? 0 : rules.pitsPerSide + 1
  const ownEnd = state.currentPlayer === 'bottom' ? rules.pitsPerSide - 1 : rules.pitsPerSide * 2

  let score = 0
  for (let i = ownStart; i <= ownEnd; i++) {
    if ((state.board[i] ?? 0) === 0) {
      const oppIdx = rules.pitsPerSide * 2 - i
      const oppStones = state.board[oppIdx] ?? 0
      if (oppStones > 0) {
        score += oppStones * 0.6
      }
    }
  }
  return Math.min(score, 10)
}

function maxOwnCapture(state: GameState, rules: RuleConfig): number {
  const moves = legalMoves(state, rules)
  let maxCapture = 0
  for (const pit of moves) {
    const child = applyMove(state, pit, rules)
    const move = child.moveHistory[child.moveHistory.length - 1]
    if (move?.captured && move.captured.count > maxCapture) {
      maxCapture = move.captured.count
    }
  }
  return maxCapture
}

function maxOppCaptureThreat(state: GameState, rules: RuleConfig): number {
  const opponent: Side = state.currentPlayer === 'bottom' ? 'top' : 'bottom'
  const oppState: GameState = { ...state, currentPlayer: opponent }
  const moves = legalMoves(oppState, rules)
  let maxCapture = 0
  for (const pit of moves) {
    const child = applyMove(oppState, pit, rules)
    const move = child.moveHistory[child.moveHistory.length - 1]
    if (move?.captured && move.captured.count > maxCapture) {
      maxCapture = move.captured.count
    }
  }
  return maxCapture
}

function extraTurnMovesAvailable(state: GameState, rules: RuleConfig): number {
  const { pitsPerSide } = rules
  const player = state.currentPlayer
  const totalSowPositions = 2 * pitsPerSide + 1
  const ownStoreSowIndex = pitsPerSide

  const start = player === 'bottom' ? 0 : pitsPerSide + 1
  const end = player === 'bottom' ? pitsPerSide - 1 : pitsPerSide * 2

  let count = 0
  for (let i = start; i <= end; i++) {
    const stones = state.board[i] ?? 0
    if (stones === 0) continue
    const startIdx = player === 'bottom' ? i : i - pitsPerSide - 1
    if ((startIdx + stones) % totalSowPositions === ownStoreSowIndex) {
      count++
    }
  }
  return count
}

function stonesInOwnPitsFlat(state: GameState, rules: RuleConfig): number {
  const start = state.currentPlayer === 'bottom' ? 0 : rules.pitsPerSide + 1
  const end = state.currentPlayer === 'bottom' ? rules.pitsPerSide - 1 : rules.pitsPerSide * 2
  let sum = 0
  for (let i = start; i <= end; i++) {
    sum += state.board[i] ?? 0
  }
  return sum
}

function hasCaptureMove(state: GameState, rules: RuleConfig): boolean {
  const moves = legalMoves(state, rules)
  for (const pit of moves) {
    const child = applyMove(state, pit, rules)
    const move = child.moveHistory[child.moveHistory.length - 1]
    if (move?.captured) return true
  }
  return false
}

// ── EvalWeights ───────────────────────────────────────────────────────────

export interface EvalWeights {
  storeDiff: number
  mobility: number
  pitStones: number[]
  ownCapturePerStone: number
  oppCaptureThreatPerStone: number
  extraTurnMove: number
  emptyPitSetup: number
}

export const DEFAULT_WEIGHTS: EvalWeights = {
  storeDiff: 1.0,
  mobility: 0.3,
  pitStones: [0.08, 0.08, 0.08, 0.08, 0.08, 0.08],
  ownCapturePerStone: 2.0,
  oppCaptureThreatPerStone: 0,
  extraTurnMove: 0,
  emptyPitSetup: 0.2,
}

// ── Parameterized expert evaluation ──────────────────────────────────────

export function evaluateExpert(
  state: GameState,
  rules: RuleConfig,
  weights: EvalWeights = DEFAULT_WEIGHTS,
): number {
  const term = terminalScore(state)
  if (term !== null) return term

  let score = 0
  score += weights.storeDiff * storeDifference(state)
  score += weights.mobility * mobilityScore(state, rules)

  const ownStart = state.currentPlayer === 'bottom' ? 0 : rules.pitsPerSide + 1
  const ownEnd = state.currentPlayer === 'bottom' ? rules.pitsPerSide - 1 : rules.pitsPerSide * 2
  for (let i = ownStart; i <= ownEnd; i++) {
    const stones = state.board[i] ?? 0
    const weightIdx = ownEnd - i
    score += (weights.pitStones[weightIdx] ?? 0) * stones
  }

  score += weights.ownCapturePerStone * maxOwnCapture(state, rules)

  if (weights.oppCaptureThreatPerStone !== 0) {
    score -= weights.oppCaptureThreatPerStone * maxOppCaptureThreat(state, rules)
  }

  score += weights.extraTurnMove * extraTurnMovesAvailable(state, rules)
  score += weights.emptyPitSetup * emptyPitSetupScore(state, rules)

  return score
}

// ── Legacy evaluation functions (kept for equivalence testing) ───────────

export function evaluateExpertLegacy(state: GameState, rules: RuleConfig): number {
  const term = terminalScore(state)
  if (term !== null) return term
  let score = storeDifference(state)
  score += 0.3 * mobilityScore(state, rules)
  score += 0.08 * stonesInOwnPitsFlat(state, rules)
  score += hasCaptureMove(state, rules) ? 4.0 : 0
  score += 0.2 * emptyPitSetupScore(state, rules)
  return score
}

// ── Simple and Strong evaluators ─────────────────────────────────────────

export type EvaluationFn = (state: GameState, rules: RuleConfig) => number

export function evaluateSimple(state: GameState, _rules: RuleConfig): number {
  const term = terminalScore(state)
  if (term !== null) return term
  return storeDifference(state)
}

export function evaluateStrong(state: GameState, rules: RuleConfig): number {
  const term = terminalScore(state)
  if (term !== null) return term
  let score = storeDifference(state)
  score += 0.3 * mobilityScore(state, rules)
  score += 0.08 * stonesInOwnPitsFlat(state, rules)
  score += hasCaptureMove(state, rules) ? 3.0 : 0
  return score
}

export { terminalScore, WIN_SCORE, MAX_PLY }
export { extraTurnMovesAvailable }
