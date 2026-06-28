import { describe, it, expect } from 'vitest'
import {
  evaluateSimple,
  evaluateStrong,
  evaluateExpert,
  WIN_SCORE,
} from '../evaluation'
import { createInitialState } from '../../engine'
import { BOTTOM_STORE, TOP_STORE } from '../../engine'
import type { GameState } from '../../engine'

function makeBoard(values: number[]): number[] {
  const board = new Array<number>(14).fill(0)
  for (let i = 0; i < values.length && i < 14; i++) {
    board[i] = values[i]!
  }
  return board
}

function makeState(overrides: Partial<GameState> & { board: number[] }): GameState {
  return {
    currentPlayer: 'bottom',
    status: 'in-progress',
    winner: null,
    moveHistory: [],
    ...overrides,
  }
}

describe('evaluateSimple', () => {
  it('returns 0 for initial balanced state', () => {
    const state = createInitialState()
    expect(evaluateSimple(state, { pitsPerSide: 6, stonesPerPit: 4, extraTurnEnabled: true, captureRule: 'kalah-standard' })).toBe(0)
  })

  it('positive when own store > opponent store', () => {
    const board = makeBoard([0, 0, 0, 0, 0, 0])
    board[BOTTOM_STORE] = 10
    board[TOP_STORE] = 3
    const state = makeState({ board, currentPlayer: 'bottom' })
    expect(evaluateSimple(state, { pitsPerSide: 6, stonesPerPit: 4, extraTurnEnabled: true, captureRule: 'kalah-standard' })).toBe(7)
  })

  it('negative when own store < opponent store', () => {
    const board = makeBoard([0, 0, 0, 0, 0, 0])
    board[BOTTOM_STORE] = 2
    board[TOP_STORE] = 8
    const state = makeState({ board, currentPlayer: 'bottom' })
    expect(evaluateSimple(state, { pitsPerSide: 6, stonesPerPit: 4, extraTurnEnabled: true, captureRule: 'kalah-standard' })).toBe(-6)
  })

  it('returns WIN_SCORE when current player won', () => {
    const board = makeBoard([0, 0, 0, 0, 0, 0])
    board[BOTTOM_STORE] = 30
    board[TOP_STORE] = 18
    const state = makeState({ board, status: 'finished', winner: 'bottom', currentPlayer: 'bottom' })
    expect(evaluateSimple(state, { pitsPerSide: 6, stonesPerPit: 4, extraTurnEnabled: true, captureRule: 'kalah-standard' })).toBe(WIN_SCORE)
  })

  it('returns -WIN_SCORE when current player lost', () => {
    const board = makeBoard([0, 0, 0, 0, 0, 0])
    board[BOTTOM_STORE] = 18
    board[TOP_STORE] = 30
    const state = makeState({ board, status: 'finished', winner: 'top', currentPlayer: 'bottom' })
    expect(evaluateSimple(state, { pitsPerSide: 6, stonesPerPit: 4, extraTurnEnabled: true, captureRule: 'kalah-standard' })).toBe(-WIN_SCORE)
  })

  it('returns 0 for draw', () => {
    const board = makeBoard([0, 0, 0, 0, 0, 0])
    board[BOTTOM_STORE] = 24
    board[TOP_STORE] = 24
    const state = makeState({ board, status: 'finished', winner: 'draw', currentPlayer: 'bottom' })
    expect(evaluateSimple(state, { pitsPerSide: 6, stonesPerPit: 4, extraTurnEnabled: true, captureRule: 'kalah-standard' })).toBe(0)
  })

  it('from top player perspective', () => {
    const board = makeBoard([0, 0, 0, 0, 0, 0])
    board[BOTTOM_STORE] = 10
    board[TOP_STORE] = 5
    const state = makeState({ board, currentPlayer: 'top' })
    expect(evaluateSimple(state, { pitsPerSide: 6, stonesPerPit: 4, extraTurnEnabled: true, captureRule: 'kalah-standard' })).toBe(-5)
  })
})

describe('evaluateStrong', () => {
  it('includes store difference', () => {
    const board = makeBoard([0, 0, 0, 0, 0, 0])
    board[BOTTOM_STORE] = 10
    board[TOP_STORE] = 3
    board[7] = 1
    board[8] = 1
    const state = makeState({ board, currentPlayer: 'bottom' })
    const score = evaluateStrong(state, { pitsPerSide: 6, stonesPerPit: 4, extraTurnEnabled: true, captureRule: 'kalah-standard' })
    expect(score).toBeGreaterThan(6)
  })

  it('evaluates capture opportunity as bonus', () => {
    const board = makeBoard([1, 0, 0, 0, 0, 0])
    board[7] = 1
    board[8] = 1
    board[9] = 1
    board[10] = 1
    board[11] = 4
    board[12] = 1
    board[BOTTOM_STORE] = 0
    const state = makeState({ board, currentPlayer: 'bottom' })
    const scoreWithCapture = evaluateStrong(state, { pitsPerSide: 6, stonesPerPit: 4, extraTurnEnabled: true, captureRule: 'kalah-standard' })

    // Same state without opposite stones → no capture possible
    const board2 = makeBoard([1, 0, 0, 0, 0, 0])
    board2[7] = 1
    board2[8] = 1
    board2[9] = 1
    board2[10] = 1
    board2[11] = 0
    board2[12] = 1
    board2[BOTTOM_STORE] = 0
    const state2 = makeState({ board: board2, currentPlayer: 'bottom' })
    const scoreWithoutCapture = evaluateStrong(state2, { pitsPerSide: 6, stonesPerPit: 4, extraTurnEnabled: true, captureRule: 'kalah-standard' })

    expect(scoreWithCapture).toBeGreaterThan(scoreWithoutCapture)
  })

  it('considers mobility advantage', () => {
    const board = makeBoard([4, 4, 4, 4, 4, 4])
    board[7] = 0
    board[8] = 0
    board[9] = 0
    board[10] = 0
    board[11] = 0
    board[12] = 1
    board[BOTTOM_STORE] = 0
    board[TOP_STORE] = 10

    const state = makeState({ board, currentPlayer: 'bottom' })
    const score = evaluateStrong(state, { pitsPerSide: 6, stonesPerPit: 4, extraTurnEnabled: true, captureRule: 'kalah-standard' })
    // Bottom has more mobility and store diff is -10, mobility advantage from 6 vs 1 moves = +1.5, plus stones bonus
    expect(score).toBeGreaterThan(-15)
  })
})

describe('evaluateExpert', () => {
  it('gives bonus for empty pits with opposite stones (capture setup)', () => {
    const board = makeBoard([0, 4, 4, 4, 4, 4])
    board[7] = 5
    board[8] = 4
    board[9] = 4
    board[10] = 4
    board[11] = 4
    board[12] = 5
    board[BOTTOM_STORE] = 0
    board[TOP_STORE] = 0

    // Pit 0 is empty, opposite pit 12 has stones → potential capture
    const state = makeState({ board, currentPlayer: 'bottom' })
    const expertScore = evaluateExpert(state, { pitsPerSide: 6, stonesPerPit: 4, extraTurnEnabled: true, captureRule: 'kalah-standard' })
    const strongScore = evaluateStrong(state, { pitsPerSide: 6, stonesPerPit: 4, extraTurnEnabled: true, captureRule: 'kalah-standard' })

    // Expert should score higher due to empty-pit-setup bonus
    expect(expertScore).toBeGreaterThan(strongScore)
  })

  it('empty-pit bonus adds to expert score relative to strong', () => {
    // Position with empty pit 0, opposite pit 12 has stones → capture setup
    const boardWith = makeBoard([0, 4, 4, 4, 4, 4])
    boardWith[7] = 4
    boardWith[8] = 4
    boardWith[9] = 4
    boardWith[10] = 4
    boardWith[11] = 4
    boardWith[12] = 5
    boardWith[BOTTOM_STORE] = 0
    boardWith[TOP_STORE] = 0
    const stateWith = makeState({ board: boardWith, currentPlayer: 'bottom' })
    const expertWith = evaluateExpert(stateWith, { pitsPerSide: 6, stonesPerPit: 4, extraTurnEnabled: true, captureRule: 'kalah-standard' })
    const strongWith = evaluateStrong(stateWith, { pitsPerSide: 6, stonesPerPit: 4, extraTurnEnabled: true, captureRule: 'kalah-standard' })

    // Position without capture setup (both pits 0 and 12 empty)
    const boardWithout = makeBoard([0, 4, 4, 4, 4, 4])
    boardWithout[7] = 4
    boardWithout[8] = 4
    boardWithout[9] = 4
    boardWithout[10] = 4
    boardWithout[11] = 4
    boardWithout[12] = 0
    boardWithout[BOTTOM_STORE] = 0
    boardWithout[TOP_STORE] = 0
    const stateWithout = makeState({ board: boardWithout, currentPlayer: 'bottom' })
    const expertWithout = evaluateExpert(stateWithout, { pitsPerSide: 6, stonesPerPit: 4, extraTurnEnabled: true, captureRule: 'kalah-standard' })
    const strongWithout = evaluateStrong(stateWithout, { pitsPerSide: 6, stonesPerPit: 4, extraTurnEnabled: true, captureRule: 'kalah-standard' })

    // The expert advantage (expert - strong) should be larger when capture setups exist
    const advantageWith = expertWith - strongWith
    const advantageWithout = expertWithout - strongWithout
    expect(advantageWith).toBeGreaterThan(advantageWithout)
  })
})
