import { describe, it, expect } from 'vitest'
import {
  extractPrincipalVariation,
  TranspositionTable,
} from '../search'
import type { CancelSignal } from '../search'
import { evaluateExpert, evaluateSimple } from '../evaluation'
import { applyMove, legalMoves, cloneState, createInitialState } from '../../engine'
import { BOTTOM_STORE, TOP_STORE } from '../../engine'
import type { GameState, RuleConfig } from '../../engine'
import { RULES, midGameFixture1, midGameFixture2, countBoardStones, hasExtraTurnMove } from './fixtures'

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

describe('extractPrincipalVariation (re-search based)', () => {
  it('no-collapse: mid-game fixtures produce PV length >= 10 or reach terminal', () => {
    const fixtures = [
      { name: 'midGameFixture1', state: midGameFixture1 },
      { name: 'midGameFixture2', state: midGameFixture2 },
    ]

    for (const { name, state } of fixtures) {
      const stones = countBoardStones(state)
      expect(stones).toBeGreaterThanOrEqual(20)

      const tt = new TranspositionTable()
      const result = extractPrincipalVariation(state, RULES, tt, evaluateExpert, {})

      expect(
        result.pv.length >= 10 || result.reachedTerminal,
        `${name}: expected pv.length >= 10 (got ${result.pv.length}) or reachedTerminal (got ${result.reachedTerminal}); stones on board: ${stones}`,
      ).toBe(true)
    }
  }, 30000)

  it('validity: applied PV matches finalState and players match currentPlayer', () => {
    const fixtures = [
      { name: 'midGameFixture1', state: midGameFixture1 },
      { name: 'midGameFixture2', state: midGameFixture2 },
    ]

    for (const { state } of fixtures) {
      const tt = new TranspositionTable()
      const result = extractPrincipalVariation(state, RULES, tt, evaluateExpert, {})

      expect(result.pv.length).toBe(result.players.length)

      let replayed = cloneState(state)
      for (let i = 0; i < result.pv.length; i++) {
        const pit = result.pv[i]!
        const player = result.players[i]!
        const legal = legalMoves(replayed, RULES)
        expect(legal, `step ${i}: move ${pit} must be legal`).toContain(pit)
        expect(player, `step ${i}: player mismatch`).toBe(replayed.currentPlayer)
        replayed = applyMove(replayed, pit, RULES)
      }

      expect(replayed).toEqual(result.finalState)
    }
  }, 30000)

  it('extra-turn representation: consecutive same-side entries appear in PV', () => {
    const board = makeBoard([0, 0, 4, 0, 0, 0])
    board[7] = 1
    board[BOTTOM_STORE] = 0
    board[TOP_STORE] = 0
    const state = makeState({ board, currentPlayer: 'bottom' })

    const tt = new TranspositionTable()
    const result = extractPrincipalVariation(state, RULES, tt, evaluateSimple, { perStepBudgetMs: 500 })

    expect(result.pv.length).toBeGreaterThan(1)
    expect(result.players.length).toBe(result.pv.length)

    let s = cloneState(state)
    for (let i = 0; i < result.pv.length; i++) {
      expect(result.players[i]).toBe(s.currentPlayer)
      s = applyMove(s, result.pv[i]!, RULES)
    }

    let foundConsecutive = false
    for (let i = 1; i < result.players.length; i++) {
      if (result.players[i] === result.players[i - 1]) {
        foundConsecutive = true
        break
      }
    }
    expect(foundConsecutive).toBe(true)
  }, 15000)

  it('terminal: near-end position reports reachedTerminal and finished finalState', () => {
    const board = makeBoard([1, 0, 0, 0, 0, 0])
    board[7] = 0
    board[BOTTOM_STORE] = 20
    board[TOP_STORE] = 24
    const state = makeState({ board, currentPlayer: 'bottom' })

    const tt = new TranspositionTable()
    const result = extractPrincipalVariation(state, RULES, tt, evaluateSimple, { perStepBudgetMs: 200 })

    expect(result.reachedTerminal).toBe(true)
    expect(result.finalState.status).toBe('finished')
    // Small but terminal is correct behaviour, not collapse
    expect(result.pv.length).toBeGreaterThan(0)
  }, 10000)

  it('starved-search fallback: perStepBudgetMs=0 still reaches maxPlies or terminal', () => {
    const state = midGameFixture1
    const tt = new TranspositionTable()

    const result = extractPrincipalVariation(state, RULES, tt, evaluateSimple, {
      perStepBudgetMs: 0,
      maxPlies: 15,
    })

    // With 0ms budget each step only gets depth 1, but fallback chain guarantees progress
    // Wait for actual behavior: with 0ms budget, iterativeDeepening still runs depth 1
    // without deadline enforcement, so pv[0] is available.
    expect(result.pv.length === 15 || result.reachedTerminal).toBe(true)
    expect(result.pv.length).toBeGreaterThan(0)
  }, 30000)

  it('budget: totalBudgetMs=300 completes under 800ms wall-clock', () => {
    const state = midGameFixture1
    const tt = new TranspositionTable()

    const start = performance.now()
    const result = extractPrincipalVariation(state, RULES, tt, evaluateSimple, {
      perStepBudgetMs: 250,
      totalBudgetMs: 300,
    })
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(800)
    expect(result.pv.length).toBeGreaterThan(0)
  }, 5000)

  it('terminal input state returns empty PV and reachedTerminal=true', () => {
    const board = makeBoard([0, 0, 0, 0, 0, 0])
    board[BOTTOM_STORE] = 24
    board[TOP_STORE] = 24
    const state = makeState({ board, status: 'finished', winner: 'draw' })

    const tt = new TranspositionTable()
    const result = extractPrincipalVariation(state, RULES, tt, evaluateSimple, { perStepBudgetMs: 200 })

    expect(result.pv).toEqual([])
    expect(result.players).toEqual([])
    expect(result.reachedTerminal).toBe(true)
    expect(result.finalState.status).toBe('finished')
  })

  it('honours cancel signal immediately', () => {
    const state = midGameFixture1
    const tt = new TranspositionTable()
    const cancel: CancelSignal = { cancelled: true }

    const result = extractPrincipalVariation(state, RULES, tt, evaluateSimple, {
      perStepBudgetMs: 500,
      cancelSignal: cancel,
    })

    expect(result.pv).toEqual([])
    expect(result.players).toEqual([])
    expect(result.reachedTerminal).toBe(false)
  })
})
