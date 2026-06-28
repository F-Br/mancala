import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from './ui/theme'
import { HomeScreen } from './ui/screens/HomeScreen'
import { BotSelectScreen } from './ui/screens/BotSelectScreen'
import { GameScreen } from './ui/screens/GameScreen'
import { SettingsScreen } from './ui/screens/SettingsScreen'
import { PlaceholderScreen } from './ui/screens/PlaceholderScreen'
import { strings } from './ui/strings'

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <Routes>
          <Route path="/home" element={<HomeScreen />} />
          <Route path="/bot-select" element={<BotSelectScreen />} />
          <Route path="/game" element={<GameScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route
            path="/analysis"
            element={
              <PlaceholderScreen
                title={strings.game.reviewGame}
                message={strings.placeholder.analysis}
              />
            }
          />
          <Route
            path="/game-history"
            element={
              <PlaceholderScreen
                title={strings.home.gameHistory}
                message={strings.placeholder.gameHistory}
              />
            }
          />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
