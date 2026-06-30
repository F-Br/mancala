import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ThemeKey } from '../ui/theme'
import { defaultThemeKey } from '../ui/theme'

export interface SettingsState {
  theme: ThemeKey
  soundEnabled: boolean
  hapticsEnabled: boolean
  animationSpeed: number
  liveHintsEnabled: boolean
  tutorialSeen: boolean
  showPitCounts: boolean
  setTheme: (key: ThemeKey) => void
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
      partialize: (state) => {
        const allowed: (keyof SettingsState)[] = [
          'theme', 'soundEnabled', 'hapticsEnabled', 'animationSpeed',
          'liveHintsEnabled', 'tutorialSeen', 'showPitCounts',
        ]
        const result: Record<string, unknown> = {}
        for (const key of allowed) {
          result[key] = state[key]
        }
        return result
      },
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
      skipHydration: false,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('Failed to load settings from localStorage:', error)
      },
    },
  ),
)
