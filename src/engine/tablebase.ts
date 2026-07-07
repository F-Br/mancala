import type { Side, RuleConfig, GameState } from './types'
import { BOTTOM_STORE, TOP_STORE } from './types'
import { KALAH_STANDARD } from './rules'
import { applyMove } from './moves'

const PITS = 12

export const NON_PROBEABLE = -128

export interface TbProgressMsg {
  type: 'tbProgress'
  level: number
  percent: number
}

const maxN = 30
const _B = (maxN + 1) * (maxN + 1)
const _binomial: number[] = (() => {
  const t = new Array<number>(_B).fill(0)
  for (let n = 0; n <= maxN; n++) {
    t[n * (maxN + 1) + 0] = 1
    t[n * (maxN + 1) + n] = 1
    for (let k = 1; k < n; k++) {
      t[n * (maxN + 1) + k] =
        t[(n - 1) * (maxN + 1) + (k - 1)]! +
        t[(n - 1) * (maxN + 1) + k]!
    }
  }
  return t
})()

export function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  return _binomial[n * (maxN + 1) + k]!
}

export function compositionsCount(k: number, slots: number): number {
  return binom(k + slots - 1, slots - 1)
}

export function rankPits(pits: Uint8Array | number[], k: number): number {
  let r = 0
  let rem = k
  for (let i = 0; i < PITS - 1; i++) {
    const a = pits[i]!
    if (a > 0) {
      const t = PITS - i - 2
      for (let v = 0; v < a; v++) {
        r += binom(rem - v + t, t)
      }
    }
    rem -= a
  }
  return r
}

export function unrankPits(rank: number, k: number): Uint8Array {
  const pits = new Uint8Array(PITS)
  let rem = k
  for (let i = 0; i < PITS - 1; i++) {
    let a = 0
    const t = PITS - i - 2
    while (rem > 0) {
      const ways = binom(rem + t, t)
      if (rank >= ways) {
        rank -= ways
        a++
        rem--
      } else {
        break
      }
    }
    pits[i] = a
  }
  pits[PITS - 1] = rem
  return pits
}

function totalPitStones(pits: Uint8Array | number[]): number {
  let s = 0
  for (let i = 0; i < PITS; i++) s += pits[i]!
  return s
}

export function countPitStones(state: GameState): number {
  let s = 0
  const b = state.board
  for (let i = 0; i < 6; i++) s += (b[i] ?? 0) + (b[7 + i] ?? 0)
  return s
}

function opponent(s: Side): Side {
  return s === 'bottom' ? 'top' : 'bottom'
}

function isAllZero(pits: Uint8Array | number[], start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    if (pits[i] !== 0) return false
  }
  return true
}

function pitsToFullBoard(pits: Uint8Array | number[]): number[] {
  return [
    pits[0]!, pits[1]!, pits[2]!, pits[3]!, pits[4]!, pits[5]!,
    0,
    pits[6]!, pits[7]!, pits[8]!, pits[9]!, pits[10]!, pits[11]!,
    0,
  ]
}

export function extractPits(
  board: number[] | Uint8Array,
  out?: Uint8Array,
): Uint8Array {
  const pits = out ?? new Uint8Array(PITS)
  for (let i = 0; i < 6; i++) pits[i] = board[i]!
  for (let i = 0; i < 6; i++) pits[6 + i] = board[7 + i]!
  return pits
}

export function encodeProven(finalDiff: number): number {
  if (finalDiff === 0) return 0
  const sign = finalDiff > 0 ? 1 : -1
  return sign * (9000 + Math.abs(finalDiff) * 20)
}

export function sizeAssertion(K: number): number {
  return 2 * compositionsCount(K, PITS + 1)
}

function makeOffsets(K: number): number[] {
  const o = new Array<number>(K + 2)
  o[0] = 0
  for (let k = 0; k <= K; k++) {
    o[k + 1] = o[k]! + 2 * compositionsCount(k, PITS)
  }
  return o
}

function evaluateMove(
  pits: Uint8Array | number[],
  side: Side,
  pitIndex: number,
  rules: RuleConfig,
  getTB: (p: Uint8Array | number[], s: Side) => number,
): {
  v: number
  successorPits: Uint8Array
  successorSide: Side
  gameOver: boolean
  wasExtraTurn: boolean
} {
  const ownStore = side === 'bottom' ? BOTTOM_STORE : TOP_STORE
  const oppStore = side === 'bottom' ? TOP_STORE : BOTTOM_STORE
  const fullBoard = pitsToFullBoard(pits)

  const state: GameState = {
    board: fullBoard,
    currentPlayer: side,
    status: 'in-progress',
    winner: null,
    moveHistory: [],
  }

  const result = applyMove(state, pitIndex, rules)
  const newPits = extractPits(result.board)
  const move = result.moveHistory[result.moveHistory.length - 1]!

  if (result.status === 'finished') {
    const v = (result.board[ownStore] ?? 0) - (result.board[oppStore] ?? 0)
    return {
      v,
      successorPits: newPits,
      successorSide: side,
      gameOver: true,
      wasExtraTurn: false,
    }
  }

  const b = (result.board[ownStore] ?? 0) - (fullBoard[ownStore] ?? 0)

  if (move.wasExtraTurn) {
    return {
      v: b + getTB(newPits, side),
      successorPits: newPits,
      successorSide: side,
      gameOver: false,
      wasExtraTurn: true,
    }
  }

  return {
    v: b - getTB(newPits, opponent(side)),
    successorPits: newPits,
    successorSide: opponent(side),
    gameOver: false,
    wasExtraTurn: false,
  }
}

function computeTBEntry(
  pits: Uint8Array | number[],
  side: Side,
  rules: RuleConfig,
  getTB: (p: Uint8Array | number[], s: Side) => number,
): number {
  const sideStart = side === 'bottom' ? 0 : 6
  const sideEnd = side === 'bottom' ? 6 : 12

  if (isAllZero(pits, sideStart, sideEnd)) {
    const oppStart = side === 'bottom' ? 6 : 0
    const oppEnd = side === 'bottom' ? 12 : 6
    let oppSum = 0
    for (let i = oppStart; i < oppEnd; i++) oppSum += pits[i]!
    return -oppSum
  }

  const boardStart = side === 'bottom' ? 0 : 7
  const boardEnd = side === 'bottom' ? 6 : 13
  const fullBoard = pitsToFullBoard(pits)

  let best = -Infinity
  for (let bi = boardStart; bi < boardEnd; bi++) {
    if (fullBoard[bi] === 0) continue
    const ev = evaluateMove(pits, side, bi, rules, getTB)
    if (ev.v > best) best = ev.v
  }

  return best
}

export function generateTablebase(
  K: number,
  rules: RuleConfig = KALAH_STANDARD,
  postMsg?: (msg: TbProgressMsg) => void,
): { table: Int8Array; nonProbeableCount: number } {
  const offsets = makeOffsets(K)
  const total = offsets[K + 1]!
  const table = new Int8Array(total)
  let nonProbeableCount = 0

  const getFinal = (p: Uint8Array | number[], s: Side): number => {
    const k = totalPitStones(p)
    const off = offsets[k]!
    const rank = rankPits(p, k)
    const ls = compositionsCount(k, PITS)
    const idx = off + rank + (s === 'bottom' ? 0 : ls)
    return table[idx]!
  }

  for (let k = 0; k <= K; k++) {
    const levelSize = compositionsCount(k, PITS)
    const levelStart = offsets[k]!
    const totalLevel = 2 * levelSize

    if (postMsg) {
      postMsg({ type: 'tbProgress', level: k, percent: Math.round((k / (K + 1)) * 95) })
    }

    // Enumerate all pit configurations for this level
    const allPits: number[][] = []
    for (let rank = 0; rank < levelSize; rank++) {
      allPits.push(Array.from(unrankPits(rank, k)))
    }

    // --- Phase 1: Pessimistic ---
    const pessArr = new Int8Array(totalLevel)
    for (let i = 0; i < totalLevel; i++) pessArr[i] = -k

    const getPessTB = (p: Uint8Array | number[], s: Side): number => {
      const pk = totalPitStones(p)
      if (pk < k) return getFinal(p, s)
      if (pk > k) throw new Error('bad pk')
      const r = rankPits(p, pk)
      const idx = r + (s === 'bottom' ? 0 : levelSize)
      return pessArr[idx]!
    }

    let changed = true
    while (changed) {
      changed = false
      for (let rank = 0; rank < levelSize; rank++) {
        const pits = allPits[rank]!

        const bIdx = rank
        const oldB = pessArr[bIdx]!
        const newB = computeTBEntry(pits, 'bottom', rules, getPessTB)
        if (newB !== oldB) { pessArr[bIdx] = newB; changed = true }

        const tIdx = levelSize + rank
        const oldT = pessArr[tIdx]!
        const newT = computeTBEntry(pits, 'top', rules, getPessTB)
        if (newT !== oldT) { pessArr[tIdx] = newT; changed = true }
      }
    }

    // --- Phase 2: Optimistic ---
    const optArr = new Int8Array(totalLevel)
    for (let i = 0; i < totalLevel; i++) optArr[i] = k

    const getOptTB = (p: Uint8Array | number[], s: Side): number => {
      const pk = totalPitStones(p)
      if (pk < k) return getFinal(p, s)
      if (pk > k) throw new Error('bad pk')
      const r = rankPits(p, pk)
      const idx = r + (s === 'bottom' ? 0 : levelSize)
      return optArr[idx]!
    }

    changed = true
    while (changed) {
      changed = false
      for (let rank = 0; rank < levelSize; rank++) {
        const pits = allPits[rank]!

        const bIdx = rank
        const oldB = optArr[bIdx]!
        const newB = computeTBEntry(pits, 'bottom', rules, getOptTB)
        if (newB !== oldB) { optArr[bIdx] = newB; changed = true }

        const tIdx = levelSize + rank
        const oldT = optArr[tIdx]!
        const newT = computeTBEntry(pits, 'top', rules, getOptTB)
        if (newT !== oldT) { optArr[tIdx] = newT; changed = true }
      }
    }

    // --- Phase 3: Compare and store ---
    for (let i = 0; i < totalLevel; i++) {
      const pv = pessArr[i]!
      const ov = optArr[i]!
      if (pv === ov) {
        table[levelStart + i] = pv
      } else {
        table[levelStart + i] = NON_PROBEABLE
        nonProbeableCount++
      }
    }
  }

  if (postMsg && nonProbeableCount > 0) {
    postMsg({ type: 'tbProgress', level: K, percent: 100 })
  }

  return { table, nonProbeableCount }
}

export function createTablebaseProbe(
  table: Int8Array,
  offsets: number[],
  maxK: number,
): (pits: Uint8Array, side: Side) => number | undefined {
  return (pits: Uint8Array, side: Side): number | undefined => {
    const k = totalPitStones(pits)
    if (k > maxK) return undefined
    const off = offsets[k]!
    const rank = rankPits(pits, k)
    const ls = compositionsCount(k, PITS)
    const idx = off + rank + (side === 'bottom' ? 0 : ls)
    const v = table[idx]!
    if (v === NON_PROBEABLE) return undefined
    return v
  }
}

export function getOffsets(K: number): number[] {
  return makeOffsets(K)
}

export function getTotalSize(K: number): number {
  return makeOffsets(K)[K + 1]!
}

export function pickTablebaseMove(
  pits: Uint8Array,
  side: Side,
  rules: RuleConfig,
  table: Int8Array,
  offsets: number[],
  maxK: number,
): number | undefined {
  const k = totalPitStones(pits)
  if (k > maxK) return undefined

  const off = offsets[k]!
  const r = rankPits(pits, k)
  const ls = compositionsCount(k, PITS)

  const idx = off + r + (side === 'bottom' ? 0 : ls)
  const tbVal = table[idx]!
  if (tbVal === NON_PROBEABLE) return undefined

  const ownStore = side === 'bottom' ? BOTTOM_STORE : TOP_STORE
  const oppStore = side === 'bottom' ? TOP_STORE : BOTTOM_STORE
  const fullBoard = pitsToFullBoard(pits)

  const makeState = (): GameState => ({
    board: fullBoard,
    currentPlayer: side,
    status: 'in-progress',
    winner: null,
    moveHistory: [],
  })

  const lookup = (p: Uint8Array, s: Side): number => {
    const pk = totalPitStones(p)
    const poff = offsets[pk]!
    const pr = rankPits(p, pk)
    const pls = compositionsCount(pk, PITS)
    return table[poff + pr + (s === 'bottom' ? 0 : pls)]!
  }

  const boardStart = side === 'bottom' ? 0 : 7
  const boardEnd = side === 'bottom' ? 6 : 13

  let bestMove: number | undefined
  let bestV = -Infinity
  let bestB = -Infinity

  for (let bi = boardStart; bi < boardEnd; bi++) {
    if (fullBoard[bi] === 0) continue

    const result = applyMove(makeState(), bi, rules)
    if (result.moveHistory.length === 0) continue

    let v: number
    let b: number

    if (result.status === 'finished') {
      v = (result.board[ownStore] ?? 0) - (result.board[oppStore] ?? 0)
      b = v // no better separation for terminal
    } else {
      b = (result.board[ownStore] ?? 0) - (fullBoard[ownStore] ?? 0)
      const newPits = extractPits(result.board)
      const move = result.moveHistory[result.moveHistory.length - 1]!
      if (move.wasExtraTurn) {
        v = b + lookup(newPits, side)
      } else {
        v = b - lookup(newPits, opponent(side))
      }
    }

    if (
      v > bestV ||
      (v === bestV && b > bestB) ||
      (v === bestV && b === bestB && (bestMove === undefined || bi < bestMove))
    ) {
      bestV = v
      bestB = b
      bestMove = bi
    }
  }

  return bestMove
}

export type TablebaseBestMoveFn = (state: GameState) => number | undefined

export function createTablebaseBestMove(
  table: Int8Array,
  offsets: number[],
  maxK: number,
  rules: RuleConfig,
): TablebaseBestMoveFn {
  return (state: GameState): number | undefined => {
    const pits = extractPits(state.board)
    return pickTablebaseMove(pits, state.currentPlayer, rules, table, offsets, maxK)
  }
}
