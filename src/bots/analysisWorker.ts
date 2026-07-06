import type { GameState, RuleConfig } from '../engine'
import { KALAH_STANDARD, legalMoves, applyMove } from '../engine'
import { minimaxWithABTT, TranspositionTable, extractPrincipalVariation, iterativeDeepening, adjustTerminalScore } from './search'
import type { CancelSignal, SearchLimits } from './search'
import { evaluateExpert, WIN_SCORE } from './evaluation'
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

    const { state, timeBudgetMs, requestId, playedPitIndex } = msg
    const rules = KALAH_STANDARD

    try {
      this.runExpertSearch(state, timeBudgetMs, rules, requestId, cancelSignal, playedPitIndex)
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
    playedPitIndex: number | undefined,
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

      let exactPlayedEval: number | undefined
      const bestMove = bestResult.pv[0]
      if (
        playedPitIndex !== undefined &&
        bestMove !== undefined &&
        playedPitIndex !== bestMove &&
        !cancelSignal.cancelled
      ) {
        const moves = legalMoves(state, rules)
        if (moves.includes(playedPitIndex)) {
          try {
            exactPlayedEval = this.computeExactPlayedEval(
              state, playedPitIndex, timeBudgetMs, rules, evalFn, tt, cancelSignal,
            )
          } catch {
            // Verification failed — leave exactPlayedEval undefined
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
        rootScores: bestResult.rootScores,
        reachedTerminal,
        exactPlayedEval,
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

  private computeExactPlayedEval(
    state: GameState,
    playedPitIndex: number,
    timeBudgetMs: number,
    rules: RuleConfig,
    evalFn: (state: GameState, rules: RuleConfig) => number,
    tt: TranspositionTable,
    cancelSignal: CancelSignal,
  ): number {
    const verificationBudget = Math.max(300, Math.floor(timeBudgetMs * 0.35))
    const childState = applyMove(state, playedPitIndex, rules)
    const childMove = childState.moveHistory[childState.moveHistory.length - 1]
    const wasExtraTurn = childMove?.wasExtraTurn ?? false

    let childScore: number

    if (childState.status === 'finished') {
      const base = evalFn(childState, rules)
      childScore = base === WIN_SCORE || base === -WIN_SCORE
        ? adjustTerminalScore(base, 1)
        : base
    } else {
      const idResult = iterativeDeepening(
        childState,
        verificationBudget,
        rules,
        evalFn,
        tt,
        cancelSignal,
        1,
      )
      childScore = idResult.score
    }

    return wasExtraTurn ? childScore : -childScore
  }
}

// Self-hosted worker entry
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  const handler = new AnalysisWorkerHandler((msg) => self.postMessage(msg))
  self.onmessage = (event: MessageEvent<AnalysisMessage>) => {
    handler.handleMessage(event.data)
  }
}
