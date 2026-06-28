import type { GameState } from '../engine'
import type { BotLevel } from './types'
import type { BotWorkerMessage } from './types'
import BotWorker from './worker?worker'

export interface BotMoveResult {
  pitIndex: number
  evalScore: number
  principalVariation: number[]
  depthReached: number
}

export interface BotMoveHandle {
  promise: Promise<BotMoveResult>
  cancel: () => void
}

type PendingRequest = {
  resolve: (result: BotMoveResult) => void
  reject: (error: Error) => void
}

let worker: Worker | null = null
let nextRequestId = 1
const pending = new Map<number, PendingRequest>()

function getWorker(): Worker {
  if (worker) return worker

  worker = new BotWorker()

  worker.onmessage = (
    event: MessageEvent<BotWorkerMessage>,
  ) => {
    const msg = event.data

    if (msg.type === 'move') {
      const entry = pending.get(msg.requestId)
      if (entry) {
        pending.delete(msg.requestId)
        entry.resolve({
          pitIndex: msg.pitIndex,
          evalScore: msg.evalScore,
          principalVariation: msg.principalVariation,
          depthReached: msg.depthReached,
        })
      }
    } else if (msg.type === 'error') {
      const entry = pending.get(msg.requestId)
      if (entry) {
        pending.delete(msg.requestId)
        entry.reject(new Error(msg.message))
      }
    }
  }

  worker.onerror = () => {
    const dead = worker
    worker = null
    for (const [id, entry] of pending) {
      pending.delete(id)
      entry.reject(new Error('Bot worker crashed'))
    }
    dead?.terminate()
  }

  return worker
}

export async function requestBotMove(
  state: GameState,
  level: BotLevel,
  opts?: { timeBudgetMs?: number },
): Promise<BotMoveHandle> {
  const w = getWorker()
  const requestId = nextRequestId++

  const promise = new Promise<BotMoveResult>((resolve, reject) => {
    pending.set(requestId, { resolve, reject })

    w.postMessage({
      type: 'pickMove',
      state,
      level,
      timeBudgetMs: opts?.timeBudgetMs,
      requestId,
    })
  })

  const cancel = () => {
    w.postMessage({
      type: 'cancel',
      requestId,
    })
  }

  return { promise, cancel }
}

export function terminateBotWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
    for (const [id, entry] of pending) {
      pending.delete(id)
      entry.reject(new Error('Bot worker terminated'))
    }
  }
}
