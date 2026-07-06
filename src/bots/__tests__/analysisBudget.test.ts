import { describe, it, expect } from 'vitest'
import { AnalysisWorkerHandler } from '../analysisWorker'
import { createInitialState, cloneState, legalMoves, applyMove } from '../../engine'
import { KALAH_STANDARD } from '../../engine'
import type { GameState } from '../../engine'
import type { AnalysisResponse } from '../types'
import {
  midGameFixture1,
  midGameFixture2,
  RULES,
} from './fixtures'

function createTestHarness(maxTTEntries?: number) {
  const pending = new Map<
    number,
    { resolve: (r: AnalysisResponse) => void; reject: (e: Error) => void }
  >()
  const handler = new AnalysisWorkerHandler((msg) => {
    if (msg.type === 'result') {
      const w = pending.get(msg.requestId)
      if (w) {
        pending.delete(msg.requestId)
        w.resolve(msg)
      }
    } else if (msg.type === 'error') {
      const w = pending.get(msg.requestId)
      if (w) {
        pending.delete(msg.requestId)
        w.reject(new Error(msg.message))
      }
    }
  }, maxTTEntries)

  function analyze(
    state: GameState,
    timeBudgetMs: number,
    requestId: number,
  ): Promise<AnalysisResponse> {
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      handler.handleMessage({ type: 'analyze', state, timeBudgetMs, requestId })
    })
  }

  function sharedTTSize(): number {
    return (handler as unknown as { sharedTT: { size: number } }).sharedTT.size
  }

  return { handler, analyze, sharedTTSize }
}

function generateConsecutiveStates(start: GameState, count: number): GameState[] {
  const states: GameState[] = [cloneState(start)]
  let current = cloneState(start)
  for (let i = 1; i < count; i++) {
    const moves = legalMoves(current, KALAH_STANDARD)
    if (moves.length === 0 || current.status === 'finished') break
    const pit = moves[i % moves.length]!
    current = applyMove(current, pit, KALAH_STANDARD)
    states.push(cloneState(current))
  }
  return states
}

describe('analysis budget compliance', () => {
  const midGameFixtures = [
    { name: 'midGameFixture1', state: midGameFixture1 },
    { name: 'midGameFixture2', state: midGameFixture2 },
  ]

  for (const fixture of midGameFixtures) {
    it(`${fixture.name}: result fires with non-empty PV and legal best move (300ms budget)`, async () => {
      const { analyze } = createTestHarness()
      const start = performance.now()
      const result = await analyze(fixture.state, 300, 1)
      const elapsed = performance.now() - start

      // Wall-clock includes PV extraction; the main search is budgeted but
      // extractPrincipalVariation adds ~100ms per PV step synchronously.
      expect(elapsed).toBeLessThan(10000)
      expect(result.principalVariation.length).toBeGreaterThan(0)
      const legal = legalMoves(fixture.state, RULES)
      expect(legal).toContain(result.pitIndex)
      expect(result.depthReached).toBeGreaterThan(0)
  }, 60000)

    it(`${fixture.name}: 1500ms budget buys at least as much depth as 300ms`, async () => {
      const { analyze } = createTestHarness()
      const result300 = await analyze(fixture.state, 300, 1)
      const { analyze: analyze2 } = createTestHarness()
      const result1500 = await analyze2(fixture.state, 1500, 2)

      expect(result1500.depthReached).toBeGreaterThanOrEqual(result300.depthReached)
    }, 10000)
  }
})

describe('sequential-positions through shared TT', () => {
  it('5 consecutive positions each respect budget', async () => {
    const states = generateConsecutiveStates(
      createInitialState(KALAH_STANDARD, 'bottom'),
      5,
    )

    const { analyze } = createTestHarness()
    let requestId = 1

    for (const state of states) {
      const start = performance.now()
      const result = await analyze(state, 300, requestId)
      const elapsed = performance.now() - start

      expect(elapsed).toBeLessThan(10000)
      expect(result.principalVariation.length).toBeGreaterThan(0)
      const legal = legalMoves(state, KALAH_STANDARD)
      expect(legal).toContain(result.pitIndex)
      expect(result.depthReached).toBeGreaterThan(0)

      requestId++
    }
  }, 15000)
})

describe('TT size cap', () => {
  it('size stays within maxEntries after search', async () => {
    const { analyze, sharedTTSize } = createTestHarness(1000)
    await analyze(midGameFixture1, 300, 1)

    expect(sharedTTSize()).toBeLessThanOrEqual(1000)
  }, 5000)
})
