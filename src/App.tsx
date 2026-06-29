import { useEffect, useRef } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ThemeProvider } from './ui/theme'
import { Nav, useIsGameplayRoute } from './ui/components/Nav'
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
import { useSettingsStore } from './state/settingsStore'
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

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
}

const pageTransition = {
  duration: 0.2,
  ease: 'easeInOut' as const,
}

function AnimatedPage({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
    >
      {children}
    </motion.div>
  )
}

function AppRoutes() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route
          path="/home"
          element={
            <AnimatedPage>
              <HomeScreen />
            </AnimatedPage>
          }
        />
        <Route
          path="/bot-select"
          element={
            <AnimatedPage>
              <BotSelectScreen />
            </AnimatedPage>
          }
        />
        <Route
          path="/game"
          element={
            <AnimatedPage>
              <GameScreen />
            </AnimatedPage>
          }
        />
        <Route
          path="/settings"
          element={
            <AnimatedPage>
              <SettingsScreen />
            </AnimatedPage>
          }
        />
        <Route
          path="/analysis"
          element={
            <AnimatedPage>
              <ReviewScreen />
            </AnimatedPage>
          }
        />
        <Route
          path="/game-history"
          element={
            <AnimatedPage>
              <HistoryScreen />
            </AnimatedPage>
          }
        />
        <Route
          path="/stats"
          element={
            <AnimatedPage>
              <StatsScreen />
            </AnimatedPage>
          }
        />
        <Route
          path="/tutorial"
          element={
            <AnimatedPage>
              <TutorialScreen />
            </AnimatedPage>
          }
        />
        <Route
          path="/placeholder"
          element={
            <AnimatedPage>
              <PlaceholderScreen title="" message="" />
            </AnimatedPage>
          }
        />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </AnimatePresence>
  )
}

function AppShell() {
  const isGameplay = useIsGameplayRoute()

  return (
    <>
      <Nav />
      <div className={isGameplay ? '' : 'pb-16 md:pb-0'}>
        <AppRoutes />
      </div>
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <SharedGameHandler>
          <TutorialGuard>
            <AppShell />
          </TutorialGuard>
        </SharedGameHandler>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
