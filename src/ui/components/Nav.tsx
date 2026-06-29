import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { House, Play, Clock, BarChart3, Settings, ArrowLeft } from 'lucide-react'
import { strings } from '../strings'
import { Button } from './Button'

function useIsGameplay() {
  const { pathname } = useLocation()
  return pathname === '/game' || pathname === '/analysis'
}

function useActive(path: string) {
  const { pathname } = useLocation()
  return pathname === path
}

/* ─── Desktop Top Bar ─────────────────────────────────────────── */

function DesktopTopBar({ compact }: { compact: boolean }) {
  const navigate = useNavigate()

  const activeHome = useActive('/home')
  const activeHistory = useActive('/game-history')
  const activeStats = useActive('/stats')
  const activeSettings = useActive('/settings')

  const linkClass = (active: boolean) =>
    `relative font-medium text-sm transition-colors ${
      active ? 'text-accent' : 'text-muted hover:text-text'
    }`

  const underline = (active: boolean) =>
    active
      ? 'after:absolute after:bottom-[-10px] after:left-0 after:right-0 after:h-[2px] after:rounded-full after:bg-accent'
      : ''

  if (compact) {
    return (
      <header className="sticky top-0 z-40 hidden h-12 items-center border-b border-border bg-surface px-4 md:flex">
        <button
          type="button"
          onClick={() => navigate('/home')}
          className="flex items-center gap-1.5 text-muted hover:text-text text-sm"
          aria-label={strings.nav.back}
        >
          <ArrowLeft size={16} />
          <span className="font-display text-base font-semibold text-text">{strings.appTitle}</span>
        </button>
      </header>
    )
  }

  return (
    <header className="sticky top-0 z-40 hidden h-[60px] items-center border-b border-border bg-surface shadow-contact md:flex">
      <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between px-4 md:px-6">
        {/* Left: wordmark */}
        <button
          type="button"
          onClick={() => navigate('/home')}
          className="font-display text-xl font-semibold text-text hover:text-accent transition-colors"
        >
          {strings.appTitle}
        </button>

        {/* Right: nav links */}
        <nav className="flex items-center gap-1">
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/home')}
            className={activeHome ? '' : ''}
          >
            {strings.nav.play}
          </Button>

          <button
            type="button"
            onClick={() => navigate('/game-history')}
            className={`px-3 py-2 ${linkClass(activeHistory)} ${underline(activeHistory)}`}
          >
            {strings.nav.history}
          </button>
          <button
            type="button"
            onClick={() => navigate('/stats')}
            className={`px-3 py-2 ${linkClass(activeStats)} ${underline(activeStats)}`}
          >
            {strings.nav.stats}
          </button>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className={`px-3 py-2 ${linkClass(activeSettings)} ${underline(activeSettings)}`}
          >
            {strings.nav.settings}
          </button>
        </nav>
      </div>
    </header>
  )
}

/* ─── Mobile Bottom Tab Bar ───────────────────────────────────── */

interface TabItem {
  key: string
  icon: typeof House
  label: string
  path: string
}

const tabs: TabItem[] = [
  { key: 'home', icon: House, label: strings.nav.home, path: '/home' },
  { key: 'play', icon: Play, label: strings.nav.play, path: '/home' },
  {
    key: 'history',
    icon: Clock,
    label: strings.nav.history,
    path: '/game-history',
  },
  { key: 'stats', icon: BarChart3, label: strings.nav.stats, path: '/stats' },
  {
    key: 'settings',
    icon: Settings,
    label: strings.nav.settings,
    path: '/settings',
  },
]

function MobileBottomBar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const isActive = useCallback((path: string) => pathname === path, [pathname])

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-border bg-surface shadow-contact md:hidden">
      {tabs.map((tab) => {
        const active = isActive(tab.path)
        const Icon = tab.icon
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => navigate(tab.path)}
            className={`flex flex-col items-center justify-center gap-0.5 min-w-0 px-1 py-1 transition-colors ${
              active ? 'text-accent' : 'text-muted'
            }`}
            aria-label={tab.label}
          >
            <Icon size={22} strokeWidth={active ? 2.5 : 2} />
            <span className="text-[10px] leading-none font-medium">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

/* ─── Mobile Back Affordance (gameplay routes) ────────────────── */

function MobileBackAffordance() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const backTo = pathname === '/analysis' ? '/game' : '/home'

  return (
    <div className="sticky top-0 z-40 flex h-11 items-center border-b border-border bg-surface/90 backdrop-blur-sm px-3 md:hidden">
      <button
        type="button"
        onClick={() => navigate(backTo)}
        className="flex items-center gap-1 text-muted hover:text-text text-sm"
        aria-label={strings.nav.back}
      >
        <ArrowLeft size={16} />
        <span className="font-display text-sm font-semibold text-text">{strings.appTitle}</span>
      </button>
    </div>
  )
}

/* ─── Public layout ───────────────────────────────────────────── */

export function Nav() {
  const isGameplay = useIsGameplay()

  return (
    <>
      <DesktopTopBar compact={isGameplay} />
      {isGameplay && <MobileBackAffordance />}
      {!isGameplay && <MobileBottomBar />}
    </>
  )
}

/**
 * Returns true on routes where the mobile bottom tab bar is hidden
 * and a compact back affordance is shown instead.
 */
export function useIsGameplayRoute() {
  return useIsGameplay()
}
