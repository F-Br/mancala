import { useMemo, useState } from 'react'
import { useHistoryStore } from '../../state/historyStore'
import type { BotLevel } from '../../bots/types'
import type { ClassificationKey } from '../theme'
import { classifyEvalDrop } from '../classification'
import { strings } from '../strings'
import { Card } from '../components/Card'
import { PageLayout } from '../components/PageLayout'

type GameFilter = 'all' | 'kalah' | 'mangala'

interface BotStats {
  total: number
  wins: number
  losses: number
  draws: number
}

const labelOrder: ClassificationKey[] = [
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'blunder',
]

const levelOrder: BotLevel[] = ['beginner', 'casual', 'strong', 'expert']

export function StatsScreen() {
  const records = useHistoryStore((s) => s.records)
  const [gameFilter, setGameFilter] = useState<GameFilter>('all')

  const filteredRecords = useMemo(() => {
    if (gameFilter === 'all') return records
    return records.filter((r) => (r.game ?? 'kalah') === gameFilter)
  }, [records, gameFilter])

  const stats = useMemo(() => {
    const total = filteredRecords.length
    const wins = filteredRecords.filter((r) => r.result === 'win').length
    const losses = filteredRecords.filter((r) => r.result === 'loss').length
    const draws = filteredRecords.filter((r) => r.result === 'draw').length

    const byLevel: Record<string, BotStats> = {}
    for (const r of filteredRecords) {
      if (r.mode === 'vs-bot' && r.botLevel) {
        const lvl = r.botLevel
        if (!byLevel[lvl]) byLevel[lvl] = { total: 0, wins: 0, losses: 0, draws: 0 }
        byLevel[lvl]!.total++
        if (r.result === 'win') byLevel[lvl]!.wins++
        else if (r.result === 'loss') byLevel[lvl]!.losses++
        else byLevel[lvl]!.draws++
      }
    }

    const analyzedRecords = filteredRecords.filter(
      (r) => r.analysisResult && r.analysisResult.length > 0,
    )

    const classCounts: Partial<Record<ClassificationKey, number>> = {}
    let totalClassified = 0
    const blundersPerGame: number[] = []
    const perGameAccuracy: number[] = []
    let totalMovesAnalyzed = 0

    for (const r of analyzedRecords) {
      if (!r.analysisResult) continue
      let gameBest = 0
      let gameTotal = 0
      let gameBlunders = 0
      for (const entry of r.analysisResult) {
        if (entry.bestPitIndex < 0) continue
        const isBest = entry.playedEval >= entry.bestEval - 0.01
        const cls = isBest ? 'best' : classifyEvalDrop(entry.bestEval, entry.playedEval)
        classCounts[cls] = (classCounts[cls] ?? 0) + 1
        totalClassified++
        if (isBest) gameBest++
        if (cls === 'blunder') gameBlunders++
        gameTotal++
      }
      totalMovesAnalyzed += r.analysisResult.length
      blundersPerGame.push(gameBlunders)
      perGameAccuracy.push(gameTotal > 0 ? (gameBest / gameTotal) * 100 : 0)
    }

    const avgBestMovePct =
      totalClassified > 0
        ? ((classCounts.best ?? 0) / totalClassified) * 100
        : 0
    const avgGameLength =
      analyzedRecords.length > 0
        ? totalMovesAnalyzed / analyzedRecords.length
        : 0

    return {
      total,
      wins,
      losses,
      draws,
      byLevel,
      classCounts,
      totalClassified,
      blundersPerGame,
      perGameAccuracy,
      avgBestMovePct,
      avgGameLength,
      analyzedCount: analyzedRecords.length,
    }
  }, [filteredRecords])

  const hasData = stats.total > 0
  const hasAnalysis = stats.totalClassified > 0
  const showTrend = stats.analyzedCount >= 2

  return (
    <PageLayout title={strings.stats.title}>
      {/* Game filter */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="flex gap-0.5 bg-surface-2 rounded-chip p-0.5">
          {(['all', 'kalah', 'mangala'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGameFilter(g)}
              className={`px-3 py-1.5 text-label font-semibold uppercase tracking-label rounded-chip transition-colors ${
                gameFilter === g
                  ? 'bg-accent text-bg'
                  : 'text-muted hover:text-text'
              }`}
            >
              {g === 'all'
                ? strings.history.filterAll
                : g === 'kalah'
                  ? strings.history.filterKalah
                  : strings.history.filterMangala}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center gap-4 text-center mt-12">
          <div className="w-16 h-16 rounded-full bg-surface-2 flex items-center justify-center text-2xl">
            📊
          </div>
          <p className="text-body-lg text-muted">{strings.stats.empty}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 md:gap-6">
          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <KpiCard label={strings.stats.totalGames} value={stats.total} />
            <KpiCard label={strings.stats.wins} value={stats.wins} tone="win" />
            <KpiCard label={strings.stats.losses} value={stats.losses} tone="loss" />
            <KpiCard label={strings.stats.draws} value={stats.draws} />
          </div>

          {/* Middle band: classification + win rate by level */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <Card title={strings.stats.classificationDist}>
              {!hasAnalysis ? (
                <p className="text-sm text-muted">
                  {strings.stats.noAnalysisData}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {labelOrder.map((key) => {
                    const count = stats.classCounts[key] ?? 0
                    const pct = (count / stats.totalClassified) * 100
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span className="w-20 text-muted capitalize shrink-0">
                          {key}
                        </span>
                        <div className="flex-1 h-3 bg-surface-2 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: count === 0 ? '0%' : `${Math.max(pct, 2)}%`,
                              backgroundColor: `var(--theme-${key})`,
                            }}
                          />
                        </div>
                        <span className="w-14 text-right text-muted text-xs shrink-0">
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    )
                  })}
                  <div className="flex gap-4 mt-2 pt-3 border-t border-border text-xs text-muted">
                    <span>
                      {strings.stats.avgAccuracy}:{' '}
                      {stats.avgBestMovePct.toFixed(1)}%
                    </span>
                    <span>
                      {strings.stats.avgGameLength}:{' '}
                      {stats.avgGameLength.toFixed(0)}{' '}
                      {stats.avgGameLength === 1 ? 'move' : 'moves'}
                    </span>
                  </div>
                </div>
              )}
            </Card>

            <Card title={strings.stats.byBotLevel}>
              {Object.keys(stats.byLevel).length === 0 ? (
                <p className="text-sm text-muted">
                  {strings.stats.noBotGames}
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {levelOrder.map((level) => {
                    const s = stats.byLevel[level]
                    if (!s) return null
                    const winPct = s.total > 0 ? (s.wins / s.total) * 100 : 0
                    const lossPct =
                      s.total > 0 ? (s.losses / s.total) * 100 : 0
                    const drawPct =
                      s.total > 0 ? (s.draws / s.total) * 100 : 0
                    return (
                      <div key={level}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-text font-medium capitalize">
                            {level}
                          </span>
                          <span className="text-xs text-muted">
                            {s.wins}W / {s.losses}L / {s.draws}D
                          </span>
                        </div>
                        <div className="flex gap-0.5 h-2 rounded-full overflow-hidden bg-surface-2">
                          {s.wins > 0 && (
                            <div
                              className="h-full bg-win transition-all"
                              style={{ width: `${winPct}%` }}
                            />
                          )}
                          {s.draws > 0 && (
                            <div
                              className="h-full transition-all"
                              style={{
                                width: `${drawPct}%`,
                                backgroundColor: 'var(--theme-draw)',
                              }}
                            />
                          )}
                          {s.losses > 0 && (
                            <div
                              className="h-full transition-all"
                              style={{
                                width: `${lossPct}%`,
                                backgroundColor: 'var(--theme-loss)',
                              }}
                            />
                          )}
                        </div>
                        <div className="flex justify-between text-xs text-muted mt-0.5">
                          <span className="text-win">
                            {winPct.toFixed(0)}% {strings.stats.winRate.toLowerCase()}
                          </span>
                          <span>
                            {s.total} {s.total === 1 ? 'game' : 'games'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Trend chart */}
          <Card title={strings.stats.accuracyOverTime}>
            {!hasAnalysis || !showTrend ? (
              <p className="text-sm text-muted">
                {!hasAnalysis
                  ? strings.stats.noAnalysisData
                  : strings.stats.needMoreGames}
              </p>
            ) : (
              <div className="w-full overflow-x-auto">
                <AccuracyChart data={stats.perGameAccuracy} />
                <div className="mt-3 flex gap-4 text-xs text-muted">
                  <span>
                    {strings.stats.avgAccuracy}:{' '}
                    {stats.avgBestMovePct.toFixed(1)}%
                  </span>
                  <span>
                    {strings.stats.avgGameLength}:{' '}
                    {stats.avgGameLength.toFixed(0)}{' '}
                    {stats.avgGameLength === 1 ? 'move' : 'moves'}
                  </span>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </PageLayout>
  )
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'win' | 'loss'
}) {
  const numeralColor =
    tone === 'win' ? 'text-win' : tone === 'loss' ? 'text-loss' : 'text-text'

  return (
    <Card>
      <div className="flex flex-col items-center gap-1">
        <span className={`font-display text-display-xl font-semibold ${numeralColor}`}>
          {value}
        </span>
        <span className="text-label font-semibold uppercase tracking-label text-muted">
          {label}
        </span>
      </div>
    </Card>
  )
}

function AccuracyChart({ data }: { data: number[] }) {
  const n = data.length
  if (n < 2) return null

  const padL = 44
  const padR = 20
  const padT = 24
  const padB = 40
  const w = 600
  const h = 220
  const innerW = w - padL - padR
  const innerH = h - padT - padB
  const zeroY = padT + innerH

  const xScale = (i: number) =>
    padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const yScale = (v: number) => padT + ((100 - v) / 100) * innerH

  const pts = data.map((v, i) => ({ x: xScale(i), y: yScale(v) }))

  const lineD = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')

  const areaD = `${lineD} L${xScale(n - 1).toFixed(1)},${zeroY.toFixed(1)} L${padL.toFixed(1)},${zeroY.toFixed(1)} Z`

  const yTicks = [0, 25, 50, 75, 100]
  const xTicks =
    n <= 20
      ? Array.from({ length: n }, (_, i) => i)
      : Array.from({ length: 10 }, (_, i) =>
          Math.round((i / 9) * (n - 1)),
        )

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-auto"
      style={{ maxHeight: '260px' }}
    >
      <defs>
        <linearGradient
          id="areaGrad"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor="var(--theme-accent)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--theme-accent)" stopOpacity="0.03" />
        </linearGradient>
      </defs>

      {yTicks.map((v) => {
        const y = yScale(v)
        return (
          <g key={v}>
            <line
              x1={padL}
              y1={y}
              x2={w - padR}
              y2={y}
              stroke="var(--theme-border)"
              strokeWidth={0.5}
              strokeDasharray={v === 0 ? 'none' : '3 3'}
            />
            <text
              x={padL - 6}
              y={y + 3}
              textAnchor="end"
              fill="var(--theme-muted)"
              fontSize="10"
            >
              {v}%
            </text>
          </g>
        )
      })}

      <path d={areaD} fill="url(#areaGrad)" />
      <path
        d={lineD}
        fill="none"
        stroke="var(--theme-accent)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {pts.map((p, i) => (
        <g key={i}>
          <circle
            cx={p.x}
            cy={p.y}
            r={4}
            fill="var(--theme-accent)"
            stroke="var(--theme-surface)"
            strokeWidth={1.5}
            className="cursor-pointer"
          >
            <title>
              {strings.stats.accuracy} #{i + 1}: {data[i]!.toFixed(1)}%
            </title>
          </circle>
        </g>
      ))}

      {xTicks.map((i) => (
        <text
          key={i}
          x={xScale(i)}
          y={h - 10}
          textAnchor="middle"
          fill="var(--theme-muted)"
          fontSize="10"
        >
          #{i + 1}
        </text>
      ))}

      <line
        x1={padL}
        y1={zeroY}
        x2={w - padR}
        y2={zeroY}
        stroke="var(--theme-border)"
        strokeWidth={1}
      />
    </svg>
  )
}
