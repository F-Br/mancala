import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BotLevel } from '../../bots/types'
import type { Side } from '../../engine'
import { useGameStore } from '../../state/gameStore'
import { useModeStore } from '../../state/modeStore'
import { strings } from '../strings'
import { PageLayout } from '../components/PageLayout'
import { Card } from '../components/Card'
import { Button } from '../components/Button'

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

const levelDescriptions: Record<BotLevel, string> = {
  beginner: strings.botSelect.beginnerDesc,
  casual: strings.botSelect.casualDesc,
  strong: strings.botSelect.strongDesc,
  expert: strings.botSelect.expertDesc,
}

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
    <PageLayout title={strings.botSelect.title}>
      <div className="max-w-md mx-auto flex flex-col gap-4 pb-16 md:pb-0">
        <Card>
          <div className="flex flex-col gap-5">
            <div
              className="flex flex-col gap-2"
              role="radiogroup"
              aria-label={strings.botSelect.level}
            >
              <p className="text-label font-semibold uppercase tracking-label text-muted">
                {strings.botSelect.level}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {levels.map((lvl) => {
                  const selected = selectedLevel === lvl.key
                  return (
                    <button
                      key={lvl.key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setSelectedLevel(lvl.key)}
                      className={
                        'px-4 py-2.5 rounded-chip text-body font-medium transition-colors ' +
                        (selected
                          ? 'bg-accent text-bg border border-accent'
                          : 'bg-surface-2 text-text border border-border hover:border-accent/50')
                      }
                    >
                      {lvl.label}
                    </button>
                  )
                })}
              </div>
              <p className="text-body text-muted min-h-[1.5rem]">
                {levelDescriptions[selectedLevel]}
              </p>
            </div>

            <div
              className="flex flex-col gap-2"
              role="radiogroup"
              aria-label={strings.botSelect.side}
            >
              <p className="text-label font-semibold uppercase tracking-label text-muted">
                {strings.botSelect.side}
              </p>
              <div className="flex gap-2">
                {sides.map((s) => {
                  const selected = selectedSide === s.key
                  return (
                    <button
                      key={s.key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setSelectedSide(s.key)}
                      className={
                        'flex-1 px-4 py-2.5 rounded-chip text-body font-medium transition-colors ' +
                        (selected
                          ? 'bg-accent text-bg border border-accent'
                          : 'bg-surface-2 text-text border border-border hover:border-accent/50')
                      }
                    >
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </Card>

        <Button
          variant="primary"
          size="lg"
          onClick={handleStart}
          className="w-full mt-1"
        >
          {strings.botSelect.startGame}
        </Button>
      </div>
    </PageLayout>
  )
}
