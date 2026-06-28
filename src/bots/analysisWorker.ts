import type { GameState, RuleConfig } from '../engine'
import { KALAH_STANDARD, legalMoves } from '../engine'
import { minimaxWithABTT, TranspositionTable } from './search'
import type { CancelSignal } from './search'
import { evaluateExpert } from './evaluation'
import type { AnalysisMessage, AnalysisWorkerMessage, AnalysisRequest } from './types'

export class AnalysisWorkerHandler {
  private currentCancel: CancelSignal | null = null
  private readonly postMsg: (msg: AnalysisWorkerMessage) => void

  constructor(postMsg: (msg: AnalysisWorkerMessage) => void) {
    this.postMsg = postMsg
  }

  handleMessage(msg: AnalysisMessage): void {
    if (msg.type === 'cancel') {
      if (this.currentCancel) {
        this.currentCancel.cancelled = true
      }
      return
    }

    if (msg.type === 'analyze') {
      this.handleAnalyze(msg)
    }
  }

  private handleAnalyze(msg: AnalysisRequest): void {
    if (this.currentCancel) {
      this.currentCancel.cancelled = true
    }

    const cancelSignal: CancelSignal = { cancelled: false }
    this.currentCancel = cancelSignal

    const { state, timeBudgetMs, requestId } = msg
    const rules = KALAH_STANDARD

    try {
      this.runExpertSearch(state, timeBudgetMs, rules, requestId, cancelSignal)
    } catch (err) {
      this.postMsg({
        type: 'error',
        requestId,
        message: err instanceof Error ? err.message : String(err),
      })
      this.currentCancel = null
    }
  }

  private runExpertSearch(
    state: GameState,
    timeBudgetMs: number,
    rules: RuleConfig,
    requestId: number,
    cancelSignal: CancelSignal,
  ): void {
    const startTime = performance.now()
    const budget = timeBudgetMs
    const evalFn = evaluateExpert
    const tt = new TranspositionTable()

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
        type: 'result',
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

      const result = minimaxWithABTT(
        state,
        depth,
        -Infinity,
        +Infinity,
        rules,
        evalFn,
        tt,
        cancelSignal,
      )

      if (cancelSignal.cancelled) {
        sendBestResult()
        return
      }

      bestResult = { score: result.score, pv: result.pv, depth }

      if (bestResult.score > 9000) {
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
  const handler = new AnalysisWorkerHandler((msg) => self.postMessage(msg))
  self.onmessage = (event: MessageEvent<AnalysisMessage>) => {
    handler.handleMessage(event.data)
  }
}
