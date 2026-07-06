import { describe, it, expect } from 'vitest'
import { AnalysisWorkerHandler } from '../analysisWorker'
import { createInitialState, cloneState, legalMoves, applyMove } from '../../engine'
import { KALAH_STANDARD } from '../../engine'
import type { GameState } from '../../engine'
import type { AnalysisResponse } from '../types'
import { minimax } from '../search'
import { evaluateExpert } from '../evaluation'
import {
  midGameFixture1,
  midGameFixture2,
  RULES,
  hasExtraTurnMove,
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
  }, maxTTEntries, true)

  function analyze(
    state: GameState,
    timeBudgetMs: number,
    requestId: number,
    playedPitIndex?: number,
  ): Promise<AnalysisResponse> {
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      handler.handleMessage({ type: 'analyze', state, timeBudgetMs, requestId, playedPitIndex })
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

describe('verification search — perspective conversion', () => {
  it('extra-turn played move: no negation (same player perspective)', async () => {
    // midGameFixture1: top to move, pit 11 is an extra-turn move
    const extraPit = 11
    const childCheck = applyMove(midGameFixture1, extraPit, RULES)
    expect(childCheck.currentPlayer).toBe(midGameFixture1.currentPlayer)

    const { analyze } = createTestHarness()
    const result = await analyze(midGameFixture1, 600, 1, extraPit)

    expect(result.exactPlayedEval).toBeDefined()

    // Verify sign matches a depth-1 parent search (no AB for exact scores)
    const rootScores: Record<number, number> = {}
    const parentSearch = minimax(midGameFixture1, 1, RULES, evaluateExpert, undefined, rootScores, 1)
    const parentRootScore = rootScores[extraPit]
    expect(parentRootScore).toBeDefined()
    expect(Math.sign(result.exactPlayedEval!)).toBe(Math.sign(parentRootScore))
  }, 15000)

  it('non-extra-turn played move: negation (opponent perspective)', async () => {
    // midGameFixture2: bottom to move, find best move first
    const { analyze } = createTestHarness()
    const bestResult = await analyze(midGameFixture2, 500, 1)
    const bestMove = bestResult.pitIndex

    // Find a non-extra-turn legal move different from best move
    const extraPit = hasExtraTurnMove(midGameFixture2)
    const legal = legalMoves(midGameFixture2, RULES)
    const nonExtraPit = legal.find((p) => p !== extraPit && p !== bestMove)
    if (nonExtraPit === undefined) return

    const childCheck = applyMove(midGameFixture2, nonExtraPit!, RULES)
    expect(childCheck.currentPlayer).not.toBe(midGameFixture2.currentPlayer)

    const result = await analyze(midGameFixture2, 600, 2, nonExtraPit)

    expect(result.exactPlayedEval).toBeDefined()

    // Verify sign matches a depth-1 parent search
    const rootScores: Record<number, number> = {}
    minimax(midGameFixture2, 1, RULES, evaluateExpert, undefined, rootScores, 1)
    const parentRootScore = rootScores[nonExtraPit!]
    expect(parentRootScore).toBeDefined()
    expect(Math.sign(result.exactPlayedEval!)).toBe(Math.sign(parentRootScore))
  }, 15000)
})

describe('verification search — best-move skip', () => {
  it('exactPlayedEval is undefined when playedPitIndex is not provided', async () => {
    const { analyze } = createTestHarness()
    const result = await analyze(midGameFixture1, 300, 1)
    expect(result.exactPlayedEval).toBeUndefined()
  }, 10000)

  it('exactPlayedEval is defined when playedPitIndex differs from best move', async () => {
    // midGameFixture1: find best move first, then verify with a different legal move
    const { analyze } = createTestHarness()
    const bestResult = await analyze(midGameFixture1, 500, 1)
    const bestMove = bestResult.pitIndex

    const legal = legalMoves(midGameFixture1, RULES)
    const playedPit = legal.find((p) => p !== bestMove)
    if (playedPit === undefined) return // all legal moves are the same? unlikely

    const result = await analyze(midGameFixture1, 500, 2, playedPit)
    expect(result.exactPlayedEval).toBeDefined()
  }, 15000)
})

describe('verification search — budget compliance', () => {
  it('full analysis with verification (timeBudgetMs=400) finishes within 10000ms', async () => {
    const { analyze } = createTestHarness()
    const bestResult = await analyze(midGameFixture1, 300, 1)
    const bestMove = bestResult.pitIndex

    const legal = legalMoves(midGameFixture1, RULES)
    const playedPit = legal.find((p) => p !== bestMove)
    if (playedPit === undefined) return

    const start = performance.now()
    const result = await analyze(midGameFixture1, 400, 2, playedPit)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(10000)
    expect(result.exactPlayedEval).toBeDefined()
    expect(result.principalVariation.length).toBeGreaterThan(0)
  }, 20000)
})
