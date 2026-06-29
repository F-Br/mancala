import type { GameState, Move, GameStatus, Side } from './types'
import { KALAH_STANDARD } from './rules'
import { createInitialState } from './state'
import { legalMoves, applyMove } from './moves'

const BOTTOM_PIT_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f']
const TOP_PIT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

export function moveToNotation(move: Move): string {
  const pitIndex = move.pitIndex
  let letter: string

  if (pitIndex < 6) {
    letter = BOTTOM_PIT_LETTERS[pitIndex] ?? '?'
  } else {
    letter = TOP_PIT_LETTERS[pitIndex - 7] ?? '?'
  }

  let suffix = ''
  if (move.captured) suffix += 'x'
  if (move.wasExtraTurn) suffix += '*'

  return letter + suffix
}

export function notationToMove(state: GameState, str: string): Move | null {
  const match = str.match(/^([a-fA-F])([x*]*)$/)
  if (!match) return null

  const letter = match[1]!
  const isUpper = letter >= 'A' && letter <= 'F'

  let pitIndex: number
  if (isUpper) {
    pitIndex = 7 + (letter.charCodeAt(0) - 'A'.charCodeAt(0))
  } else {
    pitIndex = letter.charCodeAt(0) - 'a'.charCodeAt(0)
  }

  if (!legalMoves(state).includes(pitIndex)) return null

  const newState = applyMove(state, pitIndex)
  const move = newState.moveHistory[newState.moveHistory.length - 1]
  return move ?? null
}

function encodeHeader(state: GameState): string {
  const boardStr = state.board.join(',')
  const playerChar = state.currentPlayer === 'bottom' ? 'b' : 't'
  const statusChar = state.status === 'finished' ? 'f' : 'i'
  const winnerRaw = state.winner
  const winnerChar =
    winnerRaw === null ? 'n' : winnerRaw === 'bottom' ? 'b' : winnerRaw === 'top' ? 't' : 'd'
  return `[${boardStr}|${playerChar}|${statusChar}|${winnerChar}]`
}

function decodeHeader(inner: string): GameState {
  const parts = inner.split('|')
  const board = parts[0]!.split(',').map(Number)
  const currentPlayer: Side = parts[1] === 'b' ? 'bottom' : 'top'
  const status: GameStatus = parts[2] === 'f' ? 'finished' : 'in-progress'
  const winnerRaw = parts[3]!
  const winner: GameState['winner'] =
    winnerRaw === 'n' ? null : winnerRaw === 'b' ? 'bottom' : winnerRaw === 't' ? 'top' : 'draw'

  return {
    board,
    currentPlayer,
    status,
    winner,
    moveHistory: [],
  }
}

export function gameToText(state: GameState): string {
  // Try to replay from standard initial state.
  const initial = createInitialState(KALAH_STANDARD, 'bottom')
  let replayed = initial
  let canReplayFromStandard = true

  for (const move of state.moveHistory) {
    if (!legalMoves(replayed).includes(move.pitIndex)) {
      canReplayFromStandard = false
      break
    }
    replayed = applyMove(replayed, move.pitIndex)
  }

  // Verify the replay arrived at the same state
  if (
    canReplayFromStandard &&
    !(
      replayed.board.length === state.board.length &&
      replayed.board.every((v, i) => v === state.board[i]) &&
      replayed.currentPlayer === state.currentPlayer &&
      replayed.status === state.status &&
      replayed.winner === state.winner
    )
  ) {
    canReplayFromStandard = false
  }

  const lines: string[] = []
  if (canReplayFromStandard && state.moveHistory.length > 0) {
    lines.push(encodeHeader(initial))
    for (const move of state.moveHistory) {
      lines.push(moveToNotation(move))
    }
  } else {
    // Custom board or empty move history — encode current state directly
    lines.push(encodeHeader(state))
  }
  return lines.join('\n')
}

export function parseGameText(str: string): GameState {
  const lines = str
    .trim()
    .split('\n')
    .filter((l) => l.length > 0)
  if (lines.length === 0) return createInitialState(KALAH_STANDARD, 'bottom')

  const headerLine = lines[0]!

  const headerMatch = headerLine.match(/^\[([^\]]+)\]$/)
  if (!headerMatch) return createInitialState(KALAH_STANDARD, 'bottom')

  let state = decodeHeader(headerMatch[1]!)

  // Replay moves from the header's initial state
  for (let i = 1; i < lines.length; i++) {
    const move = notationToMove(state, lines[i]!)
    if (!move) break
    state = applyMove(state, move.pitIndex)
  }

  return state
}
