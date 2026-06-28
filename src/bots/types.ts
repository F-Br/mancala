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
