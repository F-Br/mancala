import { describe, it, expect } from 'vitest'
import type { GameState, Side } from '../index'
import {
  binom,
  compositionsCount,
  rankPits,
  unrankPits,
  generateTablebase,
  createTablebaseProbe,
  encodeProven,
  countPitStones,
  extractPits,
  createInitialState,
  applyMove,
  legalMoves,
  KALAH_STANDARD,
  sizeAssertion,

  BOTTOM_STORE,
  TOP_STORE,
  getOffsets,
} from '../index'

describe('binomial coefficients', () => {
  it('edge cases', () => {
    expect(binom(0, 0)).toBe(1)
    expect(binom(5, 0)).toBe(1)
    expect(binom(5, 5)).toBe(1)
    expect(binom(5, -1)).toBe(0)
    expect(binom(5, 6)).toBe(0)
  })

  it('C(24,12) = 2704156 (verify sizing)', () => {
    expect(binom(24, 12)).toBe(2704156)
  })

  it('C(23,11) = 1352078', () => {
    expect(binom(23, 11)).toBe(1352078)
  })
})

describe('compositionsCount', () => {
  it('k=0, n=3 → 1', () => expect(compositionsCount(0, 3)).toBe(1))
  it('k=1, n=3 → 3', () => expect(compositionsCount(1, 3)).toBe(3))
  it('k=2, n=3 → 6', () => expect(compositionsCount(2, 3)).toBe(6))
  it('k=3, n=3 → 10 = C(5,2)', () => expect(compositionsCount(3, 3)).toBe(10))
  it('k=12, n=12 → C(23,11) = 1352078', () => {
    expect(compositionsCount(12, 12)).toBe(binom(23, 11))
  })
})

describe('rank/unrank bijection (12 pits, exhaustive for small k)', () => {
  it('k=0: single configuration → rank 0', () => {
    const pits = new Uint8Array(12)
    expect(rankPits(pits, 0)).toBe(0)
    const back = unrankPits(0, 0)
    expect([...back]).toEqual([...pits])
  })

  it('k=1: 12 configurations, rank is bijection onto [0,11]', () => {
    const count = compositionsCount(1, 12)
    expect(count).toBe(12)
    const seen = new Set<string>()
    for (let r = 0; r < 12; r++) {
      const p = unrankPits(r, 1)
      const sum = p.reduce((a, b) => a + b, 0)
      expect(sum).toBe(1)
      expect(rankPits(p, 1)).toBe(r)
      seen.add([...p].join(','))
    }
    expect(seen.size).toBe(12)
  })

  it('k=2: 78 compositions, rank is bijection onto [0,77]', () => {
    const count = compositionsCount(2, 12)
    expect(count).toBe(78)
    const seen = new Set<string>()
    for (let r = 0; r < 78; r++) {
      const p = unrankPits(r, 2)
      expect(p.reduce((a, b) => a + b, 0)).toBe(2)
      expect(rankPits(p, 2)).toBe(r)
      seen.add([...p].join(','))
    }
    expect(seen.size).toBe(78)
  })

  it('k=3: 364 compositions = C(14,11), bijection', () => {
    const count = compositionsCount(3, 12)
    expect(count).toBe(364)
    const seen = new Set<string>()
    for (let r = 0; r < 364; r++) {
      const p = unrankPits(r, 3)
      expect(p.reduce((a, b) => a + b, 0)).toBe(3)
      expect(rankPits(p, 3)).toBe(r)
      seen.add([...p].join(','))
    }
    expect(seen.size).toBe(364)
  })
})

describe('rank/unrank spot-tests (12 pits)', () => {
  it('round-trip for various configurations', () => {
    const cases: [number[], number][] = [
      [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0],
      [[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 1],
      [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], 1],
      [[0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], 1],
      [[1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 2],
      [[0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0], 2],
      [[1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], 2],
      [[3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], 6],
      [[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 12],
      [[12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 12],
      [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 12], 12],
    ]
    for (const [pits, k] of cases) {
      const arr = new Uint8Array(pits)
      const r = rankPits(arr, k)
      const back = unrankPits(r, k)
      expect([...back]).toEqual(pits)
    }
  })

  it('all ranks are distinct for k=4', () => {
    const count = compositionsCount(4, 12)
    const seen = new Set<number>()
    for (let r = 0; r < count; r++) {
      const pits = unrankPits(r, 4)
      const sum = pits.reduce((a, b) => a + b, 0)
      expect(sum).toBe(4)
      expect(rankPits(pits, 4)).toBe(r)
      seen.add(r)
    }
    expect(seen.size).toBe(count)
  })
})

describe('size assertion', () => {
  it('K=12 → 5,408,312 entries', () => {
    expect(sizeAssertion(12)).toBe(5408312)
  })

  it('K=0 → 2 entries', () => {
    expect(sizeAssertion(0)).toBe(2)
  })
})

describe('encodeProven', () => {
  it('zero', () => expect(encodeProven(0)).toBe(0))

  it('positive values', () => {
    expect(encodeProven(1)).toBe(9020)
    expect(encodeProven(2)).toBe(9040)
    expect(encodeProven(48)).toBe(9960)
  })

  it('negative values', () => {
    expect(encodeProven(-1)).toBe(-9020)
    expect(encodeProven(-12)).toBe(-9240)
  })

  it('monotonic: larger margins → larger scores', () => {
    expect(encodeProven(5)).toBeGreaterThan(encodeProven(3))
    expect(encodeProven(-3)).toBeGreaterThan(encodeProven(-5))
  })

  it('satisfies evalToCategory WIN/LOSS/DRAW constraint', () => {
    // WIN: evalScore >= 9000
    expect(encodeProven(1) >= 9000).toBe(true)
    // LOSS: evalScore <= -9000
    expect(encodeProven(-1) <= -9000).toBe(true)
  })
})

describe('tablebase generation correctness', () => {
  it('K=0: empty board, both sides TB=0 (no stones → sweep = 0)', () => {
    const { table, nonProbeableCount } = generateTablebase(0)
    expect(table).toHaveLength(2)
    expect(nonProbeableCount).toBe(0)
    expect(table[0]).toBe(0)
    expect(table[1]).toBe(0)
  })

  it('K=1: values within [-1, 1], no non-probeable entries', () => {
    const { table, nonProbeableCount } = generateTablebase(1)
    expect(nonProbeableCount).toBe(0)
    for (let i = 0; i < table.length; i++) {
      expect(table[i]).toBeGreaterThanOrEqual(-1)
      expect(table[i]).toBeLessThanOrEqual(1)
    }
  })

  it('K=3: all entries within [-3, 3], no non-probeable entries', () => {
    const { table, nonProbeableCount } = generateTablebase(3)
    expect(nonProbeableCount).toBe(0)
    for (let i = 0; i < table.length; i++) {
      expect(table[i]).toBeGreaterThanOrEqual(-3)
      expect(table[i]).toBeLessThanOrEqual(3)
    }
  })

  it('K=6: all entries within [-6, 6], no non-probeable entries', () => {
    const { table, nonProbeableCount } = generateTablebase(6)
    expect(nonProbeableCount).toBe(0)
    for (let i = 0; i < table.length; i++) {
      expect(table[i]).toBeGreaterThanOrEqual(-6)
      expect(table[i]).toBeLessThanOrEqual(6)
    }
  })
})

describe('tablebase cross-validation against full search (K=4)', () => {
  function minimaxExactDiff(
    state: GameState,
    perspective: Side,
  ): number {
    if (state.status === 'finished') {
      const own = perspective === 'bottom' ? BOTTOM_STORE : TOP_STORE
      const opp = perspective === 'bottom' ? TOP_STORE : BOTTOM_STORE
      return (state.board[own] ?? 0) - (state.board[opp] ?? 0)
    }

    const moves = legalMoves(state, KALAH_STANDARD)
    if (moves.length === 0) {
      const own = perspective === 'bottom' ? BOTTOM_STORE : TOP_STORE
      const opp = perspective === 'bottom' ? TOP_STORE : BOTTOM_STORE
      return (state.board[own] ?? 0) - (state.board[opp] ?? 0)
    }

    if (state.currentPlayer === perspective) {
      let best = -Infinity
      for (const pit of moves) {
        const child = applyMove(state, pit, KALAH_STANDARD)
        const v = minimaxExactDiff(child, perspective)
        if (v > best) best = v
      }
      return best
    } else {
      let worst = +Infinity
      for (const pit of moves) {
        const child = applyMove(state, pit, KALAH_STANDARD)
        const v = minimaxExactDiff(child, perspective)
        if (v < worst) worst = v
      }
      return worst
    }
  }

  it('TB values match full minimax to terminal for reachable positions', () => {
    const K = 4
    const { table, nonProbeableCount } = generateTablebase(K)
    expect(nonProbeableCount).toBe(0)

    const offsets = getOffsets(K)
    const probe = createTablebaseProbe(table, offsets, K)

    const positions: Array<{ state: GameState; pits: Uint8Array }> = []

    for (let seed = 0; seed < 300; seed++) {
      let state = createInitialState()
      let steps = 0
      while (countPitStones(state) > K && state.status === 'in-progress' && steps < 600) {
        const legal = legalMoves(state, KALAH_STANDARD)
        if (legal.length === 0) break
        const idx = ((seed * 137 + steps * 9973) ^ (steps << 5)) % legal.length
        state = applyMove(state, legal[Math.abs(idx)]!, KALAH_STANDARD)
        steps++
      }
      if (countPitStones(state) <= K && state.status === 'in-progress') {
        const pits = extractPits(state.board)
        positions.push({ state, pits })
      }
    }

    expect(positions.length).toBeGreaterThan(0)

    let mismatches = 0
    for (const { state, pits } of positions) {
      const tb = probe(pits, state.currentPlayer)
      if (tb === undefined) {
        mismatches++
        continue
      }

      const ownStore = state.currentPlayer === 'bottom' ? BOTTOM_STORE : TOP_STORE
      const oppStore = state.currentPlayer === 'bottom' ? TOP_STORE : BOTTOM_STORE
      const sd = (state.board[ownStore] ?? 0) - (state.board[oppStore] ?? 0)

      const exact = minimaxExactDiff(state, state.currentPlayer)
      const predicted = sd + tb

      if (predicted !== exact) {
        mismatches++
      }
    }

    // All must match
    expect(mismatches).toBe(0)
  })
})

describe('extractPits and countPitStones', () => {
  it('extractPits extracts correct 12 values from 14-board', () => {
    const board = [1, 2, 3, 0, 1, 2, 10, 4, 5, 0, 1, 2, 3, 15]
    const pits = extractPits(board)
    expect([...pits]).toEqual([1, 2, 3, 0, 1, 2, 4, 5, 0, 1, 2, 3])
  })

  it('countPitStones counts only pits, not stores', () => {
    const state = createInitialState()
    expect(countPitStones(state)).toBe(48)

    const moved = applyMove(state, 0)
    // 4 stones from pit 0 → pits 1,2,3,4; store diff = 0; all 48 still in pits
    expect(countPitStones(moved)).toBe(48)

    const moved2 = applyMove(state, 2)
    // pit 2 (4 stones) → one lands in store (idx 6), so 47 pit stones
    expect(countPitStones(moved2)).toBe(47)
  })
})
