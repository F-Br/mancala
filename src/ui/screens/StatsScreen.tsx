import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHistoryStore } from '../../state/historyStore'
import type { BotLevel } from '../../bots/types'
import type { ClassificationKey } from '../theme'
import { strings } from '../strings'

interface BotStats {
  total: number
  wins: number
  losses: number
  draws: number
}

function classifyEvalDrop(drop: number): ClassificationKey {
  if (drop <= 0.3) return 'excellent'
  if (drop <= 1.0) return 'good'
  if (drop <= 2.0) return 'inaccuracy'
  if (drop <= 4.0) return 'mistake'
  return 'blunder'
}

export function StatsScreen() {
  const navigate = useNavigate()
  const records = useHistoryStore((s) => s.records)

  const stats = useMemo(() => {
    const total = records.length
    const wins = records.filter((r) => r.result === 'win').length
    const losses = records.filter((r) => r.result === 'loss').length
    const draws = records.filter((r) => r.result === 'draw').length

    const byLevel: Record<string, BotStats> = {}
    for (const r of records) {
      if (r.mode === 'vs-bot' && r.botLevel) {
        const lvl = r.botLevel
        if (!byLevel[lvl]) byLevel[lvl] = { total: 0, wins: 0, losses: 0, draws: 0 }
        byLevel[lvl]!.total++
        if (r.result === 'win') byLevel[lvl]!.wins++
        else if (r.result === 'loss') byLevel[lvl]!.losses++
        else byLevel[lvl]!.draws++
      }
    }

    const analyzedRecords = records.filter(
      (r) => r.analysisResult && r.analysisResult.length > 0,
    )

    const classCounts: Partial<Record<ClassificationKey, number>> = {}
    let totalClassified = 0
    const blundersPerGame: number[] = []

    for (const r of analyzedRecords) {
      if (!r.analysisResult) continue
      let gameBlunders = 0
      for (const entry of r.analysisResult) {
        if (entry.bestPitIndex < 0) continue
        const isBest = entry.playedEval >= entry.bestEval - 0.01
        const drop = isBest ? 0 : Math.max(0, entry.bestEval - entry.playedEval)
        const cls = isBest ? 'best' : classifyEvalDrop(drop)
        classCounts[cls] = (classCounts[cls] ?? 0) + 1
        totalClassified++
        if (cls === 'blunder') gameBlunders++
      }
      blundersPerGame.push(gameBlunders)
    }

    return { total, wins, losses, draws, byLevel, classCounts, totalClassified, blundersPerGame }
  }, [records])

  const labelOrder: ClassificationKey[] = ['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder']

  const blunderMax = Math.max(1, ...stats.blundersPerGame)

  return (
    <main className="min-h-screen p-4 flex flex-col items-center gap-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between w-full">
        <button
          type="button"
          onClick={() => navigate('/home')}
          className="text-accent hover:underline text-sm"
        >
          &larr; {strings.game.home}
        </button>
        <h1 className="text-lg font-bold text-text">{strings.stats.title}</h1>
        <div className="w-12" />
      </div>

      {stats.total === 0 ? (
        <div className="bg-board/30 rounded-2xl p-8 flex flex-col items-center gap-4 text-center mt-8">
          <h2 className="text-xl font-bold text-text">{strings.stats.empty}</h2>
          <p className="text-sm text-muted">{strings.stats.empty}</p>
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="mt-2 px-4 py-2 rounded-xl bg-accent text-bg font-semibold hover:brightness-110 text-sm"
          >
            Play a Game
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 w-full">
            <StatCard label={strings.stats.totalGames} value={String(stats.total)} />
            <StatCard label={strings.stats.wins} value={String(stats.wins)} />
            <StatCard label={strings.stats.losses} value={String(stats.losses)} />
            <StatCard label={strings.stats.draws} value={String(stats.draws)} />
          </div>

          <div className="w-full bg-board/30 rounded-2xl p-4">
            <p className="text-sm font-medium text-text mb-2">
              {strings.stats.byBotLevel}
            </p>
            {Object.keys(stats.byLevel).length === 0 ? (
              <p className="text-xs text-muted">No bot games played.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {(
                  ['beginner', 'casual', 'strong', 'expert'] as BotLevel[]
                ).map((level) => {
                  const s = stats.byLevel[level]
                  if (!s) return null
                  const rate = s.total > 0 ? ((s.wins / s.total) * 100).toFixed(0) : '0'
                  return (
                    <div key={level} className="flex items-center justify-between text-sm">
                      <span className="text-text font-medium capitalize">{level}</span>
                      <span className="text-muted text-xs">
                        {s.wins}W / {s.losses}L / {s.draws}D
                      </span>
                      <span className="text-accent font-bold text-xs">
                        {rate}%
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="w-full bg-board/30 rounded-2xl p-4">
            <p className="text-sm font-medium text-text mb-2">
              {strings.stats.classificationDist}
            </p>
            {stats.totalClassified === 0 ? (
              <p className="text-xs text-muted">{strings.stats.noAnalysisData}</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {labelOrder.map((key) => {
                  const count = stats.classCounts[key] ?? 0
                  const pct = ((count / stats.totalClassified) * 100).toFixed(1)
                  return (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <span className="w-16 text-muted capitalize">{key}</span>
                      <div className="flex-1 h-2 bg-board/40 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: `var(--theme-${key === 'best' ? 'best' : key === 'excellent' ? 'excellent' : key === 'good' ? 'good' : key === 'inaccuracy' ? 'inaccuracy' : key === 'mistake' ? 'mistake' : 'blunder'})`,
                          }}
                        />
                      </div>
                      <span className="w-10 text-right text-muted">{pct}%</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="w-full bg-board/30 rounded-2xl p-4">
            <p className="text-sm font-medium text-text mb-2">
              {strings.stats.blundersOverTime}
            </p>
            {stats.blundersPerGame.length < 2 ? (
              <p className="text-xs text-muted">Need at least 2 analyzed games.</p>
            ) : (
              <div className="w-full h-24">
                <svg viewBox={`0 0 ${Math.max(100, stats.blundersPerGame.length * 40)} 80`} className="w-full h-full">
                  {stats.blundersPerGame.map((blunders, i) => {
                    const x = i * 40 + 20
                    const y = 70 - (blunders / blunderMax) * 60
                    return (
                      <g key={i}>
                        {i > 0 && (
                          <line
                            x1={(i - 1) * 40 + 20}
                            y1={70 - (stats.blundersPerGame[i - 1]! / blunderMax) * 60}
                            x2={x}
                            y2={y}
                            stroke="var(--theme-mistake)"
                            strokeWidth={1.5}
                            strokeLinecap="round"
                          />
                        )}
                        <circle
                          cx={x}
                          cy={y}
                          r={3}
                          fill="var(--theme-mistake)"
                          className="cursor-pointer"
                        />
                        <text
                          x={x}
                          y={78}
                          textAnchor="middle"
                          className="text-[8px] fill-muted"
                        >
                          #{i + 1}
                        </text>
                        <text
                          x={x}
                          y={y - 6}
                          textAnchor="middle"
                          className="text-[8px] fill-text"
                        >
                          {blunders}
                        </text>
                      </g>
                    )
                  })}
                  <line x1={10} y1={70} x2={stats.blundersPerGame.length * 40 + 10} y2={70} stroke="var(--theme-board)" strokeWidth={0.5} />
                </svg>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-board/30 rounded-xl p-3 flex flex-col items-center gap-0.5">
      <span className="text-2xl font-bold text-text">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  )
}
