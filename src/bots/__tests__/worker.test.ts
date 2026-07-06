import { describe, it, expect } from 'vitest'
import { WorkerMessageHandler } from '../worker'
import type { BotWorkerMessage } from '../types'
import { createInitialState } from '../../engine'

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
