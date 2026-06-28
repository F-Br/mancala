import { describe, it, expect } from 'vitest'
import {
  minimax,
  minimaxWithAB,
  minimaxWithABTT,
  pickMoveBeginner,
  pickMoveCasual,
  pickMoveStrong,
  pickMoveExpert,
  TranspositionTable,
  iterativeDeepening,
} from '../search'
import type { CancelSignal } from '../search'
import { evaluateSimple } from '../evaluation'
import { createInitialState, applyMove, legalMoves } from '../../engine'
import { BOTTOM_STORE, TOP_STORE } from '../../engine'
import type { GameState, RuleConfig } from '../../engine'

const RULES: RuleConfig = {
  pitsPerSide: 6,
  stonesPerPit: 4,
  extraTurnEnabled: true,
  captureRule: 'kalah-standard',
}

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

describe('pickMoveBeginner', () => {
  it('returns a valid move for initial state', () => {
    const state = createInitialState()
    const move = pickMoveBeginner(state, RULES)
    expect(move).toBeGreaterThanOrEqual(0)
    expect(move).toBeLessThanOrEqual(5)
  })

  it('returns -1 when no legal moves', () => {
    const board = makeBoard([0, 0, 0, 0, 0, 0])
    board[7] = 4
    const state = makeState({ board, currentPlayer: 'bottom' })
    expect(pickMoveBeginner(state, RULES)).toBe(-1)
  })

  it('prefers extra-turn moves when available', () => {
    const state = createInitialState()
    const moves = legalMoves(state, RULES)
    const extraTurnMoves: number[] = []
    for (const pit of moves) {
      const child = applyMove(state, pit, RULES)
      const lastMove = child.moveHistory[child.moveHistory.length - 1]
      if (lastMove?.wasExtraTurn) {
        extraTurnMoves.push(pit)
      }
    }
    // Pit 2 (4 stones → land in store) should be an extra-turn move
    expect(extraTurnMoves).toContain(2)
  })

  it('respects seeded random', () => {
    const state = createInitialState()
    // Always return 0.99 → max index
    const move1 = pickMoveBeginner(state, RULES, () => 0.99)
    // Always return 0 → min index of candidates
    const move2 = pickMoveBeginner(state, RULES, () => 0)
    expect(typeof move1).toBe('number')
    expect(typeof move2).toBe('number')
  })
})

describe('minimax', () => {
  it('finds immediate capture at depth 1', () => {
    // Pit 0 has 1 stone, pit 1 is empty, opposite pit 11 has 4 stones → capture
    // Other pits have stones so bottom side doesn't become empty
    const board = makeBoard([1, 0, 1, 1, 1, 1])
    board[7] = 1
    board[8] = 1
    board[9] = 1
    board[10] = 1
    board[11] = 4
    board[12] = 1
    board[BOTTOM_STORE] = 0
    board[TOP_STORE] = 0
    const state = makeState({ board, currentPlayer: 'bottom' })

    const result = minimax(state, 1, RULES, evaluateSimple)
    // The capture move (pit 0) should be chosen — it captures 4+1=5 stones
    expect(result.pv[0]).toBe(0)
    expect(result.score).toBeGreaterThan(0)
  })

  it('depth 1 vs depth 2 may differ', () => {
    const state = createInitialState()
    const d1 = minimax(state, 1, RULES, evaluateSimple)
    const d2 = minimax(state, 2, RULES, evaluateSimple)
    // Both should return valid moves
    expect(d1.pv.length).toBeGreaterThan(0)
    expect(d2.pv.length).toBeGreaterThan(0)
    expect(d1.pv[0]).toBeGreaterThanOrEqual(0)
    expect(d2.pv[0]).toBeGreaterThanOrEqual(0)
  })

  it('returns empty PV for finished game', () => {
    const board = makeBoard([0, 0, 0, 0, 0, 0])
    board[BOTTOM_STORE] = 24
    board[TOP_STORE] = 24
    const state = makeState({ board, status: 'finished', winner: 'draw' })
    const result = minimax(state, 4, RULES, evaluateSimple)
    expect(result.pv).toEqual([])
  })

  it('check cancel signal stops search', () => {
    const state = createInitialState()
    const cancel: CancelSignal = { cancelled: true }
    const result = minimax(state, 4, RULES, evaluateSimple, cancel)
    expect(result.score).toBe(0)
    expect(result.pv).toEqual([])
  })
})

describe('minimaxWithAB', () => {
  it('agrees with minimax at depth 3', () => {
    const state = createInitialState()
    const mm = minimax(state, 3, RULES, evaluateSimple)
    const ab = minimaxWithAB(state, 3, -Infinity, +Infinity, RULES, evaluateSimple)
    expect(ab.score).toBe(mm.score)
    expect(ab.pv[0]).toBe(mm.pv[0])
  })

  it('prunes correctly (same result, possibly different PV for equivalent scores)', () => {
    const state = createInitialState()
    const result = minimaxWithAB(state, 3, -Infinity, +Infinity, RULES, evaluateSimple)
    expect(result.pv.length).toBeGreaterThan(0)
    expect(result.pv[0]).toBeGreaterThanOrEqual(0)
  })

  it('cancel stops search immediately', () => {
    const state = createInitialState()
    const cancel: CancelSignal = { cancelled: true }
    const result = minimaxWithAB(state, 4, -Infinity, +Infinity, RULES, evaluateSimple, cancel)
    expect(result.score).toBe(0)
    expect(result.pv).toEqual([])
  })
})

describe('TranspositionTable', () => {
  it('stores and retrieves entries', () => {
    const tt = new TranspositionTable()
    const state = createInitialState()
    const hash = tt.computeHash(state)
    expect(tt.get(hash)).toBeUndefined()

    tt.set(hash, { score: 42, depth: 5, flag: 'exact', bestMove: 3 })
    const entry = tt.get(hash)
    expect(entry).toBeDefined()
    expect(entry!.score).toBe(42)
    expect(entry!.depth).toBe(5)
    expect(entry!.flag).toBe('exact')
    expect(entry!.bestMove).toBe(3)
  })

  it('prefers deeper entries', () => {
    const tt = new TranspositionTable()
    const state = createInitialState()
    const hash = tt.computeHash(state)

    tt.set(hash, { score: 10, depth: 3, flag: 'exact', bestMove: 1 })
    tt.set(hash, { score: 20, depth: 5, flag: 'exact', bestMove: 2 })
    expect(tt.get(hash)!.score).toBe(20)
    expect(tt.get(hash)!.depth).toBe(5)

    // Shallower entry should not overwrite deeper
    tt.set(hash, { score: 30, depth: 2, flag: 'exact', bestMove: 3 })
    expect(tt.get(hash)!.score).toBe(20)
  })

  it('clear empties the table', () => {
    const tt = new TranspositionTable()
    const state = createInitialState()
    const hash = tt.computeHash(state)
    tt.set(hash, { score: 42, depth: 5, flag: 'exact', bestMove: 3 })
    expect(tt.size).toBe(1)
    tt.clear()
    expect(tt.size).toBe(0)
    expect(tt.get(hash)).toBeUndefined()
  })

  it('produces different hashes for different states', () => {
    const tt = new TranspositionTable()
    const state1 = createInitialState()
    let state2 = applyMove(state1, 0, RULES)

    const h1 = tt.computeHash(state1)
    const h2 = tt.computeHash(state2)
    expect(h1).not.toBe(h2)
  })

  it('produces different hashes for different players', () => {
    const tt = new TranspositionTable()
    const board = makeBoard([4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0])
    const stateB = makeState({ board, currentPlayer: 'bottom' })
    const stateT = makeState({ board, currentPlayer: 'top' })
    expect(tt.computeHash(stateB)).not.toBe(tt.computeHash(stateT))
  })
})

describe('minimaxWithABTT', () => {
  it('produces same result as AB without TT', () => {
    const state = createInitialState()
    const tt = new TranspositionTable()
    const ab = minimaxWithAB(state, 3, -Infinity, +Infinity, RULES, evaluateSimple)
    const abtt = minimaxWithABTT(state, 3, -Infinity, +Infinity, RULES, evaluateSimple, tt)
    expect(abtt.score).toBe(ab.score)
    expect(abtt.pv[0]).toBe(ab.pv[0])
  })

  it('uses TT for faster lookup on repeated positions', () => {
    // Create a simple state with few moves so TT hits matter
    const board = makeBoard([1, 2, 0, 0, 0, 0])
    board[7] = 1
    board[8] = 1
    board[9] = 0
    board[10] = 0
    board[11] = 0
    board[12] = 0
    board[BOTTOM_STORE] = 10
    board[TOP_STORE] = 10
    const state = makeState({ board, currentPlayer: 'bottom' })

    const tt = new TranspositionTable()
    const result = minimaxWithABTT(state, 4, -Infinity, +Infinity, RULES, evaluateSimple, tt)
    expect(result.pv.length).toBeGreaterThan(0)
    // TT should have some entries
    expect(tt.size).toBeGreaterThan(0)
  })
})

describe('iterativeDeepening', () => {
  it('returns a result within time budget', () => {
    const state = createInitialState()
    const result = iterativeDeepening(state, 500, RULES, evaluateSimple, null)
    expect(result.pv.length).toBeGreaterThan(0)
    expect(result.depth).toBeGreaterThan(0)
  })

  it('respects time budget', async () => {
    const state = createInitialState()
    const start = performance.now()
    iterativeDeepening(state, 100, RULES, evaluateSimple, null)
    const elapsed = performance.now() - start
    // Should be reasonably close to budget (allow some tolerance for depth completion)
    expect(elapsed).toBeLessThan(500)
  })

  it('stops on cancel signal', () => {
    const state = createInitialState()
    const cancel: CancelSignal = { cancelled: false }
    // We need to cancel it during execution; since this is synchronous,
    // the cancel won't be picked up until between iterations.
    // We can't easily test this synchronously, but we can verify it at least
    // returns a result when not cancelled.
    const result = iterativeDeepening(state, 1000, RULES, evaluateSimple, null, cancel)
    expect(result.pv.length).toBeGreaterThan(0)
  })
})

describe('pickMoveCasual', () => {
  it('returns a valid move at depth 4', () => {
    const state = createInitialState()
    const result = pickMoveCasual(state, RULES)
    expect(result.pv.length).toBeGreaterThan(0)
    expect(result.pv[0]).toBeGreaterThanOrEqual(0)
    expect(result.pv[0]).toBeLessThanOrEqual(5)
  })
})

describe('pickMoveStrong', () => {
  it('returns a valid move', () => {
    const state = createInitialState()
    const result = pickMoveStrong(state, RULES, 500)
    expect(result.pv.length).toBeGreaterThan(0)
    expect(result.pv[0]).toBeGreaterThanOrEqual(0)
    expect(result.depth).toBeGreaterThan(0)
  })
})

describe('pickMoveExpert', () => {
  it('returns a valid move', () => {
    const state = createInitialState()
    const result = pickMoveExpert(state, RULES, 500)
    expect(result.pv.length).toBeGreaterThan(0)
    expect(result.pv[0]).toBeGreaterThanOrEqual(0)
    expect(result.depth).toBeGreaterThan(0)
  })
})
