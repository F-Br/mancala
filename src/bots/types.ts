import type { GameState } from '../engine'

export type BotLevel = 'beginner' | 'casual' | 'strong' | 'expert'

export interface BotRequest {
  type: 'pickMove'
  state: GameState
  level: BotLevel
  timeBudgetMs?: number
  requestId: number
}

export interface BotCancelRequest {
  type: 'cancel'
  requestId: number
}

export interface BotResponse {
  type: 'move'
  pitIndex: number
  evalScore: number
  principalVariation: number[]
  depthReached: number
  requestId: number
}

export interface BotError {
  type: 'error'
  requestId: number
  message: string
}

export type BotMessage = BotRequest | BotCancelRequest
export type BotWorkerMessage = BotResponse | BotError

// ── Analysis Worker Protocol ──────────────────────────────────────────────

export interface AnalysisRequest {
  type: 'analyze'
  state: GameState
  timeBudgetMs: number
  requestId: number
  playedPitIndex?: number
  totalExtractionBudgetMs?: number
  perStepExtractionBudgetMs?: number
}

export interface AnalysisCancelRequest {
  type: 'cancel'
  requestId: number
}

export interface AnalysisResponse {
  type: 'result'
  pitIndex: number
  evalScore: number
  principalVariation: number[]
  depthReached: number
  requestId: number
  rootScores: Record<number, number>
  reachedTerminal: boolean
  exactPlayedEval?: number
  cancelled?: boolean
  topMoves?: { pit: number; score: number }[]
}

export interface AnalysisError {
  type: 'error'
  requestId: number
  message: string
  cancelled?: boolean
}

export type AnalysisMessage = AnalysisRequest | AnalysisCancelRequest
export type AnalysisWorkerMessage = AnalysisResponse | AnalysisError
