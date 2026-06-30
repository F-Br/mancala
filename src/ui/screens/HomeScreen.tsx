import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../state/gameStore'
import { useModeStore } from '../../state/modeStore'
import { useHistoryStore } from '../../state/historyStore'
import { InstallPrompt } from '../components/InstallPrompt'
import { Card } from '../components/Card'
import { strings } from '../strings'
import { classifyEvalDrop } from '../classification'
import { Play, Bot, Users, Clock, BarChart3, Settings, ArrowRight } from 'lucide-react'

function StoneCluster({ className = '' }: { className?: string }) {
  return (
    <div className={`absolute bottom-3 right-3 flex items-end gap-0.5 opacity-15 pointer-events-none ${className}`}>
      <div className="w-2 h-2 stone-3d relative" />
      <div className="w-3 h-3 stone-3d relative -mb-0.5" />
      <div className="w-2.5 h-2.5 stone-3d relative -mb-1" />
    </div>
  )
}

export function HomeScreen() {
  const navigate = useNavigate()
  const gameState = useGameStore((s) => s.gameState)
  const records = useHistoryStore((s) => s.records)

  const stats = useMemo(() => {
    const total = records.length
    const wins = records.filter((r) => r.result === 'win').length
    const winRate = total > 0 ? Math.round((wins / total) * 100) : null

    let bestMoves = 0
    let totalClassified = 0
    for (const r of records) {
      if (!r.analysisResult) continue
      for (const entry of r.analysisResult) {
        if (entry.bestPitIndex < 0) continue
        const isBest = entry.playedEval >= entry.bestEval - 0.01
        const cls = isBest ? 'best' : classifyEvalDrop(entry.bestEval, entry.playedEval)
        totalClassified++
        if (cls === 'best') bestMoves++
      }
    }
    const bestMovePct = totalClassified > 0 ? Math.round((bestMoves / totalClassified) * 100) : null

    return { total, winRate, bestMovePct }
  }, [records])

  const hasStats = stats.total > 0

  return (
    <main className="mx-auto max-w-[1100px] px-4 md:px-6 py-6 md:py-8 min-h-screen pb-16 md:pb-0">
      {/* Hero wordmark */}
      <h1 className="font-display text-display-xl text-text font-semibold text-center mb-6 md:mb-8">
        {strings.appTitle}
      </h1>

      {/* Resume Game card */}
      {gameState && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/game')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              navigate('/game')
            }
          }}
          className="cursor-pointer mb-4 group"
        >
          <Card className="relative overflow-hidden transition-transform group-hover:scale-[1.01]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-accent/15 p-2.5">
                  <Play size={20} className="text-accent" />
                </div>
                <div>
                  <p className="font-display text-display-md font-semibold text-text">
                    {strings.home.resumeGame}
                  </p>
                  <p className="text-muted text-body mt-0.5">
                    {gameState.status === 'finished'
                      ? strings.home.resumeFinished
                      : strings.home.resumePlaying}
                  </p>
                </div>
              </div>
              <ArrowRight size={20} className="text-muted shrink-0" />
            </div>
          </Card>
        </div>
      )}

      {/* Glanceable stats strip */}
      <Card className="mb-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-label text-muted">{strings.stats.totalGames}</p>
            <p className="font-display text-display-md font-semibold text-text mt-0.5">
              {hasStats ? stats.total : '\u2014'}
            </p>
          </div>
          <div className="text-center">
            <p className="text-label text-muted">{strings.stats.winRate}</p>
            <p className="font-display text-display-md font-semibold text-text mt-0.5">
              {hasStats ? `${stats.winRate}%` : '\u2014'}
            </p>
          </div>
          <div className="text-center">
            <p className="text-label text-muted">{strings.home.bestMoves}</p>
            <p className="font-display text-display-md font-semibold text-text mt-0.5">
              {stats.bestMovePct !== null ? `${stats.bestMovePct}%` : hasStats ? '\u2014' : '\u2014'}
            </p>
          </div>
        </div>
      </Card>

      {/* Primary feature tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Play vs Bot */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            useGameStore.getState().clear()
            navigate('/bot-select')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              useGameStore.getState().clear()
              navigate('/bot-select')
            }
          }}
          className="cursor-pointer group"
        >
          <Card className="relative overflow-hidden transition-transform group-hover:scale-[1.02]">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <div className="rounded-full bg-accent/15 p-2.5">
                  <Bot size={22} className="text-accent" />
                </div>
                <h2 className="font-display text-display-md font-semibold text-text">
                  {strings.home.playVsBot}
                </h2>
              </div>
              <p className="text-muted text-body">{strings.home.playVsBotDesc}</p>
            </div>
            <StoneCluster />
          </Card>
        </div>

        {/* Local 2-Player */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            useGameStore.getState().clear()
            useModeStore.getState().setMode('local-2p')
            navigate('/game')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              useGameStore.getState().clear()
              useModeStore.getState().setMode('local-2p')
              navigate('/game')
            }
          }}
          className="cursor-pointer group"
        >
          <Card className="relative overflow-hidden transition-transform group-hover:scale-[1.02]">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <div className="rounded-full bg-accent/15 p-2.5">
                  <Users size={22} className="text-accent" />
                </div>
                <h2 className="font-display text-display-md font-semibold text-text">
                  {strings.home.local2Player}
                </h2>
              </div>
              <p className="text-muted text-body">{strings.home.local2PlayerDesc}</p>
            </div>
            <StoneCluster />
          </Card>
        </div>
      </div>

      {/* Secondary tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
        <button
          type="button"
          onClick={() => navigate('/game-history')}
          className="flex flex-col items-center gap-2 rounded-card border border-border bg-surface-2 px-4 py-5 text-muted hover:text-text hover:brightness-110 transition-all"
        >
          <Clock size={22} strokeWidth={1.5} />
          <span className="text-label font-semibold">{strings.home.gameHistory}</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/stats')}
          className="flex flex-col items-center gap-2 rounded-card border border-border bg-surface-2 px-4 py-5 text-muted hover:text-text hover:brightness-110 transition-all"
        >
          <BarChart3 size={22} strokeWidth={1.5} />
          <span className="text-label font-semibold">{strings.home.statistics}</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="flex flex-col items-center gap-2 rounded-card border border-border bg-surface-2 px-4 py-5 text-muted hover:text-text hover:brightness-110 transition-all"
        >
          <Settings size={22} strokeWidth={1.5} />
          <span className="text-label font-semibold">{strings.home.settings}</span>
        </button>
      </div>

      <InstallPrompt visible />
    </main>
  )
}
