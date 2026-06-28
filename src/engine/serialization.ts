import type { GameState, Side } from './types'

export function encodeState(state: GameState): string {
  const parts = [
    state.board.join(','),
    state.currentPlayer === 'bottom' ? 'b' : 't',
    state.status === 'in-progress' ? 'i' : 'f',
    state.winner === null
      ? 'n'
      : state.winner === 'bottom'
        ? 'b'
        : state.winner === 'top'
          ? 't'
          : 'd',
  ]
  return btoa(parts.join('|'))
}

export function decodeState(encoded: string): GameState {
  const decoded = atob(encoded)
  const parts = decoded.split('|')
  const board = parts[0]!.split(',').map(Number)
  const currentPlayer: Side = parts[1] === 'b' ? 'bottom' : 'top'
  const status: GameState['status'] = parts[2] === 'i' ? 'in-progress' : 'finished'
  const winnerRaw = parts[3]!
  const winner: GameState['winner'] =
    winnerRaw === 'n'
      ? null
      : winnerRaw === 'b'
        ? 'bottom'
        : winnerRaw === 't'
          ? 'top'
          : 'draw'

  return {
    board,
    currentPlayer,
    status,
    winner,
    moveHistory: [],
  }
}
