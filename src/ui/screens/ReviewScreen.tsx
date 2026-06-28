import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  createInitialState,
  applyMove,
  cloneState,
} from '../../engine'
import type { GameState, Move, Side, RuleConfig } from '../../engine'
import { evaluateExpert } from '../../bots/evaluation'
import { requestAnalysis } from '../../bots/analysisClient'
import type { AnalysisHandle } from '../../bots/analysisClient'
import { useGameStore, type AnalysisCacheEntry } from '../../state/gameStore'
import { useSettingsStore } from '../../state/settingsStore'
import { classificationColors, type ClassificationKey } from '../theme'
import { strings } from '../strings'

function classifyEvalDrop(drop: number): ClassificationKey {
  if (drop <= 0) return 'best'
  if (drop <= 0.3) return 'excellent'
  if (drop <= 1.0) return 'good'
  if (drop <= 2.0) return 'inaccuracy'
  if (drop <= 4.0) return 'mistake'
  return 'blunder'
}

const classificationLabel: Record<ClassificationKey, string> = {
  best: strings.review.best,
  excellent: strings.review.excellent,
  good: strings.review.good,
  inaccuracy: strings.review.inaccuracy,
  mistake: strings.review.mistake,
  blunder: strings.review.blunder,
}

interface PositionInfo {
  state: GameState
  move?: Move
  index: number
  player: Side
}

function replayPositions(
  gameState: GameState,
  firstPlayer: Side,
  rules: RuleConfig,
): PositionInfo[] {
  const initial = createInitialState(rules, firstPlayer)
  const positions: PositionInfo[] = []

  let current = cloneState(initial)
  positions.push({
    state: cloneState(current),
    move: undefined,
    index: 0,
    player: current.currentPlayer,
  })

  for (let i = 0; i < gameState.moveHistory.length; i++) {
    const move = gameState.moveHistory[i]!
    current = applyMove(current, move.pitIndex, rules)
    positions.push({
      state: cloneState(current),
      move,
      index: i + 1,
      player: move.player,
    })
  }

  return positions
}

function EvalGraph({
  positions,
  cache,
  playerSide,
}: {
  positions: PositionInfo[]
  cache: AnalysisCacheEntry[]
  playerSide: Side | null
}) {
  const dataPoints = cache.map((entry, i) => {
    const pos = positions[i]
    if (!pos) return null
    let clampedEval = Math.max(-15, Math.min(15, entry.bestEval))
    if (playerSide && pos.player !== playerSide) {
      clampedEval = -clampedEval
    }
    return { x: i, eval: clampedEval }
  })

  const valid = dataPoints.filter((d): d is { x: number; eval: number } => d !== null)
  if (valid.length < 2) return null

  const padding = { left: 32, right: 16, top: 16, bottom: 24 }
  const width = 600
  const height = 160
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom

  const maxEval = Math.max(1, ...valid.map((d) => Math.abs(d.eval)))
  const yRange = maxEval * 1.2

  const toX = (x: number) =>
    padding.left + (x / Math.max(1, valid.length - 1)) * innerW
  const toY = (e: number) =>
    padding.top + innerH / 2 - (e / yRange) * (innerH / 2)

  const linePath = valid
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(d.x)} ${toY(d.eval)}`)
    .join(' ')

  const areaPath = [
    linePath,
    `L ${toX(valid[valid.length - 1]!.x)} ${toY(0)}`,
    `L ${toX(valid[0]!.x)} ${toY(0)}`,
    'Z',
  ].join(' ')

  const zeroY = toY(0)

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-40 md:h-44"
      >
        <line
          x1={padding.left}
          y1={zeroY}
          x2={width - padding.right}
          y2={zeroY}
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeWidth={1}
        />
        <path d={areaPath} fill="var(--theme-accent)" fillOpacity={0.08} />
        <path
          d={linePath}
          fill="none"
          stroke="var(--theme-accent)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {valid.map((d, i) => (
          <circle
            key={i}
            cx={toX(d.x)}
            cy={toY(d.eval)}
            r={3}
            fill="var(--theme-accent)"
          />
        ))}
      </svg>
    </div>
  )
}

function MoveListPanel({
  positions,
  cache,
  currentIndex,
  onSelect,
  playerSide,
}: {
  positions: PositionInfo[]
  cache: AnalysisCacheEntry[]
  currentIndex: number
  onSelect: (index: number) => void
  playerSide: Side | null
}) {
  const moves = positions.slice(1)

  return (
    <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto">
      {moves.map((pos, i) => {
        const entry = cache[pos.index]
        if (!entry) return null

        const playedMove = pos.move!
        const index = pos.index
        const isBest = playedMove.pitIndex === entry.bestPitIndex
        const evalDrop = isBest ? 0 : Math.max(0, entry.bestEval - entry.playedEval)
        const cls = isBest ? 'best' : classifyEvalDrop(evalDrop)
        const color = classificationColors[cls]

        const notate = (p: number) => {
          if (p <= 5) return String.fromCharCode(97 + p)
          return String.fromCharCode(65 + p - 7)
        }
        const playedNotation = notate(playedMove.pitIndex)
        const bestNotation = notate(entry.bestPitIndex)

        const moveNum = Math.floor(index / 2) + 1
        const isEven = index % 2 === 1
        const label = isEven ? `${moveNum}.` : '...'

        return (
          <button
            key={index}
            type="button"
            onClick={() => onSelect(index)}
            className={
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ' +
              (currentIndex === index
                ? 'bg-accent/15 text-text'
                : 'hover:bg-board/30 text-text')
            }
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-muted w-8 text-left text-xs">
              {label}
            </span>
            <span className="font-mono font-bold">{playedNotation}</span>
            {!isBest && playedNotation !== bestNotation && (
              <span className="text-muted text-xs">
                ({strings.review.recommended} {bestNotation})
              </span>
            )}
            {!isBest && (
              <span className="ml-auto text-xs" style={{ color }}>
                {evalDrop > 0 ? `-${evalDrop.toFixed(1)}` : ''}
              </span>
            )}
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
              style={{
                backgroundColor: color + '22',
                color,
              }}
            >
              {classificationLabel[cls]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function MiniBoardDisplay({
  state,
  viewFromBottom,
  accentPit,
}: {
  state: GameState
  viewFromBottom: boolean
  accentPit?: number | null
}) {
  const board = state.board

  const topPits = viewFromBottom ? [12, 11, 10, 9, 8, 7] : [5, 4, 3, 2, 1, 0]
  const botPits = viewFromBottom ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]
  const leftStore = viewFromBottom ? 13 : 6
  const rightStore = viewFromBottom ? 6 : 13

  const renderPit = (idx: number) => {
    const isAccent = accentPit === idx
    return (
      <div
        key={idx}
        className={
          'relative w-8 h-8 rounded-md border flex items-center justify-center text-[10px] font-bold ' +
          (isAccent
            ? 'border-accent ring-1 ring-accent bg-pit'
            : 'border-board/40 bg-pit/60')
        }
      >
        {board[idx]}
      </div>
    )
  }

  return (
    <div className="flex flex-col md:flex-row items-center gap-1.5">
      <div className="flex items-center justify-center bg-pit/40 rounded-lg px-2 py-1 min-w-[3rem]">
        <span className="text-xs font-bold">{board[leftStore]}</span>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex gap-1">{topPits.map(renderPit)}</div>
        <div className="flex gap-1">{botPits.map(renderPit)}</div>
      </div>
      <div className="flex items-center justify-center bg-pit/40 rounded-lg px-2 py-1 min-w-[3rem]">
        <span className="text-xs font-bold">{board[rightStore]}</span>
      </div>
    </div>
  )
}

export function ReviewScreen() {
  const navigate = useNavigate()
  const gameState = useGameStore((s) => s.gameState)
  const firstPlayer = useGameStore((s) => s.firstPlayer)
  const rules = useGameStore((s) => s.rules)
  const savedMeta = useGameStore((s) => s.savedMeta)
  const analysisCache = useGameStore((s) => s.analysisCache)
  const setAnalysisCache = useGameStore((s) => s.setAnalysisCache)

  const boardFlip = useSettingsStore((s) => s.boardFlip)

  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showPV, setShowPV] = useState(false)
  const [pvStep, setPvStep] = useState(0)
  const [localCache, setLocalCache] = useState<AnalysisCacheEntry[] | null>(
    null,
  )

  const analysisRef = useRef<AnalysisHandle | null>(null)
  const pvTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const playerSide: Side | null = savedMeta?.mode === 'vs-bot'
    ? savedMeta.playerSide === 'random' ? 'bottom' : savedMeta.playerSide
    : null

  const cache = localCache ?? analysisCache

  const positions = useMemo(() => {
    if (!gameState) return []
    return replayPositions(gameState, firstPlayer, rules)
  }, [gameState, firstPlayer, rules])

  const runBatchAnalysis = useCallback(async () => {
    if (!gameState || positions.length === 0) return
    setAnalyzing(true)
    setProgress({ current: 0, total: gameState.moveHistory.length })

    const entries: AnalysisCacheEntry[] = []

    for (let i = 0; i < gameState.moveHistory.length; i++) {
      const pos = positions[i]
      if (!pos || pos.state.status !== 'in-progress') {
        entries.push({
          bestPitIndex: -1,
          bestEval: 0,
          pv: [],
          depth: 0,
          playedEval: 0,
        })
        setProgress({ current: i + 1, total: gameState.moveHistory.length })
        continue
      }

      try {
        const handle = await requestAnalysis(pos.state, 500)
        analysisRef.current = handle
        const result = await handle.promise
        analysisRef.current = null

        const playedMove = gameState.moveHistory[i]!

        if (
          playedMove.pitIndex === result.pitIndex ||
          result.pitIndex < 0
        ) {
          entries.push({
            bestPitIndex: result.pitIndex,
            bestEval: result.evalScore,
            pv: result.principalVariation,
            depth: result.depthReached,
            playedEval: result.evalScore,
          })
        } else {
          let playedEval = result.evalScore
          try {
            const childState = applyMove(
              pos.state,
              playedMove.pitIndex,
              rules,
            )
            const childEval = evaluateExpert(
              childState,
              rules,
            )
            playedEval = playedMove.wasExtraTurn
              ? childEval
              : -childEval
          } catch {
            playedEval = result.evalScore
          }

          entries.push({
            bestPitIndex: result.pitIndex,
            bestEval: result.evalScore,
            pv: result.principalVariation,
            depth: result.depthReached,
            playedEval,
          })
        }

        analysisRef.current = null
      } catch {
        analysisRef.current = null
        entries.push({
          bestPitIndex: -1,
          bestEval: 0,
          pv: [],
          depth: 0,
          playedEval: 0,
        })
      }

      setProgress({ current: i + 1, total: gameState.moveHistory.length })
    }

    setLocalCache(entries)
    setAnalysisCache(entries)
    setAnalyzing(false)
  }, [gameState, positions, rules, setAnalysisCache])

  useEffect(() => {
    if (cache) return
    runBatchAnalysis()
  }, [cache, runBatchAnalysis])

  useEffect(() => {
    return () => {
      if (analysisRef.current) analysisRef.current.cancel()
      if (pvTimerRef.current) clearInterval(pvTimerRef.current)
    }
  }, [])

  const currentPos = positions[currentIndex]
  const currentEntry = cache ? cache[currentIndex] : null

  const isHumanMove =
    currentPos &&
    (savedMeta?.mode !== 'vs-bot' ||
      currentPos.player === playerSide)

  const playedMoveNotBest =
    currentPos?.move &&
    currentEntry &&
    currentEntry.bestPitIndex >= 0 &&
    currentPos.move.pitIndex !== currentEntry.bestPitIndex

  const pvMoves = currentEntry?.pv ?? []
  const pvStates = useMemo(() => {
    if (!currentPos || pvMoves.length === 0) return []
    const states: GameState[] = []
    let s = cloneState(currentPos.state)
    for (const pit of pvMoves) {
      s = applyMove(s, pit, rules)
      states.push(cloneState(s))
    }
    return states
  }, [currentPos, pvMoves, rules])

  const handlePVPlayback = useCallback(() => {
    if (pvStates.length === 0) return
    setShowPV(true)
    setPvStep(0)
    if (pvTimerRef.current) clearInterval(pvTimerRef.current)
    pvTimerRef.current = setInterval(() => {
      setPvStep((prev) => {
        const next = prev + 1
        if (next >= pvStates.length) {
          if (pvTimerRef.current) clearInterval(pvTimerRef.current)
          setTimeout(() => setShowPV(false), 800)
          return prev
        }
        return next
      })
    }, 600)
  }, [pvStates])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setCurrentIndex((prev) => Math.max(0, prev - 1))
      } else if (e.key === 'ArrowRight') {
        setCurrentIndex((prev) =>
          Math.min(positions.length - 1, prev + 1),
        )
      }
    },
    [positions.length],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const viewFromBottom = savedMeta?.mode === 'vs-bot'
    ? playerSide === 'bottom'
    : boardFlip
      ? currentPos?.player === 'bottom'
      : true

  const displayState = showPV && pvStates[pvStep]
    ? pvStates[pvStep]
    : currentPos?.state ?? null

  const accentPitForDisplay =
    showPV && pvMoves[pvStep] != null
      ? pvMoves[pvStep]
      : playedMoveNotBest && currentEntry
        ? currentEntry.bestPitIndex
        : null

  if (!gameState && !localCache) {
    if (!useGameStore.getState().gameState) {
      return <Navigate to="/home" replace />
    }
  }
  if (!gameState) return null

  return (
    <div className="min-h-screen p-3 md:p-4 flex flex-col items-center gap-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between w-full">
        <button
          type="button"
          onClick={() => navigate('/game')}
          className="text-accent hover:underline text-sm"
        >
          &larr; {strings.review.backToGame}
        </button>
        <h1 className="text-lg font-bold text-text">{strings.review.title}</h1>
        <div className="w-12" />
      </div>

      {analyzing && (
        <div className="flex flex-col items-center gap-2 py-8">
          <p className="text-muted text-sm">{strings.review.analyzing}</p>
          <div className="w-48 h-2 bg-board/40 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-accent rounded-full"
              initial={{ width: 0 }}
              animate={{
                width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
              }}
              transition={{ duration: 0.2 }}
            />
          </div>
          <p className="text-xs text-muted">
            {strings.review.progress(progress.current, progress.total)}
          </p>
        </div>
      )}

      {!analyzing && cache && (
        <>
          <div className="w-full">
            <p className="text-xs text-muted mb-1">{strings.review.evalGraph}</p>
            <EvalGraph
              positions={positions}
              cache={cache}
              playerSide={playerSide}
            />
          </div>

          {displayState && (
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCurrentIndex((prev) => Math.max(0, prev - 1))
                  }
                  disabled={currentIndex === 0}
                  className="text-accent disabled:opacity-30 text-lg"
                >
                  &#9664;
                </button>
                <MiniBoardDisplay
                  state={displayState}
                  viewFromBottom={viewFromBottom}
                  accentPit={accentPitForDisplay}
                />
                <button
                  type="button"
                  onClick={() =>
                    setCurrentIndex((prev) =>
                      Math.min(positions.length - 1, prev + 1),
                    )
                  }
                  disabled={currentIndex >= positions.length - 1}
                  className="text-accent disabled:opacity-30 text-lg"
                >
                  &#9654;
                </button>
              </div>

              <div className="text-xs text-muted text-center">
                {currentPos?.move
                  ? currentPos.player === 'bottom'
                    ? strings.game.player1
                    : strings.game.player2
                  : 'Start'}
                {currentPos?.move && (
                  <span className="ml-1 text-text">
                    {currentPos.move.player === 'bottom'
                      ? String.fromCharCode(97 + currentPos.move.pitIndex)
                      : String.fromCharCode(65 + currentPos.move.pitIndex - 7)}
                  </span>
                )}
              </div>

              {playedMoveNotBest && !showPV && isHumanMove && (
                <button
                  type="button"
                  onClick={handlePVPlayback}
                  className="text-xs text-accent hover:underline mt-1"
                >
                  {strings.review.seeWhatHappened}
                </button>
              )}

              {showPV && (
                <div className="text-xs text-accent animate-pulse">
                  {strings.review.recommended} —{' '}
                  {pvMoves
                    .slice(0, pvStep)
                    .map((p) =>
                      p <= 5
                        ? String.fromCharCode(97 + p)
                        : String.fromCharCode(65 + p - 7),
                    )
                    .join(' ')}
                </div>
              )}

              {playedMoveNotBest &&
                !showPV &&
                !isHumanMove &&
                currentEntry && (
                  <div className="text-xs text-muted">
                    {strings.review.recommended}:{' '}
                    {currentEntry.pv.length > 0
                      ? currentEntry.pv
                          .slice(0, 4)
                          .map((p) =>
                            p <= 5
                              ? String.fromCharCode(97 + p)
                              : String.fromCharCode(65 + p - 7),
                          )
                          .join(' ')
                      : strings.review.noPV}
                  </div>
                )}
            </div>
          )}

          <div className="w-full">
            <p className="text-xs text-muted mb-2">{strings.review.moveList}</p>
            <MoveListPanel
              positions={positions}
              cache={cache}
              currentIndex={currentIndex}
              onSelect={setCurrentIndex}
              playerSide={playerSide}
            />
          </div>

          <p className="text-[10px] text-muted/50 mt-2">
            &larr; &rarr; keys to scrub &middot; Click a move to jump
          </p>
        </>
      )}
    </div>
  )
}
