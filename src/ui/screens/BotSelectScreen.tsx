import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BotLevel } from '../../bots/types'
import type { Side } from '../../engine'
import { useGameStore } from '../../state/gameStore'
import { useModeStore } from '../../state/modeStore'
import { strings } from '../strings'

const levels: { key: BotLevel; label: string }[] = [
  { key: 'beginner', label: strings.botSelect.beginner },
  { key: 'casual', label: strings.botSelect.casual },
  { key: 'strong', label: strings.botSelect.strong },
  { key: 'expert', label: strings.botSelect.expert },
]

const sides: { key: Side | 'random'; label: string }[] = [
  { key: 'top', label: strings.botSelect.top },
  { key: 'bottom', label: strings.botSelect.bottom },
  { key: 'random', label: strings.botSelect.random },
]

export function BotSelectScreen() {
  const navigate = useNavigate()
  const [selectedLevel, setSelectedLevel] = useState<BotLevel>('beginner')
  const [selectedSide, setSelectedSide] = useState<Side | 'random'>('random')

  const handleStart = () => {
    useGameStore.getState().clear()
    useModeStore.getState().setMode('vs-bot')
    useModeStore.getState().setBotLevel(selectedLevel)
    useModeStore.getState().setPlayerSide(selectedSide)
    navigate('/game')
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-4">
      <h1 className="text-3xl font-bold text-text">
        {strings.botSelect.title}
      </h1>

      <div className="flex flex-col gap-6 w-full max-w-xs">
        <div className="flex flex-col gap-2">
          <label className="text-sm text-muted font-medium">
            {strings.botSelect.level}
          </label>
          <div className="flex flex-wrap gap-2">
            {levels.map((lvl) => (
              <button
                key={lvl.key}
                type="button"
                onClick={() => setSelectedLevel(lvl.key)}
                className={
                  'px-4 py-2 rounded-xl text-sm font-medium border-2 transition-colors ' +
                  (selectedLevel === lvl.key
                    ? 'bg-accent text-bg border-accent'
                    : 'bg-board/60 text-text border-board/40 hover:bg-board')
                }
              >
                {lvl.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm text-muted font-medium">
            {strings.botSelect.side}
          </label>
          <div className="flex gap-2">
            {sides.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSelectedSide(s.key)}
                className={
                  'flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-colors ' +
                  (selectedSide === s.key
                    ? 'bg-accent text-bg border-accent'
                    : 'bg-board/60 text-text border-board/40 hover:bg-board')
                }
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleStart}
          className="w-full py-3 rounded-xl bg-accent text-bg font-semibold text-lg hover:brightness-110 mt-2"
        >
          {strings.botSelect.startGame}
        </button>
      </div>
    </main>
  )
}
