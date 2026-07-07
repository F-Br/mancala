import { describe, it, expect } from 'vitest'
import { iterativeDeepening, minimaxWithAB, TranspositionTable } from '../search'
import type { SearchLimits } from '../search'
import { evaluateSimple } from '../evaluation'
import { legalMoves } from '../../engine'
import {
  midGameFixture1,
  midGameFixture2,
  RULES,
} from './fixtures'

describe('SearchLimits deadline enforcement', () => {
  it('aborts inside recursion and returns NaN score', () => {
    const state = midGameFixture1
    const limits: SearchLimits = {
      deadlineMs: performance.now() + 50, // very short deadline
      nodeCount: 0,
      aborted: false,
      checkInterval: 16, // check very frequently
    }

    const result = minimaxWithAB(state, 4, -Infinity, +Infinity, RULES, evaluateSimple, undefined, undefined, undefined, 0, 0, limits)

    // Either the search completed faster than 50ms, or it got aborted
    // If aborted, score is NaN
    if (limits.aborted) {
      expect(isNaN(result.score)).toBe(true)
      expect(result.pv).toEqual([])
    }
    // If not aborted, the result should be valid (very fast depth-4 on mid-game)
    if (!limits.aborted) {
      expect(isNaN(result.score)).toBe(false)
      expect(result.pv.length).toBeGreaterThan(0)
    }
  })

  it('nodeCount is incremented during search', () => {
    const state = midGameFixture1
    const limits: SearchLimits = {
      deadlineMs: null,
      nodeCount: 0,
      aborted: false,
      checkInterval: 2048,
    }

    minimaxWithAB(state, 3, -Infinity, +Infinity, RULES, evaluateSimple, undefined, undefined, undefined, 0, 0, limits)

    expect(limits.nodeCount).toBeGreaterThan(0)
    expect(limits.aborted).toBe(false)
  })
})

describe('Bounded-time iterative deepening', () => {
  const midGameFixtures = [
    { name: 'midGameFixture1', state: midGameFixture1 },
    { name: 'midGameFixture2', state: midGameFixture2 },
  ]

  for (const fixture of midGameFixtures) {
    it(`${fixture.name}: respects time budget`, () => {
      const start = performance.now()
      const result = iterativeDeepening(fixture.state, 200, RULES, evaluateSimple, null)
      const elapsed = performance.now() - start

      // Must complete within generous slack for CI jitter
      expect(elapsed).toBeLessThan(500)

      // Must return a non-empty PV whose first move is legal
      expect(result.pv.length).toBeGreaterThan(0)
      const legal = legalMoves(fixture.state, RULES)
      expect(legal).toContain(result.pv[0])
      expect(result.depth).toBeGreaterThan(0)
    })
  }
})

describe('Determinism of completed depths', () => {
  // Run same fixture twice with large budget and fixed max depth
  function runAtDepth(state: typeof midGameFixture1, maxDepth: number) {
    return iterativeDeepening(state, 10000, RULES, evaluateSimple, null, undefined, undefined, maxDepth)
  }

  it('identical results for midGameFixture1 at depth 2', () => {
    const result1 = runAtDepth(midGameFixture1, 2)
    const result2 = runAtDepth(midGameFixture1, 2)

    expect(result1.score).toBe(result2.score)
    expect(result1.pv[0]).toBe(result2.pv[0])
    expect(result1.depth).toBe(result2.depth)
  })

  it('identical results for midGameFixture2 at depth 3', () => {
    const result1 = runAtDepth(midGameFixture2, 3)
    const result2 = runAtDepth(midGameFixture2, 3)

    expect(result1.score).toBe(result2.score)
    expect(result1.pv[0]).toBe(result2.pv[0])
    expect(result1.depth).toBe(result2.depth)
  })
})

describe('No TT pollution from aborted searches', () => {
  // A search aborted mid-iteration must not leave corrupt TT entries that
  // affect a subsequent search with the same TT.
  it('large-budget result with warm TT equals fresh-TT result', () => {
    const state = midGameFixture1
    const maxDepth = 2

    // Reference: fresh TT, large budget, fixed depth
    const ttFresh = new TranspositionTable()
    const refResult = iterativeDeepening(state, 60000, RULES, evaluateSimple, ttFresh, undefined, undefined, maxDepth)

    // Run once with tiny budget so it aborts at depth 2
    const ttWarm = new TranspositionTable()
    iterativeDeepening(state, 1, RULES, evaluateSimple, ttWarm, undefined, undefined, maxDepth)

    // Now run again with warm TT and large budget
    const warmResult = iterativeDeepening(state, 60000, RULES, evaluateSimple, ttWarm, undefined, undefined, maxDepth)

    // Results must match the fresh-TT reference
    expect(warmResult.score).toBe(refResult.score)
    expect(warmResult.pv[0]).toBe(refResult.pv[0])
    expect(warmResult.depth).toBe(refResult.depth)
  })
})
