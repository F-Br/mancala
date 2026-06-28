import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useTheme } from './useTheme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme()
  const appliedRef = useRef(false)

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--theme-bg', theme.bg)
    root.style.setProperty('--theme-board', theme.board)
    root.style.setProperty('--theme-pit', theme.pit)
    root.style.setProperty('--theme-stone', theme.stone)
    root.style.setProperty('--theme-accent', theme.accent)
    root.style.setProperty('--theme-text', theme.text)
    root.style.setProperty('--theme-muted', theme.muted)
    root.style.setProperty('--theme-best', theme.classifications.best)
    root.style.setProperty('--theme-excellent', theme.classifications.excellent)
    root.style.setProperty('--theme-good', theme.classifications.good)
    root.style.setProperty('--theme-inaccuracy', theme.classifications.inaccuracy)
    root.style.setProperty('--theme-mistake', theme.classifications.mistake)
    root.style.setProperty('--theme-blunder', theme.classifications.blunder)

    if (!appliedRef.current) {
      root.style.setProperty('background-color', 'var(--theme-bg)')
      root.style.setProperty('color', 'var(--theme-text)')
      appliedRef.current = true
    }
  }, [theme])

  return <>{children}</>
}
