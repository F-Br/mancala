import { describe, it, expect } from 'vitest'
import { createInitialState, applyMove } from '../../engine'
import { KALAH_STANDARD } from '../../engine'
import { isCacheHealthy, isPVActive, executeBatchAnalysis, replayPositions } from '../batchAnalysis'
import type { AnalysisCacheEntry } from '../../state/gameStore'
import type { AnalysisResult } from '../../bots/analysisClient'

function makeEntry(overrides: Partial<AnalysisCacheEntry> = {}): AnalysisCacheEntry {
  return {
    bestPitIndex: 0,
    bestEval: 1.5,
    pv: [0, 8, 1],
    depth: 8,
    playedEval: 1.0,
    rootScores: {},
    reachedTerminal: false,
    ...overrides,
  }
}

describe('isCacheHealthy', () => {
  it('empty cache is healthy', () => {
    expect(isCacheHealthy([])).toBe(true)
  })

  it('healthy long-PV entry', () => {
    const cache = [makeEntry({ pv: [0, 8, 1, 9], reachedTerminal: false })]
    expect(isCacheHealthy(cache)).toBe(true)
  })

  it('healthy short-PV with reachedTerminal true', () => {
    const cache = [makeEntry({ pv: [0], reachedTerminal: true })]
    expect(isCacheHealthy(cache)).toBe(true)
  })

  it('healthy entry with pv length 0 and bestPitIndex >= 0 and reachedTerminal true', () => {
    const cache = [makeEntry({ pv: [], bestPitIndex: 3, reachedTerminal: true })]
    expect(isCacheHealthy(cache)).toBe(true)
  })

  it('unhealthy 1-move non-terminal entry', () => {
    const cache = [makeEntry({ bestPitIndex: 5, pv: [5], reachedTerminal: false })]
    expect(isCacheHealthy(cache)).toBe(false)
  })

  it('unhealthy entry with reachedTerminal missing from deserialized data', () => {
    const entry = makeEntry({ bestPitIndex: 5, pv: [5] })
    delete (entry as unknown as Record<string, unknown>).reachedTerminal
    expect(isCacheHealthy([entry])).toBe(false)
  })

  it('unhealthy bestPitIndex: -1 placeholder', () => {
    const cache = [makeEntry({ bestPitIndex: -1, pv: [], playedEval: 0 })]
    expect(isCacheHealthy(cache)).toBe(false)
  })

  it('unhealthy mixed: one bad entry poisons the whole cache', () => {
    const cache = [
      makeEntry({ pv: [0, 8, 1], reachedTerminal: false }),
      makeEntry({ pv: [5], bestPitIndex: 5, reachedTerminal: false }),
    ]
    expect(isCacheHealthy(cache)).toBe(false)
  })

  it('multiple healthy entries are healthy', () => {
    const cache = [
      makeEntry({ pv: [0, 8, 1], reachedTerminal: false }),
      makeEntry({ pv: [12], reachedTerminal: true }),
    ]
    expect(isCacheHealthy(cache)).toBe(true)
  })
})

describe('isPVActive', () => {
  it('returns false when showPV is false', () => {
    expect(isPVActive(false, 0, 0)).toBe(false)
    expect(isPVActive(false, null, 0)).toBe(false)
  })

  it('returns false when startIndex is null', () => {
    expect(isPVActive(true, null, 0)).toBe(false)
    expect(isPVActive(true, null, 5)).toBe(false)
  })

  it('returns true when showPV is true and startIndex matches currentIndex', () => {
    expect(isPVActive(true, 3, 3)).toBe(true)
  })

  it('returns false when showPV is true and startIndex differs from currentIndex', () => {
    expect(isPVActive(true, 3, 5)).toBe(false)
    expect(isPVActive(true, 0, 1)).toBe(false)
  })
})

function buildSmallGame(): ReturnType<typeof replayPositions> {
  let state = createInitialState(KALAH_STANDARD, 'bottom')
  const moves = [2, 8, 1, 9, 4, 12]
  for (const pit of moves) {
    state = applyMove(state, pit, KALAH_STANDARD)
  }
  return replayPositions(state, 'bottom', KALAH_STANDARD)
}

describe('executeBatchAnalysis — abort signal', () => {
  const fakeResult: AnalysisResult = {
    pitIndex: 2,
    evalScore: 1.0,
    principalVariation: [2, 8, 1, 9],
    depthReached: 6,
    rootScores: {},
    reachedTerminal: false,
  }

  it('stops early and returns no placeholder tail when signal is cancelled mid-batch', async () => {
    const positions = buildSmallGame()

    const signal = { cancelled: false }
    let callCount = 0

    const results = await executeBatchAnalysis({
      positions,
      analyze: async () => {
        callCount++
        if (callCount >= 3) {
          signal.cancelled = true
        }
        return fakeResult
      },
      positionBudgetMs: 100,
      signal,
    })

    expect(results.length).toBeLessThanOrEqual(3)
    expect(results.length).toBeGreaterThan(0)
  })

  it('cancelled in catch: breaks instead of pushing placeholder', async () => {
    const positions = buildSmallGame()

    const signal = { cancelled: false }
    let callCount = 0

    const results = await executeBatchAnalysis({
      positions,
      analyze: async () => {
        callCount++
        if (callCount >= 3) {
          signal.cancelled = true
          throw new Error('simulated error')
        }
        return fakeResult
      },
      positionBudgetMs: 100,
      signal,
    })

    expect(results.length).toBeLessThanOrEqual(3)
    for (const r of results) {
      expect(r.entry.bestPitIndex).toBeGreaterThanOrEqual(0)
    }
  })
})
