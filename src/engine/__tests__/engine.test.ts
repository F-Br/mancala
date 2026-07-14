import { describe, it, expect } from 'vitest'
import {
  createInitialState,
  cloneState,
  legalMoves,
  applyMove,
  moveToNotation,
  notationToMove,
  gameToText,
  parseGameText,
  encodeState,
  decodeState,
} from '../index'
import type { GameState, RuleConfig } from '../index'
import { BOTTOM_STORE, TOP_STORE } from '../index'

function makeState(overrides: Partial<GameState> & { board: number[] }): GameState {
  return {
    currentPlayer: 'bottom',
    status: 'in-progress',
    winner: null,
    moveHistory: [],
    ...overrides,
  }
}

function makeBoard(values: number[]): number[] {
  const board = new Array<number>(14).fill(0)
  for (let i = 0; i < values.length && i < 14; i++) {
    board[i] = values[i]!
  }
  return board
}

describe('createInitialState', () => {
  it('has 4 stones in each pit, 0 in stores, bottom to move', () => {
    const state = createInitialState()

    expect(state.currentPlayer).toBe('bottom')
    expect(state.status).toBe('in-progress')
    expect(state.winner).toBeNull()
    expect(state.moveHistory).toHaveLength(0)
    expect(state.board).toHaveLength(14)

    for (let i = 0; i < 6; i++) {
      expect(state.board[i]).toBe(4)
    }
    expect(state.board[BOTTOM_STORE]).toBe(0)

    for (let i = 7; i < 13; i++) {
      expect(state.board[i]).toBe(4)
    }
    expect(state.board[TOP_STORE]).toBe(0)
  })

  it('can start with top as first player', () => {
    const state = createInitialState(undefined, 'top')
    expect(state.currentPlayer).toBe('top')
  })

  it('respects custom RuleConfig for stones per pit', () => {
    const customRules: RuleConfig = {
      pitsPerSide: 6,
      stonesPerPit: 3,
      extraTurnEnabled: true,
      captureRule: 'kalah-standard',
    }
    const state = createInitialState(customRules)
    for (let i = 0; i < 6; i++) {
      expect(state.board[i]).toBe(3)
    }
    for (let i = 7; i < 13; i++) {
      expect(state.board[i]).toBe(3)
    }
  })
})

describe('cloneState', () => {
  it('creates a deep copy independent of the original', () => {
    const state = createInitialState()
    const cloned = cloneState(state)

    expect(cloned).toEqual(state)
    expect(cloned).not.toBe(state)
    expect(cloned.board).not.toBe(state.board)
    expect(cloned.moveHistory).not.toBe(state.moveHistory)
  })

  it('deep-copies moveHistory entries', () => {
    const state = applyMove(createInitialState(), 0)
    const cloned = cloneState(state)

    expect(cloned.moveHistory).toEqual(state.moveHistory)
    expect(cloned.moveHistory[0]).not.toBe(state.moveHistory[0])
    expect(cloned.moveHistory[0]!.sowedTo).not.toBe(state.moveHistory[0]!.sowedTo)
  })
})

describe('legalMoves', () => {
  it('returns only non-empty pits on the current player side', () => {
    const state = createInitialState()
    const moves = legalMoves(state)
    expect(moves).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('filters out empty pits', () => {
    const board = makeBoard([0, 4, 0, 4, 0, 0])
    board[7] = 1
    board[8] = 1
    board[9] = 1
    board[10] = 1
    board[11] = 1
    board[12] = 1
    const state = makeState({ board })
    const moves = legalMoves(state)
    expect(moves).toEqual([1, 3])
  })

  it('returns top pits when it is top player turn', () => {
    const board = makeBoard([4, 4, 4, 4, 4, 4])
    board[7] = 5
    board[8] = 4
    board[9] = 0
    board[10] = 4
    board[11] = 3
    board[12] = 4
    const state = makeState({ board, currentPlayer: 'top' })
    const moves = legalMoves(state)
    expect(moves).toEqual([7, 8, 10, 11, 12])
  })

  it('returns empty array when game is finished', () => {
    const state = makeState({
      board: makeBoard([0]),
      status: 'finished',
      winner: 'draw',
    })
    expect(legalMoves(state)).toEqual([])
  })

  it('returns empty array when current player side is entirely empty', () => {
    const board = makeBoard([0, 0, 0, 0, 0, 0])
    board[7] = 4
    board[8] = 4
    board[9] = 4
    board[10] = 4
    board[11] = 4
    board[12] = 4
    const state = makeState({ board, currentPlayer: 'bottom' })
    expect(legalMoves(state)).toEqual([])
  })
})

describe('applyMove — basic sowing', () => {
  it('basic sow from pit 0 with 4 stones lands in pits 1-4', () => {
    const state = createInitialState()
    const result = applyMove(state, 0)

    expect(result.board[0]).toBe(0)
    expect(result.board[1]).toBe(5)
    expect(result.board[2]).toBe(5)
    expect(result.board[3]).toBe(5)
    expect(result.board[4]).toBe(5)
    expect(result.board[5]).toBe(4)
    expect(result.board[BOTTOM_STORE]).toBe(0)
    expect(result.currentPlayer).toBe('top')

    const move = result.moveHistory[0]!
    expect(move.pitIndex).toBe(0)
    expect(move.sowedTo).toEqual([1, 2, 3, 4])
    expect(move.wasExtraTurn).toBe(false)
    expect(move.captured).toBeNull()
    expect(move.player).toBe('bottom')
  })

  it('sow past your own store: from pit 5 with 4 stones → pits 6, 7, 8, 9', () => {
    const state = createInitialState()
    const result = applyMove(state, 5)

    expect(result.board[5]).toBe(0)
    expect(result.board[6]).toBe(1)
    expect(result.board[7]).toBe(5)
    expect(result.board[8]).toBe(5)
    expect(result.board[9]).toBe(5)
    expect(result.board[10]).toBe(4)

    const move = result.moveHistory[0]!
    expect(move.sowedTo).toEqual([6, 7, 8, 9])
  })

  it('sow skipping opponent store: bottom sows past pit 13', () => {
    // Pit 5 has 8 stones, all other bottom pits + pit 0 have stones to prevent capture/game end
    const board = makeBoard([1, 1, 1, 1, 1, 8])
    board[7] = 2
    board[8] = 2
    board[9] = 2
    board[10] = 2
    board[11] = 2
    board[12] = 2
    board[13] = 5

    const state = makeState({ board, currentPlayer: 'bottom' })
    const result = applyMove(state, 5)

    expect(result.board[13]).toBe(5) // unchanged — skipped

    const move = result.moveHistory[0]!
    expect(move.sowedTo).toEqual([6, 7, 8, 9, 10, 11, 12, 0])
    expect(move.sowedTo).not.toContain(13)
    expect(move.captured).toBeNull()
  })

  it('sow skipping opponent store: top sows past pit 6', () => {
    // Top pit 7 has 8 stones, all other pits have stones to prevent capture/game end
    const board = makeBoard([1, 1, 1, 1, 1, 1])
    board[BOTTOM_STORE] = 5
    board[7] = 8
    board[8] = 1
    board[9] = 1
    board[10] = 1
    board[11] = 1
    board[12] = 1
    board[TOP_STORE] = 0

    const state = makeState({ board, currentPlayer: 'top' })
    const result = applyMove(state, 7)

    expect(result.board[BOTTOM_STORE]).toBe(5)

    const move = result.moveHistory[0]!
    expect(move.sowedTo).not.toContain(6)
    expect(move.sowedTo).toEqual([8, 9, 10, 11, 12, 13, 0, 1])
  })

  it('sow with wrap-around places stones back into source pit (not skipped unlike Oware)', () => {
    // Pit 0 has 14 stones. 14 stones sow: 1,2,...,12,0,1 (skip 13).
    // Source pit 0 receives stone #13 → board[0] = 1 (source is NOT skipped).
    // Last stone lands at pit 1; all pits start with 2 stones so newBoard[1] = 4 (not 1),
    // no capture triggers. We only verify the source pit is included in the sow.
    const board = makeBoard([14, 2, 2, 2, 2, 2])
    board[7] = 2
    board[8] = 2
    board[9] = 2
    board[10] = 2
    board[11] = 2
    board[12] = 2

    const state = makeState({ board, currentPlayer: 'bottom' })
    const result = applyMove(state, 0)

    expect(result.board[0]).toBe(1) // source pit received stone #13
    expect(result.board[1]).toBe(4) // 2 original + stones #1 and #14
    expect(result.board[6]).toBe(1) // stone #6 landed in store

    const move = result.moveHistory[0]!
    expect(move.sowedTo[move.sowedTo.length - 1]).toBe(1) // last stone at pit 1
  })
})

describe('applyMove — extra turn', () => {
  it('extra turn when last stone lands in own store', () => {
    const state = createInitialState()
    const result = applyMove(state, 2)

    expect(result.board[2]).toBe(0)
    expect(result.board[3]).toBe(5)
    expect(result.board[4]).toBe(5)
    expect(result.board[5]).toBe(5)
    expect(result.board[6]).toBe(1)
    expect(result.currentPlayer).toBe('bottom')

    const move = result.moveHistory[0]!
    expect(move.wasExtraTurn).toBe(true)
    expect(move.sowedTo[move.sowedTo.length - 1]).toBe(6)
  })

  it('extra turn for top player landing in top store', () => {
    // Top pit 7 has 6 stones: 8,9,10,11,12,13 → last at 13 (store)
    const board = makeBoard([1, 1, 1, 1, 1, 1])
    board[BOTTOM_STORE] = 0
    board[7] = 6
    board[8] = 1
    board[9] = 1
    board[10] = 1
    board[11] = 1
    board[12] = 1
    board[TOP_STORE] = 0

    const state = makeState({ board, currentPlayer: 'top' })
    const result = applyMove(state, 7)

    expect(result.board[7]).toBe(0)
    expect(result.board[13]).toBe(1)
    expect(result.currentPlayer).toBe('top')

    const move = result.moveHistory[0]!
    expect(move.wasExtraTurn).toBe(true)
    expect(move.sowedTo[move.sowedTo.length - 1]).toBe(13)
  })

  it('no extra turn when extraTurnEnabled is false', () => {
    const noExtraRules: RuleConfig = {
      pitsPerSide: 6,
      stonesPerPit: 4,
      extraTurnEnabled: false,
      captureRule: 'kalah-standard',
    }
    const state = createInitialState(noExtraRules)
    const result = applyMove(state, 2, noExtraRules)

    expect(result.currentPlayer).toBe('top')
    const move = result.moveHistory[0]!
    expect(move.wasExtraTurn).toBe(false)
  })

  it('multiple extra turns in a row', () => {
    // Pit 0: 6 stones → 1,2,3,4,5,6 (store). Pit 1 after: 4+1=5 → 2,3,4,5,6 (store)
    const board = makeBoard([6, 4, 4, 4, 4, 4])
    board[7] = 4
    board[8] = 4
    board[9] = 4
    board[10] = 4
    board[11] = 4
    board[12] = 4

    let state = makeState({ board, currentPlayer: 'bottom' })

    state = applyMove(state, 0)
    expect(state.currentPlayer).toBe('bottom')
    expect(state.moveHistory.length).toBe(1)
    expect(state.moveHistory[0]!.wasExtraTurn).toBe(true)

    state = applyMove(state, 1)
    expect(state.currentPlayer).toBe('bottom')
    expect(state.moveHistory.length).toBe(2)
    expect(state.moveHistory[1]!.wasExtraTurn).toBe(true)
  })
})

describe('applyMove — capture', () => {
  it('capture: last stone into own empty pit with non-empty opposite', () => {
    // Bottom sows from pit 0 (1 stone) into pit 1 (empty)
    // Opposite of pit 1 is pit 11, which has 4 stones
    // Other top pits have stones so game doesn't end
    const board = makeBoard([1, 0, 0, 0, 0, 0])
    board[7] = 1
    board[8] = 1
    board[9] = 1
    board[10] = 1
    board[11] = 4
    board[12] = 1
    board[BOTTOM_STORE] = 0

    const state = makeState({ board, currentPlayer: 'bottom' })
    const result = applyMove(state, 0)

    expect(result.board[0]).toBe(0)
    expect(result.board[1]).toBe(0)
    expect(result.board[11]).toBe(0)
    expect(result.board[BOTTOM_STORE]).toBe(5)

    const move = result.moveHistory[0]!
    expect(move.captured).toEqual({ fromPit: 11, count: 5 })
    expect(move.sowedTo).toEqual([1])
    expect(move.wasExtraTurn).toBe(false)
  })

  it('capture: works for top player as well', () => {
    // Top sows from pit 7 (1 stone) into pit 8 (empty)
    // Opposite of pit 8 is pit 4, which has 3 stones
    // Bottom has other stones so game doesn't end
    const board = makeBoard([0, 0, 0, 0, 3, 1])
    board[BOTTOM_STORE] = 0
    board[7] = 1
    board[8] = 0
    board[9] = 1
    board[10] = 1
    board[11] = 1
    board[12] = 1

    const state = makeState({ board, currentPlayer: 'top' })
    const result = applyMove(state, 7)

    expect(result.board[7]).toBe(0)
    expect(result.board[8]).toBe(0)
    expect(result.board[4]).toBe(0)
    expect(result.board[TOP_STORE]).toBe(4)

    const move = result.moveHistory[0]!
    expect(move.captured).toEqual({ fromPit: 4, count: 4 })
    expect(move.player).toBe('top')
  })

  it('no capture: opposite pit is empty', () => {
    // Bottom sows 1 stone into empty pit 1, opposite (11) also empty
    // Top has stones in other pits so game doesn't end
    const board = makeBoard([1, 0, 0, 0, 0, 0])
    board[7] = 1
    board[8] = 1
    board[9] = 1
    board[10] = 1
    board[11] = 0
    board[12] = 1
    board[BOTTOM_STORE] = 0

    const state = makeState({ board, currentPlayer: 'bottom' })
    const result = applyMove(state, 0)

    expect(result.board[1]).toBe(1)
    expect(result.board[BOTTOM_STORE]).toBe(0)

    const move = result.moveHistory[0]!
    expect(move.captured).toBeNull()
  })

  it('no capture: last stone lands in opponent empty pit', () => {
    // Bottom sows from pit 5 (2 stones): 6, 7. Last lands in pit 7 (top pit)
    // Top has stones elsewhere so game doesn't end
    const board = makeBoard([1, 1, 1, 1, 1, 2])
    board[7] = 0
    board[8] = 1
    board[9] = 1
    board[10] = 1
    board[11] = 1
    board[12] = 1
    board[BOTTOM_STORE] = 0

    const state = makeState({ board, currentPlayer: 'bottom' })
    const result = applyMove(state, 5)

    expect(result.board[7]).toBe(1)
    expect(result.board[BOTTOM_STORE]).toBe(1)

    const move = result.moveHistory[0]!
    expect(move.captured).toBeNull()
  })

  it('no capture: last stone lands in own non-empty pit', () => {
    // Pit 0 with 1 stone → pit 1 which already has stones
    // Top has stones so game doesn't end
    const board = makeBoard([1, 3, 0, 0, 0, 0])
    board[7] = 1
    board[8] = 1
    board[9] = 1
    board[10] = 1
    board[11] = 1
    board[12] = 1
    board[BOTTOM_STORE] = 0

    const state = makeState({ board, currentPlayer: 'bottom' })
    const result = applyMove(state, 0)

    expect(result.board[1]).toBe(4)
    expect(result.board[BOTTOM_STORE]).toBe(0)

    const move = result.moveHistory[0]!
    expect(move.captured).toBeNull()
  })

  it('no capture: last stone lands in own store (extra turn instead)', () => {
    const state = createInitialState()
    const result = applyMove(state, 2)

    expect(result.board[6]).toBe(1)
    expect(result.currentPlayer).toBe('bottom')

    const move = result.moveHistory[0]!
    expect(move.wasExtraTurn).toBe(true)
    expect(move.captured).toBeNull()
  })

  it('no capture when wrap-around deposits multiple stones in landing pit', () => {
    // Pit 0 has 14 stones. Pit 1 empty. Opposite pit 11 has 3 stones.
    // Sow: 14 stones, 13 positions per lap (skip 13).
    // Stones: 1:1, 2:2, ..., 12:12, 13:0, 14:1
    // Pit 1 receives stone #1 and #14 → newBoard[1] = 2.
    // newBoard[1] !== 1 → no capture, stone #1 stays, stone #14 stays.
    const board = makeBoard([14, 0, 0, 0, 0, 0])
    board[7] = 0
    board[8] = 0
    board[9] = 0
    board[10] = 0
    board[11] = 3
    board[12] = 0
    board[BOTTOM_STORE] = 0

    const state = makeState({ board, currentPlayer: 'bottom' })
    const result = applyMove(state, 0)

    // Pit 1 has 2 stones (both from this sow), no capture
    expect(result.board[1]).toBe(2)
    expect(result.board[11]).toBe(4) // 3 original + 1 from this sow — not captured
    expect(result.board[0]).toBe(1) // source received stone #13
    // Stone #6 went to store
    expect(result.board[BOTTOM_STORE]).toBe(1)

    const move = result.moveHistory[0]!
    expect(move.captured).toBeNull()
    expect(move.sowedTo).toHaveLength(14)
    expect(move.sowedTo[13]).toBe(1) // 14th stone at pit 1
  })

  it('capture on source pit when last stone lands there', () => {
    // Pit 0 has 13 stones. Opposite pit 12 has 4 stones.
    // Sow 13 stones: 1,2,3,4,5,6,7,8,9,10,11,12,0 (skip 13).
    // Stone #6 goes to store (+1), stone #12 goes to pit 12 (4→5).
    // Last stone lands at pit 0 (source).
    // newBoard[0] = 1 → capture triggers.
    // Captured: 1 (last at 0) + 5 (opposite pit 12 incl. stone #12) = 6.
    // Store: 1 (stone #6) + 6 = 7 total.
    const board = makeBoard([13, 0, 0, 0, 0, 0])
    board[7] = 0
    board[8] = 0
    board[9] = 0
    board[10] = 0
    board[11] = 0
    board[12] = 4 // opposite of pit 0
    board[BOTTOM_STORE] = 0

    const state = makeState({ board, currentPlayer: 'bottom' })
    const result = applyMove(state, 0)

    expect(result.board[0]).toBe(0) // captured away
    expect(result.board[12]).toBe(0) // opposite captured (4 original + 1 from sow)
    expect(result.board[BOTTOM_STORE]).toBe(7) // 1 (stone #6) + 6 (capture)

    const move = result.moveHistory[0]!
    expect(move.captured).toEqual({ fromPit: 12, count: 6 })
    expect(move.sowedTo).toHaveLength(13)
    expect(move.sowedTo[12]).toBe(0) // 13th stone at pit 0
  })
})

describe('applyMove — game end and sweep', () => {
  it('game end: one side empty triggers final sweep', () => {
    // Bottom has only pit 5 with 1 stone; after sowing it becomes empty
    const board = makeBoard([0, 0, 0, 0, 0, 1])
    for (let i = 7; i <= 12; i++) board[i] = 2
    board[BOTTOM_STORE] = 0
    board[TOP_STORE] = 0

    const state = makeState({ board, currentPlayer: 'bottom' })
    const result = applyMove(state, 5)

    expect(result.status).toBe('finished')
    expect(result.board[BOTTOM_STORE]).toBe(1)
    expect(result.board[TOP_STORE]).toBe(12)
    for (let i = 7; i <= 12; i++) {
      expect(result.board[i]).toBe(0)
    }
    expect(result.winner).toBe('top')
  })

  it('game end: opponent side becomes empty by own move', () => {
    // Top has only pit 12 with 1 stone. All other top pits are 0.
    // After top sows from pit 12 (1 stone → store 13), top side becomes empty.
    // Bottom sweeps.
    const board = makeBoard([4, 4, 4, 4, 4, 4])
    board[BOTTOM_STORE] = 0
    for (let i = 7; i <= 11; i++) board[i] = 0
    board[12] = 1
    board[TOP_STORE] = 5

    const state = makeState({ board, currentPlayer: 'top' })
    const result = applyMove(state, 12)

    expect(result.status).toBe('finished')
    for (let i = 7; i <= 12; i++) {
      expect(result.board[i]).toBe(0)
    }
    // Bottom sweeps: pits 0-5 each have 4 → 24 → bottom store = 24
    expect(result.board[BOTTOM_STORE]).toBe(24)
    expect(result.board[0]).toBe(0)
    expect(result.winner).toBe('bottom')
  })

  it('game end with capture: capture empties a side', () => {
    // Bottom has only pit 0 with 1 stone, pit 1 empty
    // After capture from pit 1, bottom side all empty → sweep
    const board = makeBoard([1, 0, 0, 0, 0, 0])
    board[7] = 2
    board[8] = 2
    board[9] = 2
    board[10] = 2
    board[11] = 5
    board[12] = 2
    board[BOTTOM_STORE] = 0
    board[TOP_STORE] = 0

    const state = makeState({ board, currentPlayer: 'bottom' })
    const result = applyMove(state, 0)

    expect(result.status).toBe('finished')
    expect(result.board[BOTTOM_STORE]).toBe(6)
    expect(result.board[TOP_STORE]).toBe(10)
    expect(result.winner).toBe('top')
  })
})

describe('applyMove — winner determination', () => {
  it('draw correctly detected when stores equal', () => {
    const board = makeBoard([0, 0, 0, 0, 0, 1])
    board[BOTTOM_STORE] = 0
    board[7] = 1
    for (let i = 8; i <= 12; i++) board[i] = 0
    board[TOP_STORE] = 0

    const state = makeState({ board, currentPlayer: 'bottom' })
    const result = applyMove(state, 5)

    expect(result.board[BOTTOM_STORE]).toBe(1)
    expect(result.board[TOP_STORE]).toBe(1)
    expect(result.winner).toBe('draw')
    expect(result.status).toBe('finished')
  })

  it('detects top winner', () => {
    const board = makeBoard([0, 0, 0, 0, 0, 1])
    board[BOTTOM_STORE] = 0
    for (let i = 7; i <= 12; i++) board[i] = 3
    board[TOP_STORE] = 0

    const state = makeState({ board, currentPlayer: 'bottom' })
    const result = applyMove(state, 5)

    expect(result.board[BOTTOM_STORE]).toBe(1)
    expect(result.board[TOP_STORE]).toBe(18)
    expect(result.winner).toBe('top')
  })
})

describe('applyMove — edge cases', () => {
  it('no mutation: applyMove returns a new state, original unchanged', () => {
    const state = createInitialState()
    const boardCopy = [...state.board]

    applyMove(state, 0)

    expect(state.board).toEqual(boardCopy)
    expect(state.currentPlayer).toBe('bottom')
    expect(state.moveHistory).toHaveLength(0)
  })

  it('returns cloned state when move is illegal (empty pit)', () => {
    const board = makeBoard([0, 4, 4, 4, 4, 4])
    for (let i = 7; i <= 12; i++) board[i] = 4
    const state = makeState({ board, currentPlayer: 'bottom' })

    const result = applyMove(state, 0)
    expect(result).toEqual(state)
    expect(result).not.toBe(state)
  })

  it('returns cloned state when game is finished', () => {
    const board = makeBoard([])
    board[BOTTOM_STORE] = 24
    board[TOP_STORE] = 24
    const state = makeState({ board, status: 'finished', winner: 'draw' })

    const result = applyMove(state, 2)
    expect(result).toEqual(state)
    expect(result).not.toBe(state)
  })

  it('returns cloned state when move is from wrong side', () => {
    const state = createInitialState(undefined, 'bottom')
    const result = applyMove(state, 7)
    expect(result).toEqual(state)
    expect(result).not.toBe(state)
  })

  it('empty moveHistory when no moves have been made', () => {
    const state = createInitialState()
    expect(state.moveHistory).toEqual([])
  })

  it('moveHistory accumulates correctly over multiple moves', () => {
    let state = createInitialState()
    expect(state.moveHistory).toHaveLength(0)

    state = applyMove(state, 0)
    expect(state.moveHistory).toHaveLength(1)

    state = applyMove(state, 7)
    expect(state.moveHistory).toHaveLength(2)

    state = applyMove(state, 1)
    expect(state.moveHistory).toHaveLength(3)

    expect(state.moveHistory[0]!.pitIndex).toBe(0)
    expect(state.moveHistory[1]!.pitIndex).toBe(7)
    expect(state.moveHistory[2]!.pitIndex).toBe(1)
  })
})

describe('notation', () => {
  it('moveToNotation: bottom pits a-f', () => {
    const state = createInitialState()
    // Avoid pits that give extra turn (pit 2 gives *), test plain letters
    const result0 = applyMove(state, 0)
    expect(moveToNotation(result0.moveHistory[0]!)).toBe('a')

    const result1 = applyMove(state, 1)
    expect(moveToNotation(result1.moveHistory[0]!)).toBe('b')

    const result3 = applyMove(state, 3)
    expect(moveToNotation(result3.moveHistory[0]!)).toBe('d')

    const result4 = applyMove(state, 4)
    expect(moveToNotation(result4.moveHistory[0]!)).toBe('e')

    const result5 = applyMove(state, 5)
    expect(moveToNotation(result5.moveHistory[0]!)).toBe('f')
  })

  it('moveToNotation: top pits A-F', () => {
    const state = createInitialState(undefined, 'top')
    // Pit 9 (C) gives extra turn (4 stones → 10,11,12,13), test it separately
    const result7 = applyMove(state, 7)
    expect(moveToNotation(result7.moveHistory[0]!)).toBe('A')

    const result8 = applyMove(state, 8)
    expect(moveToNotation(result8.moveHistory[0]!)).toBe('B')

    // Pit 9 = C* (extra turn — 10,11,12,13)
    const result9 = applyMove(state, 9)
    expect(moveToNotation(result9.moveHistory[0]!)).toBe('C*')

    const result10 = applyMove(state, 10)
    expect(moveToNotation(result10.moveHistory[0]!)).toBe('D')

    const result11 = applyMove(state, 11)
    expect(moveToNotation(result11.moveHistory[0]!)).toBe('E')

    const result12 = applyMove(state, 12)
    expect(moveToNotation(result12.moveHistory[0]!)).toBe('F')
  })

  it('moveToNotation: suffix * for extra turn', () => {
    let state = createInitialState()
    state = applyMove(state, 2)
    const notation = moveToNotation(state.moveHistory[0]!)
    expect(notation).toBe('c*')
  })

  it('moveToNotation: suffix x for capture', () => {
    const board = makeBoard([1, 0, 0, 0, 0, 0])
    board[7] = 1
    board[8] = 1
    board[9] = 1
    board[10] = 1
    board[11] = 4
    board[12] = 1
    const state = makeState({ board, currentPlayer: 'bottom' })
    const result = applyMove(state, 0)
    const notation = moveToNotation(result.moveHistory[0]!)
    expect(notation).toBe('ax')
  })

  it('notationToMove: parses lowercase into correct pit index', () => {
    const state = createInitialState()
    const move = notationToMove(state, 'c')
    expect(move).not.toBeNull()
    expect(move!.pitIndex).toBe(2)
  })

  it('notationToMove: parses uppercase into correct pit index', () => {
    const state = createInitialState(undefined, 'top')
    const move = notationToMove(state, 'E')
    expect(move).not.toBeNull()
    expect(move!.pitIndex).toBe(11)
  })

  it('notationToMove: returns null for illegal move', () => {
    const board = makeBoard([0, 4, 4, 4, 4, 4])
    for (let i = 7; i <= 12; i++) board[i] = 4
    const state = makeState({ board, currentPlayer: 'bottom' })
    const move = notationToMove(state, 'a')
    expect(move).toBeNull()
  })

  it('notationToMove: returns null for garbage input', () => {
    const state = createInitialState()
    expect(notationToMove(state, '')).toBeNull()
    expect(notationToMove(state, 'xyz')).toBeNull()
    expect(notationToMove(state, 'aa')).toBeNull()
  })

  it('gameToText / parseGameText round-trip for simple game', () => {
    const state = createInitialState()
    const text = gameToText(state, 'kalah')
    const parsed = parseGameText(text)

    expect(parsed.state.board).toEqual(state.board)
    expect(parsed.state.currentPlayer).toBe(state.currentPlayer)
    expect(parsed.state.status).toBe(state.status)
    expect(parsed.state.winner).toBe(state.winner)
    expect(parsed.game).toBe('kalah')
  })

  it('gameToText / parseGameText round-trip after several moves', () => {
    let state = createInitialState()
    state = applyMove(state, 0)
    state = applyMove(state, 7)
    state = applyMove(state, 5)

    const text = gameToText(state, 'kalah')
    const parsed = parseGameText(text)

    expect(parsed.state.board).toEqual(state.board)
    expect(parsed.state.currentPlayer).toBe(state.currentPlayer)
    expect(parsed.state.status).toBe(state.status)
    expect(parsed.state.winner).toBe(state.winner)
    expect(parsed.state.moveHistory).toHaveLength(state.moveHistory.length)
    expect(parsed.game).toBe('kalah')
  })

  it('gameToText / parseGameText round-trip with extra turn', () => {
    let state = createInitialState()
    state = applyMove(state, 2) // extra turn, c*
    state = applyMove(state, 3) // still bottom

    const text = gameToText(state, 'kalah')
    const parsed = parseGameText(text)

    expect(parsed.state.board).toEqual(state.board)
    expect(parsed.state.currentPlayer).toBe(state.currentPlayer)
    expect(parsed.state.moveHistory).toHaveLength(state.moveHistory.length)
    expect(parsed.game).toBe('kalah')
  })

  it('gameToText / parseGameText round-trip preserves board for custom capture state', () => {
    // Custom board with capture: round-trip preserves board/currentPlayer/status/winner
    // (moveHistory is not preserved because the initial board differs from standard)
    const board = makeBoard([1, 0, 0, 0, 0, 0])
    board[7] = 1
    board[8] = 1
    board[9] = 1
    board[10] = 1
    board[11] = 4
    board[12] = 1
    board[BOTTOM_STORE] = 0
    board[TOP_STORE] = 0

    let state = makeState({ board, currentPlayer: 'bottom' })
    state = applyMove(state, 0) // capture

    const text = gameToText(state, 'kalah')
    const parsed = parseGameText(text)

    expect(parsed.state.board).toEqual(state.board)
    expect(parsed.state.currentPlayer).toBe(state.currentPlayer)
    expect(parsed.state.status).toBe(state.status)
    expect(parsed.state.winner).toBe(state.winner)
  })

  it('gameToText / parseGameText round-trip preserves board for completed game', () => {
    // Custom board leading to game end: round-trip preserves board/status/winner
    const board = makeBoard([1, 0, 0, 0, 0, 0])
    for (let i = 7; i <= 12; i++) board[i] = 3
    board[BOTTOM_STORE] = 5
    board[TOP_STORE] = 5

    let state = makeState({ board, currentPlayer: 'bottom' })
    state = applyMove(state, 0)

    expect(state.status).toBe('finished')

    const text = gameToText(state, 'kalah')
    const parsed = parseGameText(text)

    expect(parsed.state.status).toBe('finished')
    expect(parsed.state.winner).toBe(state.winner)
    expect(parsed.state.board).toEqual(state.board)
    expect(parsed.state.currentPlayer).toBe(state.currentPlayer)
  })

  it('gameToText writes header with game, board, player, status, winner', () => {
    const state = createInitialState()
    const text = gameToText(state, 'kalah')
    expect(text).toContain('[kalah|4,4,4,4,4,4,0,4,4,4,4,4,4,0|b|i|n]')
  })
})

describe('serialization', () => {
  it('encodeState / decodeState round-trip for initial state', () => {
    const state = createInitialState()
    const encoded = encodeState(state)
    const decoded = decodeState(encoded)

    expect(decoded.board).toEqual(state.board)
    expect(decoded.currentPlayer).toBe(state.currentPlayer)
    expect(decoded.status).toBe(state.status)
    expect(decoded.winner).toBe(state.winner)
  })

  it('encodeState / decodeState round-trip after several moves', () => {
    let state = createInitialState()
    state = applyMove(state, 0)
    state = applyMove(state, 7)
    state = applyMove(state, 5)

    const encoded = encodeState(state)
    const decoded = decodeState(encoded)

    expect(decoded.board).toEqual(state.board)
    expect(decoded.currentPlayer).toBe(state.currentPlayer)
    expect(decoded.status).toBe(state.status)
    expect(decoded.winner).toBe(state.winner)
  })

  it('encodeState / decodeState round-trip for finished game', () => {
    const board = makeBoard([])
    board[BOTTOM_STORE] = 30
    board[TOP_STORE] = 18
    const state = makeState({
      board,
      status: 'finished',
      winner: 'bottom',
    })

    const encoded = encodeState(state)
    const decoded = decodeState(encoded)

    expect(decoded.board).toEqual(state.board)
    expect(decoded.status).toBe('finished')
    expect(decoded.winner).toBe('bottom')
  })

  it('encodeState / decodeState round-trip for draw', () => {
    const board = makeBoard([])
    board[BOTTOM_STORE] = 24
    board[TOP_STORE] = 24
    const state = makeState({
      board,
      status: 'finished',
      winner: 'draw',
    })

    const encoded = encodeState(state)
    const decoded = decodeState(encoded)

    expect(decoded.winner).toBe('draw')
  })

  it('encodeState produces URL-safe string', () => {
    const state = createInitialState()
    const encoded = encodeState(state)
    expect(encoded).not.toContain(' ')
    expect(() => decodeState(encoded)).not.toThrow()
  })

  it('encodeState / decodeState round-trip with top as current player', () => {
    const state = createInitialState(undefined, 'top')
    const encoded = encodeState(state)
    const decoded = decodeState(encoded)

    expect(decoded.currentPlayer).toBe('top')
  })

  it('decodeState preserves moveHistory as empty array', () => {
    let state = createInitialState()
    state = applyMove(state, 0)
    state = applyMove(state, 7)

    const encoded = encodeState(state)
    const decoded = decodeState(encoded)

    expect(decoded.board).toEqual(state.board)
    expect(decoded.currentPlayer).toBe(state.currentPlayer)
    expect(decoded.status).toBe(state.status)
    expect(decoded.moveHistory).toEqual([])
  })
})

describe('custom RuleConfig', () => {
  it('capture is disabled when captureRule is "none"', () => {
    const noCaptureRules: RuleConfig = {
      pitsPerSide: 6,
      stonesPerPit: 4,
      extraTurnEnabled: true,
      captureRule: 'none',
    }

    const board = makeBoard([1, 0, 0, 0, 0, 0])
    board[7] = 1
    board[8] = 1
    board[9] = 1
    board[10] = 1
    board[11] = 4
    board[12] = 1
    board[BOTTOM_STORE] = 0

    const state = makeState({ board, currentPlayer: 'bottom' })
    const result = applyMove(state, 0, noCaptureRules)

    expect(result.board[1]).toBe(1)
    expect(result.board[11]).toBe(4)
    expect(result.board[BOTTOM_STORE]).toBe(0)

    const move = result.moveHistory[0]!
    expect(move.captured).toBeNull()
  })
})
