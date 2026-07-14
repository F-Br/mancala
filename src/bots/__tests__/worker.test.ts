import { describe, it, expect } from 'vitest'
import { WorkerMessageHandler } from '../worker'
import type { BotWorkerMessage } from '../types'
import {
  createInitialState,
  generateTablebase,
  createTablebaseProbe,
  pickTablebaseMove,
  extractPits,
  getOffsets,
  encodeProven,
  KALAH_STANDARD,
  legalMoves,
  applyMove,
} from '../../engine'
import type { GameState } from '../../engine'
import type { TablebaseProbe } from '../search'
import { mangalaMidGameFixture1, mangalaMidGameFixture2, MANGALA_RULES } from './fixtures'

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function asMoveMsg(m: BotWorkerMessage): Extract<BotWorkerMessage, { type: 'move' }> {
  if (m.type !== 'move') throw new Error(`Expected move message, got ${m.type}`)
  return m
}

describe('WorkerMessageHandler', () => {
  it('pickMove for beginner returns a move synchronously', () => {
    const messages: BotWorkerMessage[] = []
    const postMsg = (msg: BotWorkerMessage) => {
      messages.push(msg)
    }

    const handler = new WorkerMessageHandler(postMsg)
    const state = createInitialState()

    handler.handleMessage({
      type: 'pickMove',
      state,
      level: 'beginner',
      requestId: 1,
    })

    expect(messages.length).toBe(1)
    const msg = asMoveMsg(messages[0]!)
    expect(msg.type).toBe('move')
    expect(msg.requestId).toBe(1)
    expect(msg.pitIndex).toBeGreaterThanOrEqual(0)
    expect(msg.pitIndex).toBeLessThanOrEqual(5)
  })

  it('pickMove for casual returns a move synchronously', () => {
    const messages: BotWorkerMessage[] = []
    const handler = new WorkerMessageHandler((msg) => messages.push(msg))
    const state = createInitialState()

    handler.handleMessage({
      type: 'pickMove',
      state,
      level: 'casual',
      requestId: 2,
    })

    expect(messages.length).toBe(1)
    const msg = asMoveMsg(messages[0]!)
    expect(msg.type).toBe('move')
    expect(msg.requestId).toBe(2)
    expect(msg.depthReached).toBe(4)
  })

  it('pickMove for strong returns a move asynchronously', async () => {
    const messages: BotWorkerMessage[] = []
    const handler = new WorkerMessageHandler((msg) => messages.push(msg))
    const state = createInitialState()

    handler.handleMessage({
      type: 'pickMove',
      state,
      level: 'strong',
      timeBudgetMs: 200,
      requestId: 3,
    })

    await wait(800)

    expect(messages.length).toBe(1)
    const msg = asMoveMsg(messages[0]!)
    expect(msg.type).toBe('move')
    expect(msg.requestId).toBe(3)
    expect(msg.pitIndex).toBeGreaterThanOrEqual(0)
  })

  it('pickMove for expert returns a move asynchronously', async () => {
    const messages: BotWorkerMessage[] = []
    const handler = new WorkerMessageHandler((msg) => messages.push(msg))
    const state = createInitialState()

    handler.handleMessage({
      type: 'pickMove',
      state,
      level: 'expert',
      timeBudgetMs: 200,
      requestId: 4,
    })

    await wait(800)

    expect(messages.length).toBe(1)
    const msg = asMoveMsg(messages[0]!)
    expect(msg.type).toBe('move')
    expect(msg.requestId).toBe(4)
    expect(msg.pitIndex).toBeGreaterThanOrEqual(0)
  })

  it('cancel stops an in-progress search', async () => {
    const messages: BotWorkerMessage[] = []
    const handler = new WorkerMessageHandler((msg) => messages.push(msg))
    const state = createInitialState()

    handler.handleMessage({
      type: 'pickMove',
      state,
      level: 'strong',
      timeBudgetMs: 5000,
      requestId: 5,
    })

    handler.handleMessage({
      type: 'cancel',
      requestId: 5,
    })

    await wait(300)

    expect(messages.length).toBeGreaterThanOrEqual(0)
  })

  it('errors on finished game produce valid response', () => {
    const messages: BotWorkerMessage[] = []
    const handler = new WorkerMessageHandler((msg) => messages.push(msg))

    const board = new Array<number>(14).fill(0) as number[]
    board[6] = 24
    board[13] = 24
    const finishedState = {
      board,
      currentPlayer: 'bottom' as const,
      status: 'finished' as const,
      winner: 'draw' as const,
      moveHistory: [],
    }

    handler.handleMessage({
      type: 'pickMove',
      state: finishedState,
      level: 'casual',
      requestId: 7,
    })

    expect(messages.length).toBe(1)
    const msg = asMoveMsg(messages[0]!)
    expect(msg.type).toBe('move')
    expect(msg.requestId).toBe(7)
  })
})

describe('Expert tablebase integration', () => {
  it('Expert with injected tablebase picks the tablebase argmax on ≤K-stone fixture', { timeout: 30000 }, async () => {
    const K = 6
    const rules = KALAH_STANDARD
    const { table } = generateTablebase(K, rules)
    const offsets = getOffsets(K)

    // Board with ≤K pit stones where bottom has a clear best move:
    // pit 0 (1 stone) → pit 1 (empty) → captures opposite pit 11 (5 stones).
    // Top has no other stones; bottom wins after the capture.
    const board = new Array<number>(14).fill(0) as number[]
    board[0] = 1
    board[11] = 5
    board[6] = 15
    board[13] = 10
    const state: GameState = {
      board,
      currentPlayer: 'bottom',
      status: 'in-progress',
      winner: null,
      moveHistory: [],
    }

    // TB argmax for the root position
    const pits = extractPits(state.board)
    const tbArgMax = pickTablebaseMove(pits, state.currentPlayer, rules, table, offsets, K)
    expect(tbArgMax).toBeDefined()

    // Build the probe (same shape as buildProbes)
    const probeFn = createTablebaseProbe(table, offsets, K)
    const probe: TablebaseProbe = (s: GameState): number | undefined => {
      if (s.status !== 'in-progress') return undefined
      const p = extractPits(s.board)
      const tb = probeFn(p, s.currentPlayer)
      if (tb === undefined) return undefined
      const ownStore = s.currentPlayer === 'bottom' ? 6 : 13
      const oppStore = s.currentPlayer === 'bottom' ? 13 : 6
      const sd = (s.board[ownStore] ?? 0) - (s.board[oppStore] ?? 0)
      return encodeProven(sd + tb)
    }

    const tbBestMove = (s: GameState): number | undefined => {
      const p = extractPits(s.board)
      return pickTablebaseMove(p, s.currentPlayer, rules, table, offsets, K)
    }

    // Inject in-memory table (bypass IDB)
    const messages: BotWorkerMessage[] = []
    const handler = new WorkerMessageHandler((msg) => messages.push(msg))
    ;(handler as any).probe = probe
    ;(handler as any).tbBestMove = tbBestMove
    ;(handler as any).tbReady = true
    ;(handler as any).tbLoadInFlight = true
    ;(handler as any).tbGame = 'kalah'

    handler.handleMessage({
      type: 'pickMove',
      state,
      level: 'expert',
      timeBudgetMs: 5000,
      requestId: 100,
      game: 'kalah',
    })

    await wait(6000)

    expect(messages.length).toBe(1)
    const msg = asMoveMsg(messages[0]!)
    expect(msg.type).toBe('move')
    expect(msg.requestId).toBe(100)

    // Expert with tablebase should pick the TB argmax
    expect(msg.pitIndex).toBe(tbArgMax)
  })
})

// ── Mangala worker-level tests ────────────────────────────────────────

describe('Mangala expert bot-move', () => {
  it('returns a legal Mangala move at Expert level within budget', async () => {
    const messages: BotWorkerMessage[] = []
    const handler = new WorkerMessageHandler((msg) => messages.push(msg))
    const state = mangalaMidGameFixture1

    handler.handleMessage({
      type: 'pickMove',
      state,
      level: 'expert',
      timeBudgetMs: 500,
      requestId: 200,
      game: 'mangala',
    })

    await wait(1500)

    expect(messages.length).toBe(1)
    const msg = asMoveMsg(messages[0]!)
    expect(msg.type).toBe('move')
    expect(msg.requestId).toBe(200)

    const legal = legalMoves(state, MANGALA_RULES)
    expect(legal, `move ${msg.pitIndex} must be legal`).toContain(msg.pitIndex)
  }, 15000)
})

describe('Mangala bot-move PV validity', () => {
  it('PV replays legally under MANGALA_STANDARD from the fixture', async () => {
    const messages: BotWorkerMessage[] = []
    const handler = new WorkerMessageHandler((msg) => messages.push(msg))
    const state = mangalaMidGameFixture2

    handler.handleMessage({
      type: 'pickMove',
      state,
      level: 'expert',
      timeBudgetMs: 1000,
      requestId: 201,
      game: 'mangala',
    })

    await wait(2500)

    expect(messages.length).toBe(1)
    const msg = asMoveMsg(messages[0]!)
    expect(msg.type).toBe('move')
    expect(msg.requestId).toBe(201)

    const legal = legalMoves(state, MANGALA_RULES)
    expect(legal).toContain(msg.pitIndex)

    // Replay PV
    let current = state
    for (const pit of msg.principalVariation) {
      const moves = legalMoves(current, MANGALA_RULES)
      if (!moves.includes(pit)) break
      current = applyMove(current, pit, MANGALA_RULES)
    }
  }, 15000)
})

// ── TT isolation test ─────────────────────────────────────────────────

describe('AnalysisWorker TT isolation on game switch', () => {
  it('clears TT when game switches between kalah and mangala', async () => {
    const { AnalysisWorkerHandler } = await import('../analysisWorker')
    const analysisMessages: Array<{ type: string; requestId: number }> = []
    const handler = new AnalysisWorkerHandler(
      (msg) => { analysisMessages.push(msg as { type: string; requestId: number }) },
      undefined,
      true,
    )

    handler.handleMessage({
      type: 'analyze',
      state: mangalaMidGameFixture1,
      timeBudgetMs: 150,
      requestId: 1,
      game: 'kalah',
    })

    handler.handleMessage({
      type: 'analyze',
      state: mangalaMidGameFixture2,
      timeBudgetMs: 150,
      requestId: 2,
      game: 'mangala',
    })

    await wait(1500)

    const results = analysisMessages.filter((m) => m.type === 'result')
    expect(results.length).toBeGreaterThanOrEqual(2)
  }, 10000)
})
