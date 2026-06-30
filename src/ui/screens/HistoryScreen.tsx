import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseGameText } from '../../engine'
import { useGameStore } from '../../state/gameStore'
import { useHistoryStore } from '../../state/historyStore'
import type { AnalysisCacheEntry } from '../../state/gameStore'
import type { BotLevel } from '../../bots/types'
import { EvalGraphSparkline, type EvalGraphPoint } from '../components/EvalGraph'
import { Card } from '../components/Card'
import { Chip } from '../components/Chip'
import { Button } from '../components/Button'
import { PageLayout } from '../components/PageLayout'
import { strings } from '../strings'

// ─── Helpers ───────────────────────────────────────────────────────────

const BOT_LEVEL_LABEL: Record<BotLevel, string> = {
  beginner: strings.botSelect.beginner,
  casual: strings.botSelect.casual,
  strong: strings.botSelect.strong,
  expert: strings.botSelect.expert,
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function computeAccuracy(cache: AnalysisCacheEntry[]): number {
  let total = 0
  let good = 0
  for (const entry of cache) {
    if (entry.bestPitIndex < 0) continue
    total++
    if (entry.bestEval - entry.playedEval <= 0.3) good++
  }
  return total > 0 ? Math.round((good / total) * 100) : 0
}

function buildGraphPoints(cache: AnalysisCacheEntry[]): EvalGraphPoint[] {
  return cache
    .filter((entry) => entry.bestPitIndex >= 0)
    .map((entry, i) => ({
      index: i,
      eval: Math.max(-15, Math.min(15, entry.bestEval)),
      moveNumber: i + 1,
    }))
}

// ─── Filter types ──────────────────────────────────────────────────────

type ModeFilter = 'all' | 'vs-bot' | 'local-2p'
type ResultFilter = 'all' | 'win' | 'loss' | 'draw'

// ─── GameCard sub-component ────────────────────────────────────────────

interface GameCardProps {
  record: ReturnType<typeof useHistoryStore.getState>['records'][number]
  onReview: () => void
  onDelete: () => void
}

function GameCard({ record, onReview, onDelete }: GameCardProps) {
  const accuracy = record.analysisResult?.length
    ? computeAccuracy(record.analysisResult)
    : null
  const graphPoints = record.analysisResult?.length
    ? buildGraphPoints(record.analysisResult)
    : null

  const resultChipClass =
    record.result === 'win'
      ? 'bg-best/15 text-best'
      : record.result === 'loss'
        ? 'bg-blunder/15 text-blunder'
        : 'bg-surface-2 text-muted'

  const resultLabel =
    record.result === 'win'
      ? strings.history.win
      : record.result === 'loss'
        ? strings.history.loss
        : strings.history.draw

  const opponentLabel =
    record.mode === 'vs-bot' && record.botLevel
      ? `\u2022 ${BOT_LEVEL_LABEL[record.botLevel]}`
      : null

  return (
    <div
      onClick={onReview}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onReview()
        }
      }}
      role="button"
      tabIndex={0}
      className="cursor-pointer group"
    >
      <Card className="transition-all group-hover:brightness-[1.04] h-full">
        <div className="flex flex-col gap-3">
          {/* Header row: result Chip + delete */}
          <div className="flex items-center justify-between">
            <Chip className={`font-bold ${resultChipClass}`}>
              {resultLabel}
            </Chip>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className="text-muted/50 hover:text-blunder text-body leading-none px-1 -mr-1"
              aria-label={strings.history.delete}
            >
              &times;
            </button>
          </div>

          {/* Opponent info */}
          <div className="flex items-center gap-1.5">
            <span className="text-body text-text font-medium">
              {record.mode === 'vs-bot' ? 'Bot' : 'Local 2-Player'}
            </span>
            {opponentLabel && (
              <span className="text-body text-muted">{opponentLabel}</span>
            )}
          </div>

          {/* Final score */}
          <span className="text-display-md font-display font-semibold text-text leading-tight">
            {record.finalScore.player}
            <span className="text-muted mx-1">&ndash;</span>
            {record.finalScore.opponent}
          </span>

          {/* Date */}
          <span className="text-label text-muted">
            {formatDate(record.dateISO)}
          </span>

          {/* Accuracy */}
          {accuracy !== null && (
            <div className="flex items-center gap-2">
              <span className="text-label text-muted uppercase tracking-label">
                {strings.history.accuracy}
              </span>
              <span className="text-label font-semibold text-text">{accuracy}%</span>
            </div>
          )}

          {/* Sparkline */}
          {graphPoints && graphPoints.length >= 2 && (
            <div className="-mx-4">
              <EvalGraphSparkline points={graphPoints} height={32} />
            </div>
          )}

          {/* Replay action */}
          <div className="mt-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onReview()
              }}
            >
              {strings.history.replay}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ─── Main HistoryScreen ────────────────────────────────────────────────

export function HistoryScreen() {
  const navigate = useNavigate()
  const records = useHistoryStore((s) => s.records)
  const deleteRecord = useHistoryStore((s) => s.deleteRecord)

  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all')
  const [botLevelFilter, setBotLevelFilter] = useState<BotLevel | 'all'>('all')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // ── Derived data ──────────────────────────────────────────────────

  const sorted = useMemo(() => {
    let filtered = [...records]
    if (modeFilter !== 'all') {
      filtered = filtered.filter((r) => r.mode === modeFilter)
    }
    if (resultFilter !== 'all') {
      filtered = filtered.filter((r) => r.result === resultFilter)
    }
    if (botLevelFilter !== 'all') {
      filtered = filtered.filter((r) => r.botLevel === botLevelFilter)
    }
    return filtered.sort(
      (a, b) => new Date(b.dateISO).getTime() - new Date(a.dateISO).getTime(),
    )
  }, [records, modeFilter, resultFilter, botLevelFilter])

  const { totalGames, wins } = useMemo(() => {
    let total = records.length
    let w = 0
    for (const r of records) {
      if (r.result === 'win') w++
    }
    return { totalGames: total, wins: w }
  }, [records])

  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0

  const streak = useMemo(() => {
    const allSorted = [...records].sort(
      (a, b) => new Date(b.dateISO).getTime() - new Date(a.dateISO).getTime(),
    )
    if (allSorted.length === 0) return { type: null as null | 'win' | 'loss', count: 0 }
    const first = allSorted[0]!
    if (first.result === 'draw') return { type: null, count: 0 }
    let count = 1
    for (let i = 1; i < allSorted.length; i++) {
      if (allSorted[i]!.result === first.result) count++
      else break
    }
    return { type: first.result as 'win' | 'loss', count }
  }, [records])

  const availableBotLevels = useMemo(() => {
    const levels = new Set<BotLevel>()
    for (const r of records) {
      if (r.botLevel) levels.add(r.botLevel)
    }
    return [...levels]
  }, [records])

  // ── Handlers ─────────────────────────────────────────────────────

  const handleOpenReview = (record: (typeof records)[number]) => {
    const state = parseGameText(record.gameText)
    useGameStore.getState().clear()
    useGameStore.setState({
      gameState: state,
      savedMeta: {
        mode: record.mode,
        botLevel: record.botLevel ?? 'beginner',
        playerSide: record.playerSide,
      },
      analysisCache: record.analysisResult ?? null,
    })
    navigate('/analysis', { state: { fromHistory: true } })
  }

  // ── Render ───────────────────────────────────────────────────────

  return (
    <PageLayout title={strings.history.title}>
      {/* ── Summary strip ───────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex flex-col items-center bg-surface-2 rounded-chip px-4 py-2 min-w-[88px]">
          <span className="text-label text-muted uppercase tracking-label">
            {strings.history.totalGames}
          </span>
          <span className="text-display-md font-display font-semibold text-text">
            {totalGames}
          </span>
        </div>
        <div className="flex flex-col items-center bg-surface-2 rounded-chip px-4 py-2 min-w-[88px]">
          <span className="text-label text-muted uppercase tracking-label">
            {strings.history.winRate}
          </span>
          <span className="text-display-md font-display font-semibold text-text">
            {winRate}%
          </span>
        </div>
        <div className="flex flex-col items-center bg-surface-2 rounded-chip px-4 py-2 min-w-[88px]">
          <span className="text-label text-muted uppercase tracking-label">
            {strings.history.streak}
          </span>
          <span className="text-display-md font-display font-semibold text-text">
            {streak.count > 0
              ? `${streak.count}${streak.type === 'win' ? strings.history.win : strings.history.loss}`
              : '\u2014'}
          </span>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {/* Mode filter */}
        <div className="flex gap-0.5 bg-surface-2 rounded-chip p-0.5">
          {(['all', 'vs-bot', 'local-2p'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setModeFilter(m)
                setBotLevelFilter('all')
              }}
              className={`px-3 py-1.5 text-label font-semibold uppercase tracking-label rounded-chip transition-colors ${
                modeFilter === m
                  ? 'bg-accent text-bg'
                  : 'text-muted hover:text-text'
              }`}
            >
              {m === 'all'
                ? strings.history.filterAll
                : m === 'vs-bot'
                  ? strings.history.filterBot
                  : strings.history.filterLocal}
            </button>
          ))}
        </div>

        {/* Result filter */}
        <div className="flex gap-0.5 bg-surface-2 rounded-chip p-0.5">
          {(['all', 'win', 'loss', 'draw'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setResultFilter(r)}
              className={`px-3 py-1.5 text-label font-semibold uppercase tracking-label rounded-chip transition-colors ${
                resultFilter === r
                  ? 'bg-accent text-bg'
                  : 'text-muted hover:text-text'
              }`}
            >
              {r === 'all'
                ? strings.history.filterAll
                : r === 'win'
                  ? strings.history.win
                  : r === 'loss'
                    ? strings.history.loss
                    : strings.history.draw}
            </button>
          ))}
        </div>

        {/* Bot level filter (when mode is vs-bot or all) */}
        {availableBotLevels.length > 0 && modeFilter !== 'local-2p' && (
          <div className="flex gap-0.5 bg-surface-2 rounded-chip p-0.5">
            <button
              type="button"
              onClick={() => setBotLevelFilter('all')}
              className={`px-3 py-1.5 text-label font-semibold uppercase tracking-label rounded-chip transition-colors ${
                botLevelFilter === 'all'
                  ? 'bg-accent text-bg'
                  : 'text-muted hover:text-text'
              }`}
            >
              {strings.history.filterAll}
            </button>
            {availableBotLevels.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setBotLevelFilter(l)}
                className={`px-3 py-1.5 text-label font-semibold uppercase tracking-label rounded-chip transition-colors ${
                  botLevelFilter === l
                    ? 'bg-accent text-bg'
                    : 'text-muted hover:text-text'
                }`}
              >
                {BOT_LEVEL_LABEL[l]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <Card className="text-center py-16">
          <div className="flex flex-col items-center gap-4">
            <p className="text-muted text-body">
              {records.length === 0
                ? strings.history.empty
                : strings.history.noMatchFilter}
            </p>
            {records.length === 0 && (
              <Button
                variant="primary"
                size="lg"
                onClick={() => navigate('/home')}
              >
                {strings.history.playFirstGame}
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((record) => (
            <GameCard
              key={record.id}
              record={record}
              onReview={() => handleOpenReview(record)}
              onDelete={() => setDeleteTarget(record.id)}
            />
          ))}
        </div>
      )}

      {/* ── Single-delete confirm modal ─────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-board rounded-2xl p-6 max-w-sm w-full flex flex-col items-center gap-4 shadow-2xl">
            <p className="text-sm text-text text-center">
              {strings.history.deleteConfirm}
            </p>
            <div className="flex gap-3 w-full">
              <Button
                variant="secondary"
                onClick={() => setDeleteTarget(null)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  deleteRecord(deleteTarget)
                  setDeleteTarget(null)
                }}
                className="flex-1"
              >
                {strings.history.delete}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  )
}
