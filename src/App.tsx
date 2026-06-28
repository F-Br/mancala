import { useEffect, useRef } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import { ThemeProvider } from './ui/theme'
import { HomeScreen } from './ui/screens/HomeScreen'
import { BotSelectScreen } from './ui/screens/BotSelectScreen'
import { GameScreen } from './ui/screens/GameScreen'
import { SettingsScreen } from './ui/screens/SettingsScreen'
import { ReviewScreen } from './ui/screens/ReviewScreen'
import { TutorialScreen } from './ui/screens/TutorialScreen'
import { HistoryScreen } from './ui/screens/HistoryScreen'
import { StatsScreen } from './ui/screens/StatsScreen'
import { PlaceholderScreen } from './ui/screens/PlaceholderScreen'
import { useGameStore } from './state/gameStore'
import { useHistoryStore } from './state/historyStore'
import { useSettingsStore } from './state/settingsStore'
import { strings } from './ui/strings'
import { parseGameText } from './engine'
import LZString from 'lz-string'

function SharedGameHandler({ children }: { children: React.ReactNode }) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const handled = useRef(false)

  useEffect(() => {
    const encoded = searchParams.get('game')
    if (!encoded || handled.current) return
    handled.current = true

    try {
      let gameText: string
      if (encoded.startsWith('lz:')) {
        gameText = LZString.decompressFromEncodedURIComponent(encoded.slice(3)) ?? ''
      } else if (encoded.startsWith('b64:')) {
        const b64 = encoded.slice(4).replace(/-/g, '+').replace(/_/g, '/')
        gameText = atob(b64)
      } else {
        return
      }

      const state = parseGameText(gameText)
      useGameStore.getState().clear()
      useGameStore.setState({ gameState: state, savedMeta: null })
      useSettingsStore.getState().setTutorialSeen(true)
      navigate('/analysis', { replace: true, state: { shared: true } })
    } catch {
      navigate('/home', { replace: true })
    }
  }, [searchParams, navigate])

  return <>{children}</>
}

function TutorialGuard({ children }: { children: React.ReactNode }) {
  const tutorialSeen = useSettingsStore((s) => s.tutorialSeen)
  const navigate = useNavigate()
  const checked = useRef(false)

  useEffect(() => {
    if (checked.current) return
    checked.current = true
    if (!tutorialSeen && !window.location.pathname.includes('/tutorial')) {
      navigate('/tutorial', { replace: true })
    }
  }, [tutorialSeen, navigate])

  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/home" element={<HomeScreen />} />
      <Route path="/bot-select" element={<BotSelectScreen />} />
      <Route path="/game" element={<GameScreen />} />
      <Route path="/settings" element={<SettingsScreen />} />
      <Route path="/analysis" element={<ReviewScreen />} />
      <Route path="/game-history" element={<HistoryScreen />} />
      <Route path="/stats" element={<StatsScreen />} />
      <Route path="/tutorial" element={<TutorialScreen />} />
      <Route
        path="/placeholder"
        element={
          <PlaceholderScreen
            title={strings.placeholder.analysis}
            message={strings.placeholder.analysis}
          />
        }
      />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <SharedGameHandler>
          <TutorialGuard>
            <AppRoutes />
          </TutorialGuard>
        </SharedGameHandler>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
