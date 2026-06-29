import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ThemeKey } from '../ui/theme'
import { defaultThemeKey } from '../ui/theme'

export interface SettingsState {
  theme: ThemeKey
  boardFlip: boolean
  soundEnabled: boolean
  hapticsEnabled: boolean
  animationSpeed: number
  liveHintsEnabled: boolean
  tutorialSeen: boolean
  showPitCounts: boolean
  setTheme: (key: ThemeKey) => void
  setBoardFlip: (v: boolean) => void
  setSoundEnabled: (v: boolean) => void
  setHapticsEnabled: (v: boolean) => void
  setAnimationSpeed: (v: number) => void
  setLiveHintsEnabled: (v: boolean) => void
  setTutorialSeen: (v: boolean) => void
  setShowPitCounts: (v: boolean) => void
  resetAll: () => void
}

const defaults = {
  theme: defaultThemeKey as ThemeKey,
  boardFlip: false,
  soundEnabled: true,
  hapticsEnabled: true,
  animationSpeed: 1,
  liveHintsEnabled: false,
  tutorialSeen: false,
  showPitCounts: false,
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaults,
      setTheme: (theme) => set({ theme }),
      setBoardFlip: (boardFlip) => set({ boardFlip }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      setAnimationSpeed: (animationSpeed) => set({ animationSpeed }),
      setLiveHintsEnabled: (liveHintsEnabled) => set({ liveHintsEnabled }),
      setTutorialSeen: (tutorialSeen) => set({ tutorialSeen }),
      setShowPitCounts: (showPitCounts) => set({ showPitCounts }),
      resetAll: () => set(defaults),
    }),
    {
      name: 'mancala-settings',
      skipHydration: false,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('Failed to load settings from localStorage:', error)
      },
    },
  ),
)
