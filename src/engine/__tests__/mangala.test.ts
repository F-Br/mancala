import { describe, it, expect } from 'vitest'
import {
  createInitialState,
  applyMove,
  legalMoves,
  MANGALA_STANDARD,
  BOTTOM_STORE,
  TOP_STORE,
} from '../index'
import type { GameState } from '../index'

function makeState(overrides: Partial<GameState> & { board: number[] }): GameState {
  return {
    currentPlayer: 'bottom',
    status: 'in-progress',
    winner: null,
    moveHistory: [],
    ...overrides,
  }
}

function boardSum(board: number[]): number {
  return board.reduce((a, b) => a + b, 0)
}

describe('Mangala — include-source sowing', () => {
  it('S1: basic include-source sowing from pit 2 (4 stones)', () => {
    const state = createInitialState(MANGALA_STANDARD)
    const result = applyMove(state, 2, MANGALA_STANDARD)

    expect(result.board).toEqual([4, 4, 1, 5, 5, 5, 0, 4, 4, 4, 4, 4, 4, 0])
    expect(result.currentPlayer).toBe('top')
    expect(result.status).toBe('in-progress')

    const move = result.moveHistory[0]!
    expect(move.sowedTo).toEqual([2, 3, 4, 5])
    expect(move.captured).toBeNull()
    expect(move.wasExtraTurn).toBe(false)
  })

  it('S3: two-stone include-source gives extra turn', () => {
    const board = [1, 1, 1, 1, 1, 2, 5, 4, 4, 4, 4, 4, 4, 12]
    const state = makeState({ board, currentPlayer: 'bottom' })
    const result = applyMove(state, 5, MANGALA_STANDARD)

    expect(result.board[5]).toBe(1)
    expect(result.board[BOTTOM_STORE]).toBe(6)
    expect(result.currentPlayer).toBe('bottom')
    expect(result.status).toBe('in-progress')

    const move = result.moveHistory[0]!
    expect(move.wasExtraTurn).toBe(true)
  })
})

describe('Mangala — captures', () => {
  it('S4b: odd value on opponent pit means no capture', () => {
    const board = [0, 0, 0, 0, 0, 3, 0, 2, 0, 0, 0, 0, 0, 0]
    const state = makeState({ board, currentPlayer: 'bottom' })
    const result = applyMove(state, 5, MANGALA_STANDARD)

    expect(result.board[7]).toBe(3)
    expect(result.status).toBe('in-progress')
    expect(result.currentPlayer).toBe('top')

    const move = result.moveHistory[0]!
    expect(move.captured).toBeNull()
  })

  it('S5: own empty-pit capture under include-source', () => {
    const board = [0, 0, 0, 2, 0, 0, 0, 0, 5, 0, 0, 0, 1, 0]
    const state = makeState({ board, currentPlayer: 'bottom' })
    const result = applyMove(state, 3, MANGALA_STANDARD)

    expect(result.board).toEqual([0, 0, 0, 1, 0, 0, 6, 0, 0, 0, 0, 0, 1, 0])
    expect(result.status).toBe('in-progress')
    expect(result.currentPlayer).toBe('top')

    const move = result.moveHistory[0]!
    expect(move.captured).toEqual({ fromPit: 8, count: 6 })
  })

  it('S6: wrap-around skipping opponent store, capture includes just-sown stone', () => {
    const board = [0, 0, 0, 0, 0, 9, 0, 1, 1, 1, 1, 1, 1, 0]
    const state = makeState({ board, currentPlayer: 'bottom' })
    const result = applyMove(state, 5, MANGALA_STANDARD)

    expect(result.board).toEqual([0, 0, 0, 0, 0, 1, 4, 2, 2, 2, 2, 2, 0, 0])
    expect(result.status).toBe('in-progress')
  })
})

describe('Mangala — end sweep (reversed)', () => {
  it('S2: single-stone into store, emptied-player sweep, extra-turn moot', () => {
    const board = [0, 0, 0, 0, 0, 1, 10, 4, 4, 4, 4, 4, 4, 13]
    const state = makeState({ board, currentPlayer: 'bottom' })
    const result = applyMove(state, 5, MANGALA_STANDARD)

    expect(result.board).toEqual([0, 0, 0, 0, 0, 0, 35, 0, 0, 0, 0, 0, 0, 13])
    expect(result.status).toBe('finished')
    expect(result.winner).toBe('bottom')
  })

  it('S4: even-capture triggers reversed sweep', () => {
    const board = [0, 0, 0, 0, 0, 3, 0, 1, 0, 0, 0, 0, 0, 0]
    const state = makeState({ board, currentPlayer: 'bottom' })
    const result = applyMove(state, 5, MANGALA_STANDARD)

    expect(result.board).toEqual([0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 1])
    expect(result.status).toBe('finished')
    expect(result.winner).toBe('bottom')
  })

  it('S7: opponent capture empties your side — you sweep', () => {
    const board = [1, 0, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0, 3, 10]
    const state = makeState({ board, currentPlayer: 'top' })
    const result = applyMove(state, 12, MANGALA_STANDARD)

    expect(result.board).toEqual([0, 0, 0, 0, 0, 0, 11, 0, 0, 0, 0, 0, 0, 13])
    expect(result.status).toBe('finished')
    expect(result.winner).toBe('top')
  })

  it('S8: both sides empty after one move — no sweep', () => {
    const board = [0, 0, 0, 0, 1, 0, 20, 2, 0, 0, 0, 0, 0, 25]
    const state = makeState({ board, currentPlayer: 'bottom' })
    const result = applyMove(state, 4, MANGALA_STANDARD)

    expect(result.board).toEqual([0, 0, 0, 0, 0, 0, 23, 0, 0, 0, 0, 0, 0, 25])
    expect(result.status).toBe('finished')
    expect(result.winner).toBe('top')
  })

  it('S9: draw at 24—24', () => {
    const board = [0, 0, 0, 0, 1, 0, 22, 1, 0, 0, 0, 0, 0, 24]
    const state = makeState({ board, currentPlayer: 'bottom' })
    const result = applyMove(state, 4, MANGALA_STANDARD)

    expect(result.board[BOTTOM_STORE]).toBe(24)
    expect(result.board[TOP_STORE]).toBe(24)
    expect(result.status).toBe('finished')
    expect(result.winner).toBe('draw')
  })
})

describe('Mangala — conservation and termination (S10)', () => {
  it('100 random games conserves 48 stones and finishes within 500 moves', () => {
    function seededRandom(seed: number): () => number {
      return () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff
        return seed / 0x7fffffff
      }
    }

    for (let g = 0; g < 100; g++) {
      const rng = seededRandom(g * 137 + 1)
      let state = createInitialState(MANGALA_STANDARD)
      let moveCount = 0

      while (state.status !== 'finished' && moveCount < 500) {
        const moves = legalMoves(state, MANGALA_STANDARD)
        if (moves.length === 0) break

        const idx = Math.floor(rng() * moves.length)
        state = applyMove(state, moves[idx]!, MANGALA_STANDARD)
        moveCount++

        expect(boardSum(state.board)).toBe(48)
      }

      expect(state.status).toBe('finished')
      expect(moveCount).toBeLessThan(500)
    }
  })
})
