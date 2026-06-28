import { create } from 'zustand'
import type { BotLevel } from '../bots/types'
import type { Side } from '../engine'

export type GameMode = 'vs-bot' | 'local-2p' | null

export interface ModeState {
  mode: GameMode
  botLevel: BotLevel
  playerSide: Side | 'random'
  setMode: (mode: GameMode) => void
  setBotLevel: (level: BotLevel) => void
  setPlayerSide: (side: Side | 'random') => void
}

export const useModeStore = create<ModeState>()((set) => ({
  mode: null,
  botLevel: 'beginner',
  playerSide: 'random',
  setMode: (mode) => set({ mode }),
  setBotLevel: (botLevel) => set({ botLevel }),
  setPlayerSide: (playerSide) => set({ playerSide }),
}))
