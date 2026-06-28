import type { GameState } from '../engine'
import type { AnalysisWorkerMessage } from './types'
import AnalysisWorker from './analysisWorker?worker'

export interface AnalysisResult {
  pitIndex: number
  evalScore: number
  principalVariation: number[]
  depthReached: number
}

export interface AnalysisHandle {
  promise: Promise<AnalysisResult>
  cancel: () => void
}

type PendingRequest = {
  resolve: (result: AnalysisResult) => void
  reject: (error: Error) => void
}

let worker: Worker | null = null
let nextRequestId = 1
const pending = new Map<number, PendingRequest>()

function getWorker(): Worker {
  if (worker) return worker

  worker = new AnalysisWorker()

  worker.onmessage = (event: MessageEvent<AnalysisWorkerMessage>) => {
    const msg = event.data

    if (msg.type === 'result') {
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
      entry.reject(new Error('Analysis worker crashed'))
    }
    dead?.terminate()
  }

  return worker
}

export async function requestAnalysis(
  state: GameState,
  timeBudgetMs: number,
): Promise<AnalysisHandle> {
  const w = getWorker()
  const requestId = nextRequestId++

  const promise = new Promise<AnalysisResult>((resolve, reject) => {
    pending.set(requestId, { resolve, reject })

    w.postMessage({
      type: 'analyze',
      state,
      timeBudgetMs,
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

export function terminateAnalysisWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
    for (const [id, entry] of pending) {
      pending.delete(id)
      entry.reject(new Error('Analysis worker terminated'))
    }
  }
}
