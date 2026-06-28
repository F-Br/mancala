import { useNavigate } from 'react-router-dom'
import { useSettingsStore } from '../../state/settingsStore'
import type { StonePattern } from '../../state/settingsStore'
import { useTheme, themeKeys } from '../theme'
import type { ThemeKey } from '../theme'
import { strings } from '../strings'

const themeLabels: Record<ThemeKey, string> = {
  'warm-earth': strings.settings.warmEarth,
  'dark-museum': strings.settings.darkMuseum,
  'modern-desert': strings.settings.modernDesert,
}

const patternOptions: { key: StonePattern; label: string }[] = [
  { key: 'random', label: strings.settings.stonePatternRandom },
  { key: 'symmetric', label: strings.settings.stonePatternSymmetric },
]

export function SettingsScreen() {
  const navigate = useNavigate()
  const settings = useSettingsStore()
  const { themeKey, setTheme } = useTheme()

  return (
    <main className="min-h-screen p-4 flex flex-col items-center gap-6 max-w-md mx-auto">
      <div className="flex items-center justify-between w-full">
        <button
          type="button"
          onClick={() => navigate('/home')}
          className="text-accent hover:underline text-sm"
        >
          &larr; {strings.game.home}
        </button>
        <h1 className="text-xl font-bold text-text">
          {strings.settings.title}
        </h1>
        <div className="w-12" />
      </div>

      <div className="flex flex-col gap-6 w-full">
        <Section label={strings.settings.theme}>
          <div className="flex flex-wrap gap-2">
            {themeKeys.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTheme(key)}
                className={
                  'px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-colors ' +
                  (themeKey === key
                    ? 'bg-accent text-bg border-accent'
                    : 'bg-board/60 text-text border-board/40 hover:bg-board')
                }
              >
                {themeLabels[key]}
              </button>
            ))}
          </div>
        </Section>

        <ToggleRow
          label={strings.settings.boardFlip}
          description={strings.settings.boardFlipDesc}
          checked={settings.boardFlip}
          onChange={settings.setBoardFlip}
        />

        <ToggleRow
          label={strings.settings.sound}
          checked={settings.soundEnabled}
          onChange={settings.setSoundEnabled}
        />

        <ToggleRow
          label={strings.settings.haptics}
          checked={settings.hapticsEnabled}
          onChange={settings.setHapticsEnabled}
        />

        <Section label={strings.settings.animationSpeed}>
          <input
            type="range"
            min={0}
            max={2}
            step={0.5}
            value={settings.animationSpeed}
            onChange={(e) =>
              settings.setAnimationSpeed(Number(e.target.value))
            }
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-xs text-muted">
            <span>0</span>
            <span>{settings.animationSpeed.toFixed(1)}x</span>
            <span>2</span>
          </div>
        </Section>

        <Section label={strings.settings.stonePattern}>
          <div className="flex gap-2">
            {patternOptions.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => settings.setStonePattern(opt.key)}
                className={
                  'flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-colors ' +
                  (settings.stonePattern === opt.key
                    ? 'bg-accent text-bg border-accent'
                    : 'bg-board/60 text-text border-board/40 hover:bg-board')
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Section>

        <ToggleRow
          label={strings.settings.showPitCounts}
          description={strings.settings.showPitCountsDesc}
          checked={settings.showPitCounts}
          onChange={settings.setShowPitCounts}
        />

        <ToggleRow
          label={strings.settings.liveHints}
          description={strings.settings.liveHintsDesc}
          checked={settings.liveHintsEnabled}
          onChange={settings.setLiveHintsEnabled}
        />

        <button
          type="button"
          className="w-full py-2 rounded-xl border border-board/60 text-text font-medium hover:bg-board/40 text-sm"
        >
          {strings.settings.replayTutorial}
        </button>

        <button
          type="button"
          onClick={settings.resetAll}
          className="w-full py-2 rounded-xl bg-red-900/30 text-red-400 font-medium hover:bg-red-900/50 text-sm"
        >
          {strings.settings.resetAll}
        </button>
      </div>
    </main>
  )
}

function Section({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm text-muted font-medium">{label}</label>
      {children}
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-col">
        <span className="text-sm text-text font-medium">{label}</span>
        {description && (
          <span className="text-xs text-muted">{description}</span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={
          'relative w-10 h-5 rounded-full transition-colors shrink-0 ' +
          (checked ? 'bg-accent' : 'bg-board/60')
        }
      >
        <span
          className={
            'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ' +
            (checked ? 'left-[20px]' : 'left-[2px]')
          }
        />
      </button>
    </div>
  )
}
