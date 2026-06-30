import { useNavigate } from 'react-router-dom'
import { useSettingsStore } from '../../state/settingsStore'
import { useTheme, themeKeys, themes } from '../theme'
import type { ThemeKey } from '../theme'
import { strings } from '../strings'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { PageLayout } from '../components/PageLayout'

const themeLabels: Record<ThemeKey, string> = {
  'warm-earth': strings.settings.warmEarth,
  'dark-museum': strings.settings.darkMuseum,
  'modern-desert': strings.settings.modernDesert,
}

export function SettingsScreen() {
  const navigate = useNavigate()
  const settings = useSettingsStore()
  const { themeKey, setTheme } = useTheme()

  return (
    <PageLayout title={strings.settings.title}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* Appearance */}
        <Card title="Appearance" className="md:col-span-2">
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm text-muted font-medium mb-2">
                {strings.settings.theme}
              </p>
              <div className="flex flex-wrap gap-2">
                {themeKeys.map((key) => {
                  const t = themes[key]
                  const selected = themeKey === key
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTheme(key)}
                      className={
                        'flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-medium border-2 transition-all ' +
                        (selected
                          ? 'bg-accent text-bg border-accent shadow-md'
                          : 'bg-surface-2 text-text border-border hover:border-accent/50')
                      }
                    >
                      <span className="flex gap-0.5">
                        <span
                          className="w-3 h-3 rounded-full ring-1 ring-inset ring-black/15"
                          style={{ backgroundColor: t.bg }}
                        />
                        <span
                          className="w-3 h-3 rounded-full ring-1 ring-inset ring-black/15"
                          style={{ backgroundColor: t.board }}
                        />
                        <span
                          className="w-3 h-3 rounded-full ring-1 ring-inset ring-black/15"
                          style={{ backgroundColor: t.accent }}
                        />
                      </span>
                      {themeLabels[key]}
                      {selected && (
                        <svg
                          className="w-3.5 h-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={3}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
            <ToggleRow
              label={strings.settings.showPitCounts}
              description={strings.settings.showPitCountsDesc}
              checked={settings.showPitCounts}
              onChange={settings.setShowPitCounts}
            />
          </div>
        </Card>

        {/* Gameplay */}
        <Card title="Gameplay">
          <ToggleRow
            label={strings.settings.liveHints}
            description={strings.settings.liveHintsDesc}
            checked={settings.liveHintsEnabled}
            onChange={settings.setLiveHintsEnabled}
          />
        </Card>

        {/* Feedback */}
        <Card title="Feedback">
          <div className="flex flex-col gap-4">
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
            <div>
              <p className="text-sm text-muted font-medium mb-2">
                {strings.settings.animationSpeed}
              </p>
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
                <span className="text-text font-medium">
                  {settings.animationSpeed.toFixed(1)}x
                </span>
                <span>2</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Help */}
        <Card title="Help">
          <div className="flex flex-col gap-3">
            <Button
              variant="secondary"
              onClick={() => navigate('/tutorial')}
            >
              {strings.settings.replayTutorial}
            </Button>
            <button
              type="button"
              onClick={settings.resetAll}
              className="w-full py-2 rounded-chip text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-colors"
            >
              {strings.settings.resetAll}
            </button>
          </div>
        </Card>
      </div>
    </PageLayout>
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
          (checked ? 'bg-accent' : 'bg-surface-2')
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
