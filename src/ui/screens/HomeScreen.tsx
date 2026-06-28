import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../state/gameStore'
import { useModeStore } from '../../state/modeStore'
import { InstallPrompt } from '../components/InstallPrompt'
import { strings } from '../strings'

export function HomeScreen() {
  const navigate = useNavigate()
  const gameState = useGameStore((s) => s.gameState)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-4">
      <h1 className="text-6xl font-bold tracking-tight text-accent">
        {strings.appTitle}
      </h1>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        {gameState && (
          <button
            type="button"
            onClick={() => navigate('/game')}
            className="w-full py-3 rounded-xl bg-accent/90 text-bg font-semibold text-lg hover:brightness-110"
          >
            {strings.home.resumeGame}
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            useGameStore.getState().clear()
            navigate('/bot-select')
          }}
          className="w-full py-3 rounded-xl bg-board/80 text-text font-semibold text-lg hover:bg-board border border-board/50"
        >
          {strings.home.playVsBot}
        </button>

        <button
          type="button"
          onClick={() => {
            useGameStore.getState().clear()
            useModeStore.getState().setMode('local-2p')
            navigate('/game')
          }}
          className="w-full py-3 rounded-xl bg-board/80 text-text font-semibold text-lg hover:bg-board border border-board/50"
        >
          {strings.home.local2Player}
        </button>

        <button
          type="button"
          onClick={() => navigate('/game-history')}
          className="w-full py-3 rounded-xl bg-board/80 text-text font-semibold text-lg hover:bg-board border border-board/50"
        >
          {strings.home.gameHistory}
        </button>

        <button
          type="button"
          onClick={() => navigate('/stats')}
          className="w-full py-3 rounded-xl bg-board/80 text-text font-semibold text-lg hover:bg-board border border-board/50"
        >
          {strings.home.statistics}
        </button>

        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="w-full py-3 rounded-xl bg-board/80 text-text font-semibold text-lg hover:bg-board border border-board/50"
        >
          {strings.home.settings}
        </button>
      </div>

      <InstallPrompt visible />
    </main>
  )
}
