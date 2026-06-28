import { useSyncExternalStore, useCallback } from 'react'
import { themes, defaultThemeKey, themeKeys } from './themes'
import type { ThemeKey } from './themes'

const STORAGE_KEY = 'mancala-theme'

function getSnapshot(): ThemeKey {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeKey | null
    if (stored && themeKeys.includes(stored)) return stored
  } catch {
    /* localStorage unavailable */
  }
  return defaultThemeKey
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback)
  return () => window.removeEventListener('storage', callback)
}

export function useTheme() {
  const themeKey = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const setTheme = useCallback((key: ThemeKey) => {
    localStorage.setItem(STORAGE_KEY, key)
    window.dispatchEvent(new Event('storage'))
  }, [])

  return {
    themeKey,
    theme: themes[themeKey],
    setTheme,
    isDefault: themeKey === defaultThemeKey,
  }
}
