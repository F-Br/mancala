import { describe, it, expect } from 'vitest'
import { classifyEvalDrop } from '../classification'
import { WIN_SCORE, MAX_PLY } from '../../bots/evaluation'

const W = WIN_SCORE
const M = MAX_PLY

describe('classifyEvalDrop — outcome-aware', () => {
  it('two mutually losing moves do not classify as blunder against each other', () => {
    // Both in loss mate-band — same outcome category
    const best = -(W - 3)    // loses in 3 plies
    const played = -(W - 8)  // loses in 8 plies (slower loss — actually better)
    const result = classifyEvalDrop(best, played)
    // Same LOSS category → 'good', not a blunder
    expect(result).toBe('good')
  })

  it('two losing moves (both in mate band), played is faster loss', () => {
    const best = -(W - 8)    // loses in 8 plies (slower = better)
    const played = -(W - 3)  // loses in 3 plies (faster = worse, but still losing)
    const result = classifyEvalDrop(best, played)
    expect(result).toBe('good')
  })

  it('WIN → LOSS classifies as blunder', () => {
    const best = W - 5       // win in 5 plies
    const played = -(W - 3)  // lose in 3 plies
    const result = classifyEvalDrop(best, played)
    expect(result).toBe('blunder')
  })

  it('WIN → DRAW classifies as blunder', () => {
    const best = W - 5       // win in 5 plies
    const played = 0         // draw
    const result = classifyEvalDrop(best, played)
    expect(result).toBe('blunder')
  })

  it('DRAW → LOSS classifies as blunder', () => {
    const best = 0           // draw
    const played = -(W - 3)  // lose in 3 plies
    const result = classifyEvalDrop(best, played)
    expect(result).toBe('blunder')
  })

  it('both WIN → good (regardless of mate distance delta)', () => {
    const best = W - 2       // win in 2 plies
    const played = W - 10    // win in 10 plies — much slower, but still winning
    const result = classifyEvalDrop(best, played)
    expect(result).toBe('good')
  })

  it('both WIN, identical scores → good', () => {
    const best = W - 5
    const played = W - 5
    const result = classifyEvalDrop(best, played)
    expect(result).toBe('good')
  })

  it('ongoing deltas bucket correctly — excellent', () => {
    // Small delta
    expect(classifyEvalDrop(5.0, 4.8)).toBe('excellent')   // delta 0.2
    expect(classifyEvalDrop(3.0, 2.7)).toBe('excellent')   // delta 0.3
  })

  it('ongoing deltas bucket correctly — good', () => {
    expect(classifyEvalDrop(5.0, 4.5)).toBe('good')        // delta 0.5
    expect(classifyEvalDrop(3.0, 2.0)).toBe('good')        // delta 1.0
  })

  it('ongoing deltas bucket correctly — inaccuracy', () => {
    expect(classifyEvalDrop(5.0, 3.1)).toBe('inaccuracy')  // delta 1.9
    expect(classifyEvalDrop(5.0, 3.0)).toBe('inaccuracy')  // delta 2.0
  })

  it('ongoing deltas bucket correctly — mistake', () => {
    expect(classifyEvalDrop(5.0, 2.0)).toBe('mistake')     // delta 3.0
    expect(classifyEvalDrop(5.0, 1.1)).toBe('mistake')     // delta 3.9
  })

  it('ongoing deltas bucket correctly — blunder', () => {
    expect(classifyEvalDrop(5.0, 0.5)).toBe('blunder')     // delta 4.5
  })

  it('ONGOING → LOSS classifies as blunder (explicit rule)', () => {
    const best = 5.0
    const played = -(W - M - 1)
    const result = classifyEvalDrop(best, played)
    expect(result).toBe('blunder')
  })

  it('WIN → ONGOING classifies as at least mistake (small delta)', () => {
    const best = W - M + 1    // 9001 (WIN)
    const played = W - M - 1  // 8999 (ONGOING)
    const result = classifyEvalDrop(best, played)
    expect(result).toBe('mistake')
  })

  it('WIN → ONGOING escalates to blunder on large delta', () => {
    const best = W - 5         // WIN
    const played = 3.0         // ONGOING
    const result = classifyEvalDrop(best, played)
    expect(result).toBe('blunder')
  })

  it('WIN → ONGOING with delta at blunder threshold (4.0) is mistake', () => {
    const best = W - M + 1       // 9001 (WIN)
    const played = best - 4.0    // 8997 (ONGOING, just below WIN band)
    expect(played).toBeLessThan(W - M)
    expect(classifyEvalDrop(best, played)).toBe('mistake')
  })

  it('WIN → ONGOING with delta just above blunder threshold (4.1) is blunder', () => {
    const best = W - M + 1       // 9001 (WIN)
    const played = best - 4.1    // 8996.9 (ONGOING)
    expect(played).toBeLessThan(W - M)
    expect(classifyEvalDrop(best, played)).toBe('blunder')
  })

  it('ONGOING → LOSS is always blunder even with small delta', () => {
    const best = -(W - M) + 1   // -8999 (ONGOING, just above LOSS band)
    const played = best - 2     // -9001 (LOSS, just into LOSS band)
    const result = classifyEvalDrop(best, played)
    expect(result).toBe('blunder')
  })

  it('ONGOING → LOSS with large delta is blunder', () => {
    const best = 5.0
    const played = -(W - 5)
    const result = classifyEvalDrop(best, played)
    expect(result).toBe('blunder')
  })

  it('DRAW → ONGOING uses stone-delta thresholds', () => {
    const best = 0
    const played = 0.5
    expect(classifyEvalDrop(best, played)).toBe('excellent')  // delta 0.5
  })

  it('ongoing both negative uses stone-delta', () => {
    expect(classifyEvalDrop(-1.0, -3.5)).toBe('mistake')  // delta 2.5 → mistake (2.0 < 2.5 <= 4.0)
    expect(classifyEvalDrop(-1.0, -6.0)).toBe('blunder')   // delta 5.0 → blunder
  })

  it('edge: best eval exactly at mate-band boundary', () => {
    const boundary = W - M  // 9000
    // boundary is WIN (>= 9000), boundary-0.1 is ONGOING (< 9000)
    // WIN → ONGOING with delta 0.1: at least 'mistake'
    const result = classifyEvalDrop(boundary, boundary - 0.1)
    expect(result).toBe('mistake')
  })

  it('edge: best WIN, played at border not WIN', () => {
    const best = W - M + 1   // just inside WIN band
    const played = W - M - 1 // just outside WIN band (ONGOING)
    const result = classifyEvalDrop(best, played)
    // WIN → ONGOING with delta 2: at least 'mistake'
    expect(result).toBe('mistake')
  })
})
