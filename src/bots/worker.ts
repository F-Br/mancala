import type { GameState, RuleConfig } from '../engine'
import { KALAH_STANDARD, legalMoves } from '../engine'
import { pickMoveBeginner, pickMoveCasual, minimaxWithAB, minimaxWithABTT } from './search'
import type { CancelSignal, SearchLimits } from './search'
import { TranspositionTable } from './search'
import { evaluateStrong, evaluateExpert, WIN_SCORE, MAX_PLY } from './evaluation'
import type { BotMessage, BotWorkerMessage, BotRequest } from './types'

export class WorkerMessageHandler {
  private currentCancel: CancelSignal | null = null
  private readonly postMsg: (msg: BotWorkerMessage) => void

  constructor(postMsg: (msg: BotWorkerMessage) => void) {
    this.postMsg = postMsg
  }

  handleMessage(msg: BotMessage): void {
    if (msg.type === 'cancel') {
      if (this.currentCancel) {
        this.currentCancel.cancelled = true
      }
      return
    }

    if (msg.type === 'pickMove') {
      this.handlePickMove(msg)
    }
  }

  private handlePickMove(msg: BotRequest): void {
    if (this.currentCancel) {
      this.currentCancel.cancelled = true
    }

    const cancelSignal: CancelSignal = { cancelled: false }
    this.currentCancel = cancelSignal

    const { state, level, timeBudgetMs, requestId } = msg
    const rules = KALAH_STANDARD

    try {
      if (level === 'beginner') {
        const pitIndex = pickMoveBeginner(state, rules)
        this.postMsg({
          type: 'move',
          pitIndex,
          evalScore: 0,
          principalVariation: pitIndex >= 0 ? [pitIndex] : [],
          depthReached: 0,
          requestId,
        })
        this.currentCancel = null
        return
      }

      if (level === 'casual') {
        const result = pickMoveCasual(state, rules, cancelSignal)
        if (cancelSignal.cancelled) {
          this.currentCancel = null
          return
        }
        this.postMsg({
          type: 'move',
          pitIndex: result.pv[0] ?? -1,
          evalScore: result.score,
          principalVariation: result.pv,
          depthReached: 4,
          requestId,
        })
        this.currentCancel = null
        return
      }

      this.runAsyncSearch(state, level, timeBudgetMs, rules, requestId, cancelSignal)
    } catch (err) {
      this.postMsg({
        type: 'error',
        requestId,
        message: err instanceof Error ? err.message : String(err),
      })
      this.currentCancel = null
    }
  }

  private runAsyncSearch(
    state: GameState,
    level: 'strong' | 'expert',
    timeBudgetMs: number | undefined,
    rules: RuleConfig,
    requestId: number,
    cancelSignal: CancelSignal,
  ): void {
    const startTime = performance.now()
    const budget = timeBudgetMs ?? (level === 'strong' ? 1500 : 3000)
    const deadlineMs = startTime + budget
    const evalFn = level === 'strong' ? evaluateStrong : evaluateExpert
    const tt: TranspositionTable | null = level === 'expert' ? new TranspositionTable() : null

    const limits: SearchLimits = {
      deadlineMs,
      nodeCount: 0,
      aborted: false,
      checkInterval: 2048,
    }

    let bestResult = { score: 0, pv: [] as number[], depth: 0 }
    let depth = 1

    const sendBestResult = (): void => {
      if (bestResult.pv.length === 0) {
        const moves = legalMoves(state, rules)
        if (moves.length > 0) {
          bestResult = {
            score: 0,
            pv: [moves[Math.floor(Math.random() * moves.length)]!],
            depth: 0,
          }
        }
      }
      this.postMsg({
        type: 'move',
        pitIndex: bestResult.pv[0] ?? -1,
        evalScore: bestResult.score,
        principalVariation: bestResult.pv,
        depthReached: bestResult.depth,
        requestId,
      })
      if (this.currentCancel === cancelSignal) {
        this.currentCancel = null
      }
    }

    const iterate = (): void => {
      if (cancelSignal.cancelled) {
        sendBestResult()
        return
      }
      if (performance.now() - startTime >= budget) {
        sendBestResult()
        return
      }

      limits.aborted = false

      let result: { score: number; pv: number[] }
      if (tt) {
        result = minimaxWithABTT(
          state,
          depth,
          -Infinity,
          +Infinity,
          rules,
          evalFn,
          tt,
          cancelSignal,
          undefined,
          1,
          0,
          0,
          depth === 1 ? undefined : limits,
        )
      } else {
        result = minimaxWithAB(
          state,
          depth,
          -Infinity,
          +Infinity,
          rules,
          evalFn,
          cancelSignal,
          undefined,
          1,
          0,
          0,
          depth === 1 ? undefined : limits,
        )
      }

      if (cancelSignal.cancelled) {
        sendBestResult()
        return
      }

      // Discard aborted mid-iteration results; keep last completed depth's result
      if (limits.aborted || isNaN(result.score)) {
        sendBestResult()
        return
      }

      bestResult = { score: result.score, pv: result.pv, depth }

      if (bestResult.score > WIN_SCORE - MAX_PLY) {
        sendBestResult()
        return
      }

      depth++
      setTimeout(iterate, 0)
    }

    setTimeout(iterate, 0)
  }
}

// Self-hosted worker entry
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  const handler = new WorkerMessageHandler((msg) => self.postMessage(msg))
  self.onmessage = (event: MessageEvent<BotMessage>) => {
    handler.handleMessage(event.data)
  }
}
