import type { GameState, RuleConfig } from '../engine'
import { KALAH_STANDARD, legalMoves } from '../engine'
import { minimaxWithABTT, TranspositionTable, extractPrincipalVariation } from './search'
import type { CancelSignal, SearchLimits } from './search'
import { evaluateExpert } from './evaluation'
import type { AnalysisMessage, AnalysisWorkerMessage, AnalysisRequest } from './types'

export class AnalysisWorkerHandler {
  private currentCancel: CancelSignal | null = null
  private sharedTT: TranspositionTable
  private readonly postMsg: (msg: AnalysisWorkerMessage) => void

  constructor(postMsg: (msg: AnalysisWorkerMessage) => void, maxTTEntries?: number) {
    this.postMsg = postMsg
    this.sharedTT = new TranspositionTable(maxTTEntries)
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
    const deadlineMs = startTime + timeBudgetMs
    const evalFn = evaluateExpert
    const tt = this.sharedTT

    const limits: SearchLimits = {
      deadlineMs,
      nodeCount: 0,
      aborted: false,
      checkInterval: 2048,
    }

    let bestResult = { score: 0, pv: [] as number[], depth: 0, rootScores: {} as Record<number, number> }
    let depth = 1

    const sendBestResult = (): void => {
      let reachedTerminal = false

      if (bestResult.pv.length === 0) {
        const moves = legalMoves(state, rules)
        if (moves.length > 0) {
          bestResult = {
            score: 0,
            pv: [moves[Math.floor(Math.random() * moves.length)]!],
            depth: 0,
            rootScores: {},
          }
        }
      }

      if (!cancelSignal.cancelled && bestResult.pv.length > 0) {
        const extracted = extractPrincipalVariation(
          state,
          rules,
          tt,
          evalFn,
          { cancelSignal },
        )
        if (extracted.pv.length > 0) {
          bestResult = { ...bestResult, pv: extracted.pv }
        }
        reachedTerminal = extracted.reachedTerminal
      }

      this.postMsg({
        type: 'result',
        pitIndex: bestResult.pv[0] ?? -1,
        evalScore: bestResult.score,
        principalVariation: bestResult.pv,
        depthReached: bestResult.depth,
        requestId,
        rootScores: bestResult.rootScores,
        reachedTerminal,
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

      const rootScores: Record<number, number> = {}
      const result = minimaxWithABTT(
        state,
        depth,
        -Infinity,
        +Infinity,
        rules,
        evalFn,
        tt,
        cancelSignal,
        rootScores,
        1,
        0,
        0,
        depth === 1 ? undefined : limits,
      )

      if (cancelSignal.cancelled) {
        sendBestResult()
        return
      }

      // Discard aborted mid-iteration results; keep last completed depth's result
      if (isNaN(result.score) || limits.aborted) {
        sendBestResult()
        return
      }

      bestResult = { score: result.score, pv: result.pv, depth, rootScores }

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
