import { describe, it, expect } from 'vitest'
import type { GameState } from '../index'
import {
  generateTablebase,
  createTablebaseProbe,
  getOffsets,
  countPitStones,
  extractPits,
  createInitialState,
  applyMove,
  legalMoves,
  MANGALA_STANDARD,
  BOTTOM_STORE,
  TOP_STORE,
} from '../index'

describe('Mangala tablebase generation correctness', () => {
  it('K=0: empty board, both sides TB=0', () => {
    const { table, nonProbeableCount } = generateTablebase(0, MANGALA_STANDARD)
    expect(table).toHaveLength(2)
    expect(nonProbeableCount).toBe(0)
    expect(table[0]).toBe(0)
    expect(table[1]).toBe(0)
  })

  it('K=3: all entries within [-3, 3], no non-probeable entries', () => {
    const { table, nonProbeableCount } = generateTablebase(3, MANGALA_STANDARD)
    expect(nonProbeableCount).toBe(0)
    for (let i = 0; i < table.length; i++) {
      expect(table[i]).toBeGreaterThanOrEqual(-3)
      expect(table[i]).toBeLessThanOrEqual(3)
    }
  })

  it('K=6: all entries within [-6, 6], reports non-probeable count', () => {
    const { table, nonProbeableCount } = generateTablebase(6, MANGALA_STANDARD)
    console.log(`[MANGALA TB K=6] nonProbeableCount = ${nonProbeableCount}`)
    for (let i = 0; i < table.length; i++) {
      expect(table[i]).toBeGreaterThanOrEqual(-6)
      expect(table[i]).toBeLessThanOrEqual(6)
    }
  })
})

describe('Mangala tablebase cross-validation against full search (K=6)', () => {
  // In Mangala — because total stones don't decompose as neatly as Kalah
  // (store contents CAN change via capture/sweep mid-game) — the proven
  // relationship is: storeDiff_before + TB(pits, sideToMove) == finalDiff.
  function minimaxExactDiff(
    state: GameState,
    rules = MANGALA_STANDARD,
    depth = 0,
  ): number {
    if (state.status === 'finished') {
      const own = state.currentPlayer === 'bottom' ? BOTTOM_STORE : TOP_STORE
      const opp = state.currentPlayer === 'bottom' ? TOP_STORE : BOTTOM_STORE
      return (state.board[own] ?? 0) - (state.board[opp] ?? 0)
    }

    // Safety depth cap — with ≤6 pit stones this should never be reached
    if (depth > 80) {
      const own = state.currentPlayer === 'bottom' ? BOTTOM_STORE : TOP_STORE
      const opp = state.currentPlayer === 'bottom' ? TOP_STORE : BOTTOM_STORE
      return (state.board[own] ?? 0) - (state.board[opp] ?? 0)
    }

    const moves = legalMoves(state, rules)
    if (moves.length === 0) {
      const own = state.currentPlayer === 'bottom' ? BOTTOM_STORE : TOP_STORE
      const opp = state.currentPlayer === 'bottom' ? TOP_STORE : BOTTOM_STORE
      return (state.board[own] ?? 0) - (state.board[opp] ?? 0)
    }

    let best = -Infinity
    for (const pit of moves) {
      const child = applyMove(state, pit, rules)
      if (child.moveHistory.length === 0) continue
      const lastMove = child.moveHistory[child.moveHistory.length - 1]!

      let v: number
      if (lastMove.wasExtraTurn) {
        v = minimaxExactDiff({ ...child, currentPlayer: state.currentPlayer }, rules, depth + 1)
      } else {
        // Negate because perspective switches
        v = -minimaxExactDiff(child, rules, depth + 1)
      }
      if (v > best) best = v
    }
    return best
  }

  it('TB values match full minimax to terminal for reachable Mangala positions (≤6 pit stones)', () => {
    const K = 6
    const { table, nonProbeableCount } = generateTablebase(K, MANGALA_STANDARD)
    console.log(`[MANGALA TB CROSS-VALIDATION] nonProbeableCount = ${nonProbeableCount}`)
    // Zero expected for correctness; a small nonzero count is acceptable
    // if the dual-fixpoint machinery flagged them as designed.

    const offsets = getOffsets(K)
    const probe = createTablebaseProbe(table, offsets, K)

    // Seeded random play-outs from Mangala initial position
    function seededRandom(seed: number): () => number {
      let s = seed
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff
        return s / 0x7fffffff
      }
    }

    const positions: Array<{ state: GameState; pits: Uint8Array }> = []
    const targetPositions = 200

    for (let seed = 0; positions.length < targetPositions && seed < targetPositions * 10; seed++) {
      const rng = seededRandom(seed * 137 + 1)
      let state = createInitialState(MANGALA_STANDARD)
      let steps = 0

      while (countPitStones(state) > K && state.status === 'in-progress' && steps < 600) {
        const legal = legalMoves(state, MANGALA_STANDARD)
        if (legal.length === 0) break
        const idx = Math.floor(rng() * legal.length)
        state = applyMove(state, legal[idx]!, MANGALA_STANDARD)
        steps++
      }

      if (countPitStones(state) <= K && state.status === 'in-progress' && countPitStones(state) > 0) {
        const pits = extractPits(state.board)
        // Deduplicate by pits as string
        const key = [...pits].join(',') + '|' + state.currentPlayer
        if (!positions.some(p => [...p.pits].join(',') + '|' + p.state.currentPlayer === key)) {
          positions.push({ state, pits })
        }
      }
    }

    console.log(`[MANGALA TB CROSS-VALIDATION] collected ${positions.length} unique reachable positions`)
    expect(positions.length).toBeGreaterThanOrEqual(100)

    let mismatches = 0
    let notProbeable = 0
    for (const { state, pits } of positions) {
      const tb = probe(pits, state.currentPlayer)
      if (tb === undefined) {
        notProbeable++
        continue
      }

      const ownStore = state.currentPlayer === 'bottom' ? BOTTOM_STORE : TOP_STORE
      const oppStore = state.currentPlayer === 'bottom' ? TOP_STORE : BOTTOM_STORE
      const sd = (state.board[ownStore] ?? 0) - (state.board[oppStore] ?? 0)

      const exact = minimaxExactDiff(state)
      const predicted = sd + tb

      if (predicted !== exact) {
        mismatches++
      }
    }

    const totalTested = positions.length - notProbeable
    console.log(`[MANGALA TB CROSS-VALIDATION] tested=${totalTested}, notProbeable=${notProbeable}, mismatches=${mismatches}`)
    expect(mismatches).toBe(0)
  })
})

describe('Mangala tablebase — stone conservation', () => {
  it('every position reached during random play-outs conserves 48 total stones', () => {
    function seededRandom(seed: number): () => number {
      let s = seed
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff
        return s / 0x7fffffff
      }
    }

    for (let seed = 0; seed < 50; seed++) {
      const rng = seededRandom(seed * 199 + 7)
      let state = createInitialState(MANGALA_STANDARD)
      let steps = 0

      while (state.status === 'in-progress' && steps < 200) {
        const legal = legalMoves(state, MANGALA_STANDARD)
        if (legal.length === 0) break
        const idx = Math.floor(rng() * legal.length)
        const next = applyMove(state, legal[idx]!, MANGALA_STANDARD)

        let total = 0
        for (const v of next.board) total += v
        expect(total).toBe(48)

        state = next
        steps++
      }
    }
  })
})
