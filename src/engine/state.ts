import type { GameState, RuleConfig, Side } from './types'
import { BOARD_LENGTH } from './types'
import { KALAH_STANDARD } from './rules'

export function createInitialState(
  rules: RuleConfig = KALAH_STANDARD,
  firstPlayer: Side = 'bottom',
): GameState {
  const board = new Array<number>(BOARD_LENGTH).fill(0)
  const { pitsPerSide, stonesPerPit } = rules

  for (let i = 0; i < pitsPerSide; i++) {
    board[i] = stonesPerPit
  }
  for (let i = pitsPerSide + 1; i < pitsPerSide * 2 + 1; i++) {
    board[i] = stonesPerPit
  }

  return {
    board,
    currentPlayer: firstPlayer,
    status: 'in-progress',
    winner: null,
    moveHistory: [],
  }
}

export function cloneState(state: GameState): GameState {
  return {
    board: [...state.board],
    currentPlayer: state.currentPlayer,
    status: state.status,
    winner: state.winner,
    moveHistory: state.moveHistory.map((m) => ({
      ...m,
      sowedTo: [...m.sowedTo],
      captured: m.captured ? { fromPit: m.captured.fromPit, count: m.captured.count } : null,
    })),
  }
}
