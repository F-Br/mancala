import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GameState, RuleConfig, Side } from '../engine'
import { createInitialState, applyMove } from '../engine'
import { KALAH_STANDARD } from '../engine'
import type { BotLevel } from '../bots/types'
import type { GameMode } from './modeStore'

export interface AnalysisCacheEntry {
  bestPitIndex: number
  bestEval: number
  pv: number[]
  depth: number
  playedEval: number
  rootScores: Record<number, number>
  reachedTerminal: boolean
}

export interface SavedMeta {
  mode: GameMode
  botLevel: BotLevel
  playerSide: Side
}

export interface GameStore {
  gameState: GameState | null
  rules: RuleConfig
  firstPlayer: Side
  savedMeta: SavedMeta | null
  analysisCache: AnalysisCacheEntry[] | null
  makeMove: (pitIndex: number) => void
  reset: (firstPlayer?: Side) => void
  takeback: () => void
  clear: () => void
  setSavedMeta: (meta: SavedMeta) => void
  setAnalysisCache: (cache: AnalysisCacheEntry[] | null) => void
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      gameState: null,
      rules: KALAH_STANDARD,
      firstPlayer: 'bottom' as Side,
      savedMeta: null,
      analysisCache: null,
      makeMove: (pitIndex: number) => {
        const { gameState, rules } = get()
        if (!gameState || gameState.status === 'finished') return
        const newState = applyMove(gameState, pitIndex, rules)
        set({ gameState: newState, analysisCache: null })
      },
      reset: (firstPlayer?: Side) => {
        const rules = get().rules
        const fp = firstPlayer ?? 'bottom'
        const state = createInitialState(rules, fp)
        set({ gameState: state, firstPlayer: fp, analysisCache: null })
      },
      takeback: () => {
        const { gameState, rules, firstPlayer } = get()
        if (!gameState || gameState.moveHistory.length === 0) return
        const initial = createInitialState(rules, firstPlayer)
        let prev = initial
        for (let i = 0; i < gameState.moveHistory.length - 1; i++) {
          prev = applyMove(prev, gameState.moveHistory[i]!.pitIndex, rules)
        }
        set({ gameState: prev, analysisCache: null })
      },
      clear: () => set({ gameState: null, savedMeta: null, analysisCache: null }),
      setSavedMeta: (meta: SavedMeta) => set({ savedMeta: meta }),
      setAnalysisCache: (cache: AnalysisCacheEntry[] | null) => set({ analysisCache: cache }),
    }),
    {
      name: 'mancala-current-game',
      version: 1,
      merge: (persisted, current) => ({
        ...current,
        ...(typeof persisted === 'object' && persisted
          ? Object.fromEntries(
              Object.entries(persisted as Record<string, unknown>).filter(
                ([key]) => key in current,
              ),
            )
          : {}),
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('Failed to load game state from localStorage:', error)
      },
      partialize: (state) => ({
        gameState: state.gameState,
        rules: state.rules,
        firstPlayer: state.firstPlayer,
        savedMeta: state.savedMeta,
        analysisCache: state.analysisCache,
      }),
    },
  ),
)
