import { describe, it, expect } from 'vitest'
import { AnalysisWorkerHandler } from '../../bots/analysisWorker'
import { cloneState, legalMoves, applyMove } from '../../engine'
import { KALAH_STANDARD } from '../../engine'
import type { GameState } from '../../engine'
import type { AnalysisResponse } from '../../bots/types'
import type { AnalysisResult } from '../../bots/analysisClient'
import type { TbProgressMsg } from '../../engine'
import { executeBatchAnalysis, replayPositions } from '../batchAnalysis'

import { lateGameFixture, RULES, countBoardStones, mangalaLateGameFixture, MANGALA_RULES } from '../../bots/__tests__/fixtures'

interface AnalyzeOptions {
  totalExtractionBudgetMs?: number
  perStepExtractionBudgetMs?: number
}

function createTestHarness(skipTablebase = true, maxTTEntries?: number, game: 'kalah' | 'mangala' = 'kalah') {
  const pending = new Map<
    number,
    { resolve: (r: AnalysisResponse) => void; reject: (e: Error) => void }
  >()
  let tbProgressMsgs: TbProgressMsg[] = []

  const handler = new AnalysisWorkerHandler(
    (msg) => {
      if (msg.type === 'tbProgress') {
        tbProgressMsgs.push(msg as TbProgressMsg)
        return
      }
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
    },
    maxTTEntries,
    skipTablebase,
  )

  let requestId = 1

  function analyze(
    state: GameState,
    budgetMs: number,
    playedPitIndex?: number,
    opts?: AnalyzeOptions,
  ): Promise<AnalysisResult> {
    return new Promise((resolve, reject) => {
      const id = requestId++
      pending.set(id, { resolve, reject })
      handler.handleMessage({
        type: 'analyze',
        state,
        timeBudgetMs: budgetMs,
        requestId: id,
        game,
        ...(playedPitIndex !== undefined ? { playedPitIndex } : {}),
        ...(opts?.totalExtractionBudgetMs !== undefined ? { totalExtractionBudgetMs: opts.totalExtractionBudgetMs } : {}),
        ...(opts?.perStepExtractionBudgetMs !== undefined ? { perStepExtractionBudgetMs: opts.perStepExtractionBudgetMs } : {}),
      })
    })
  }

  return { handler, analyze, tbProgress: () => tbProgressMsgs }
}

function makeAnalyzeFn(
  rawAnalyze: ReturnType<typeof createTestHarness>['analyze'],
  opts?: AnalyzeOptions,
): (state: GameState, budgetMs: number, playedPitIndex?: number) => Promise<AnalysisResult> {
  return (state, budgetMs, playedPitIndex) => rawAnalyze(state, budgetMs, playedPitIndex, opts)
}

describe('analysis end-to-end bounded-time guarantee', () => {
  it('completes full game (≥30 positions) within positions × 2000ms wall clock', async () => {
    const gameState = lateGameFixture
    expect(gameState.moveHistory.length).toBeGreaterThanOrEqual(30)

    const positions = replayPositions(gameState, 'bottom', KALAH_STANDARD)
    const totalPositions = gameState.moveHistory.length

    const { analyze } = createTestHarness(true)
    const analyzeFn = makeAnalyzeFn(analyze, {
      totalExtractionBudgetMs: 800,
      perStepExtractionBudgetMs: 80,
    })

    const startTime = performance.now()
    const results = await executeBatchAnalysis({
      positions,
      analyze: analyzeFn,
      positionBudgetMs: 400,
    })
    const elapsed = performance.now() - startTime

    const wallClockBudget = totalPositions * 2000
    expect(elapsed).toBeLessThan(wallClockBudget)

    expect(results.length).toBe(totalPositions)

    for (let i = 0; i < results.length; i++) {
      const r = results[i]!
      const pos = positions[i]!

      if (!pos.move || pos.state.status !== 'in-progress') {
        expect(r.entry.bestPitIndex).toBe(-1)
        continue
      }

      const legal = legalMoves(pos.state, RULES)
      expect(
        legal,
        `Position ${i}: bestPitIndex ${r.entry.bestPitIndex} not in [${legal.join(',')}]`,
      ).toContain(r.entry.bestPitIndex)

      const pitStones = countBoardStones(pos.state)
      if (pitStones > 12) {
        expect(
          r.entry.pv.length >= 4 || r.reachedTerminal,
          `Position ${i}: PV length ${r.entry.pv.length} < 4 and !reachedTerminal (${pitStones} pit stones)`,
        ).toBe(true)
      }
    }

    for (let i = 0; i < results.length; i++) {
      const r = results[i]!
      const pos = positions[i]!

      if (!pos.move || pos.state.status !== 'in-progress') continue
      if (r.entry.pv.length === 0) continue

      let s = cloneState(pos.state)
      for (const pit of r.entry.pv) {
        const legal = legalMoves(s, RULES)
        expect(
          legal,
          `Position ${i} PV step: pit ${pit} not legal in state with board [${s.board.join(',')}]`,
        ).toContain(pit)
        s = applyMove(s, pit, RULES)
      }
    }

    for (let i = 0; i < results.length; i++) {
      const r = results[i]!
      const pos = positions[i]!

      if (!pos.move || pos.state.status !== 'in-progress') continue
      if (r.entry.bestPitIndex < 0) continue

      if (pos.move.pitIndex === r.entry.bestPitIndex) {
        expect(r.entry.playedEval).toBe(r.entry.bestEval)
      }
    }
  }, 180000)

  it('completes 3 positions at production budgets within 3 × 7000ms', async () => {
    const positions = replayPositions(lateGameFixture, 'bottom', KALAH_STANDARD).slice(0, 3)

    const { analyze } = createTestHarness(true)

    const startTime = performance.now()
    const results = await executeBatchAnalysis({
      positions,
      analyze: (state, budgetMs, playedPitIndex) =>
        analyze(state, budgetMs, playedPitIndex),
      positionBudgetMs: 3000,
    })
    const elapsed = performance.now() - startTime

    expect(elapsed).toBeLessThan(3 * 7000)

    for (let i = 0; i < results.length; i++) {
      const r = results[i]!
      const pos = positions[i]!

      if (!pos.move || pos.state.status !== 'in-progress') {
        expect(r.entry.bestPitIndex).toBe(-1)
        continue
      }

      const legal = legalMoves(pos.state, RULES)
      expect(legal).toContain(r.entry.bestPitIndex)
      expect(r.entry.pv.length).toBeGreaterThan(0)
    }
  }, 60000)
})

describe('analysis end-to-end: Mangala variant', () => {
  it('completes Mangala full game (>=20 positions) within positions × 2000ms wall clock', async () => {
    const gameState = mangalaLateGameFixture
    const totalPositions = gameState.moveHistory.length
    expect(totalPositions).toBeGreaterThanOrEqual(20)

    const positions = replayPositions(gameState, 'bottom', MANGALA_RULES)

    const { analyze } = createTestHarness(true, undefined, 'mangala')
    const analyzeFn = makeAnalyzeFn(analyze, {
      totalExtractionBudgetMs: 500,
      perStepExtractionBudgetMs: 50,
    })

    const startTime = performance.now()
    const results = await executeBatchAnalysis({
      positions,
      analyze: analyzeFn,
      positionBudgetMs: 400,
    })
    const elapsed = performance.now() - startTime

    const wallClockBudget = totalPositions * 2000
    expect(elapsed).toBeLessThan(wallClockBudget)

    expect(results.length).toBe(totalPositions)

    for (let i = 0; i < results.length; i++) {
      const r = results[i]!
      const pos = positions[i]!

      if (!pos.move || pos.state.status !== 'in-progress') {
        expect(r.entry.bestPitIndex).toBe(-1)
        continue
      }

      const legal = legalMoves(pos.state, MANGALA_RULES)
      expect(
        legal,
        `Mangala pos ${i}: bestPitIndex ${r.entry.bestPitIndex} not in [${legal.join(',')}]`,
      ).toContain(r.entry.bestPitIndex)

      const pitStones = countBoardStones(pos.state)
      if (pitStones > 12) {
        expect(
          r.entry.pv.length >= 8 || r.reachedTerminal,
          `Mangala pos ${i}: PV length ${r.entry.pv.length} < 8 and !reachedTerminal (${pitStones} pit stones)`,
        ).toBe(true)
      }
    }

    for (let i = 0; i < results.length; i++) {
      const r = results[i]!
      const pos = positions[i]!

      if (!pos.move || pos.state.status !== 'in-progress') continue
      if (r.entry.pv.length === 0) continue

      let s = cloneState(pos.state)
      for (const pit of r.entry.pv) {
        const legal = legalMoves(s, MANGALA_RULES)
        expect(
          legal,
          `Mangala pos ${i} PV step: pit ${pit} not legal in state with board [${s.board.join(',')}]`,
        ).toContain(pit)
        s = applyMove(s, pit, MANGALA_RULES)
      }
    }
  }, 180000)
})
