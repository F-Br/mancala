import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BotLevel } from '../bots/types'
import type { Side, GameId } from '../engine'
import type { AnalysisCacheEntry } from './gameStore'

export interface GameRecord {
  id: string
  mode: 'vs-bot' | 'local-2p'
  botLevel?: BotLevel
  playerSide: Side
  opponentLabel: string
  result: 'win' | 'loss' | 'draw'
  finalScore: { player: number; opponent: number }
  gameText: string
  game?: GameId
  analysisResult?: AnalysisCacheEntry[] | null
  dateISO: string
}

export interface HistoryState {
  records: GameRecord[]
  addRecord: (record: GameRecord) => void
  updateAnalysis: (gameText: string, analysis: AnalysisCacheEntry[]) => void
  deleteRecord: (id: string) => void
  clearAll: () => void
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, get) => ({
      records: [],
      addRecord: (record: GameRecord) => {
        const exists = get().records.some(
          (r) => r.id === record.id || r.gameText === record.gameText,
        )
        if (exists) return
        set((s) => ({ records: [...s.records, record] }))
      },
      updateAnalysis: (gameText: string, analysis: AnalysisCacheEntry[]) => {
        set((s) => ({
          records: s.records.map((r) =>
            r.gameText === gameText ? { ...r, analysisResult: analysis } : r,
          ),
        }))
      },
      deleteRecord: (id: string) => {
        set((s) => ({ records: s.records.filter((r) => r.id !== id) }))
      },
      clearAll: () => set({ records: [] }),
    }),
    {
      name: 'mancala-history',
      partialize: (state) => ({ records: state.records }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('Failed to load history from localStorage:', error)
      },
    },
  ),
)
