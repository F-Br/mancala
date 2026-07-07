import { describe, it, expect } from 'vitest'
import { minimaxWithABTT, TranspositionTable, iterativeDeepening } from '../search'
import type { SearchLimits } from '../search'
import { evaluateSimple } from '../evaluation'
import { KALAH_STANDARD } from '../../engine'
import type { GameState } from '../../engine'
import { initialFixture, midGameFixture1, midGameFixture2, lateGameFixture } from './fixtures'

const DEPTH = 7
const RULES = KALAH_STANDARD

function countNodes(state: GameState, depth: number, cap: number): number {
  const tt = new TranspositionTable()
  const limits: SearchLimits = {
    deadlineMs: null,
    nodeCount: 0,
    aborted: false,
    checkInterval: 2048,
  }
  minimaxWithABTT(state, depth, -Infinity, +Infinity, RULES, evaluateSimple, tt, undefined, undefined, undefined, 0, 0, limits, cap)
  return limits.nodeCount
}

describe('search explosion regression', () => {
  it('node count with cap=3 is reasonable at depth 7 from initial position', () => {
    const nodes = countNodes(initialFixture, DEPTH, 3)
    console.log(`[NODE COUNT] initial cap=3: ${nodes}`)
    expect(nodes).toBeGreaterThan(0)
    expect(nodes).toBeLessThan(150_000)
  })

  it('node count with cap=3 is reasonable at depth 7 from midGameFixture1', () => {
    const nodes = countNodes(midGameFixture1, DEPTH, 3)
    console.log(`[NODE COUNT] midGameFixture1 cap=3: ${nodes}`)
    expect(nodes).toBeGreaterThan(0)
    expect(nodes).toBeLessThan(150_000)
  })

  it('node count with cap=3 is reasonable at depth 7 from midGameFixture2', () => {
    const nodes = countNodes(midGameFixture2, DEPTH, 3)
    console.log(`[NODE COUNT] midGameFixture2 cap=3: ${nodes}`)
    expect(nodes).toBeGreaterThan(0)
    expect(nodes).toBeLessThan(150_000)
  })

  it('node count with cap=3 is reasonable at depth 7 from lateGameFixture', () => {
    const nodes = countNodes(lateGameFixture, DEPTH, 3)
    console.log(`[NODE COUNT] lateGameFixture cap=3: ${nodes}`)
    expect(nodes).toBeGreaterThan(0)
    expect(nodes).toBeLessThan(150_000)
  })

  it('cap=30 visits strictly more nodes than cap=3 on at least one mid-game fixture', () => {
    let anyMore = false
    for (const [label, state] of Object.entries({ mid1: midGameFixture1, mid2: midGameFixture2, late: lateGameFixture })) {
      const nodes3 = countNodes(state, DEPTH, 3)
      const nodes30 = countNodes(state, DEPTH, 30)
      console.log(`[NODE COUNT] ${label} cap=3: ${nodes3}, cap=30: ${nodes30}`)
      if (nodes30 > nodes3) {
        anyMore = true
      }
    }
    expect(anyMore).toBe(true)
  })
})

describe('tactical extra-turn chain', () => {
  it('iterativeDeepening finds a 2-extra-turn chain followed by capture', () => {
    const board = new Array<number>(14).fill(0)
    board[0] = 6
    board[1] = 0
    board[2] = 3
    board[3] = 0
    board[4] = 0
    board[5] = 0
    board[6] = 10
    board[7] = 1
    board[8] = 0
    board[9] = 0
    board[10] = 5
    board[11] = 0
    board[12] = 0
    board[13] = 20

    const state: GameState = {
      currentPlayer: 'bottom',
      status: 'in-progress',
      winner: null,
      moveHistory: [],
      board,
    }

    const result = iterativeDeepening(state, 500, RULES, evaluateSimple, null)
    expect(result.pv.length).toBeGreaterThan(0)
    expect(result.pv[0]).toBe(0)
  })
})
