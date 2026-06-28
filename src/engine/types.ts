export type Side = 'top' | 'bottom'

export interface RuleConfig {
  pitsPerSide: number
  stonesPerPit: number
  extraTurnEnabled: boolean
  captureRule: 'kalah-standard' | 'none'
}

export type GameStatus = 'in-progress' | 'finished'

export interface Move {
  pitIndex: number
  sowedTo: number[]
  captured: { fromPit: number; count: number } | null
  wasExtraTurn: boolean
  player: Side
}

export interface GameState {
  board: number[]
  currentPlayer: Side
  status: GameStatus
  winner: Side | 'draw' | null
  moveHistory: Move[]
}

export const PITS_PER_SIDE = 6
export const BOARD_LENGTH = 14
export const BOTTOM_STORE = 6
export const TOP_STORE = 13
