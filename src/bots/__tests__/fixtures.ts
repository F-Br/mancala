import { createInitialState, applyMove, legalMoves } from '../../engine'
import { KALAH_STANDARD } from '../../engine'
import type { GameState } from '../../engine'

export const RULES = KALAH_STANDARD

function applySequence(moves: number[]): GameState {
  let state: GameState = createInitialState()
  for (const pit of moves) {
    const legal = legalMoves(state, RULES)
    if (!legal.includes(pit)) {
      throw new Error(`Illegal move ${pit} at board ${JSON.stringify(state.board)}, legal: [${legal.join(',')}]`)
    }
    state = applyMove(state, pit, RULES)
  }
  return state
}

export const initialFixture: GameState = createInitialState()

// Mid-game position 1: 35 stones, top to move, pit 11 is an extra-turn move
// Sequence found by random exploration
export const midGameFixture1: GameState = applySequence([2, 5, 11, 0, 12, 1, 8, 4])

// Mid-game position 2: 35 stones, bottom to move, pit 5 is an extra-turn move
// Sequence found by random exploration
export const midGameFixture2: GameState = applySequence([5, 8, 9, 1, 2, 10, 2, 7, 12, 3, 7])

// Late-game position: 7 stones on board, top to move, pit 11 is an extra-turn move
// Sequence found by playing an expert-vs-expert game
export const lateGameFixture: GameState = applySequence([
  5, 12, 1, 5, 0, 8, 12, 11, 4, 12, 9, 5, 2, 12, 11, 12, 10, 5, 4, 5, 0, 8, 1, 5, 4, 12, 11, 3, 9,
  5, 4,
])

export function countBoardStones(state: GameState): number {
  let total = 0
  for (let i = 0; i < 14; i++) {
    if (i !== 6 && i !== 13) total += state.board[i]!
  }
  return total
}

export function hasExtraTurnMove(state: GameState): number {
  const moves = legalMoves(state, RULES)
  for (const pit of moves) {
    const child = applyMove(state, pit, RULES)
    const lastMove = child.moveHistory[child.moveHistory.length - 1]
    if (lastMove?.wasExtraTurn) return pit
  }
  return -1
}
