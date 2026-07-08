import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, Navigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cloneState, applyMove } from '../../engine'
import type { GameState, Side } from '../../engine'
import { useGameStore, type AnalysisCacheEntry, type SavedMeta } from '../../state/gameStore'
import { useModeStore } from '../../state/modeStore'
import { useSettingsStore } from '../../state/settingsStore'
import { useAnalysisService } from '../../state/analysisService'
import { classificationColors, type ClassificationKey } from '../theme'
import { classifyEvalDrop } from '../classification'
import { shareGame } from '../share'
import { gameToText } from '../../engine'
import { strings } from '../strings'
import { coerceLegacySide } from '../../util/side'
import { Board } from '../components/Board'
import { Chip } from '../components/Chip'
import { ScorePanel } from '../components/ScorePanel'
import { EvalGraph, type EvalGraphPoint } from '../components/EvalGraph'
import {
  replayPositions,
  isCacheHealthy,
  isPVActive,
  type PositionInfo,
} from '../batchAnalysis'

const classificationLabel: Record<ClassificationKey, string> = {
  best: strings.review.best,
  excellent: strings.review.excellent,
  good: strings.review.good,
  inaccuracy: strings.review.inaccuracy,
  mistake: strings.review.mistake,
  blunder: strings.review.blunder,
}

function notatePit(p: number): string {
  if (p <= 5) return String.fromCharCode(97 + p)
  return String.fromCharCode(65 + p - 7)
}

function playerLabel(pos: PositionInfo, savedMeta: SavedMeta | null): string {
  if (savedMeta?.mode === 'vs-bot') {
    const human = coerceLegacySide(savedMeta.playerSide)
    return pos.player === human ? strings.game.you : strings.game.bot
  }
  return pos.player === 'bottom' ? strings.game.player1 : strings.game.player2
}

function playerNameShort(side: Side, savedMeta: SavedMeta | null): string {
  if (savedMeta?.mode === 'vs-bot') {
    const human = coerceLegacySide(savedMeta.playerSide)
    return side === human ? strings.game.you : strings.game.bot
  }
  return side === 'bottom' ? strings.game.player1 : strings.game.player2
}

function isHumanPos(pos: PositionInfo, savedMeta: SavedMeta | null): boolean {
  if (savedMeta?.mode !== 'vs-bot') return false
  const human = coerceLegacySide(savedMeta.playerSide)
  return pos.player === human
}

export function ReviewScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const locationState = location.state as { fromHistory?: unknown; shared?: boolean } | null

  const gameState = useGameStore((s) => s.gameState)
  const firstPlayer = useGameStore((s) => s.firstPlayer)
  const rules = useGameStore((s) => s.rules)
  const savedMeta = useGameStore((s) => s.savedMeta)
  const analysisCache = useGameStore((s) => s.analysisCache)

  const animationSpeed = useSettingsStore((s) => s.animationSpeed)
  const showPitCounts = useSettingsStore((s) => s.showPitCounts)

  const serviceCurrent = useAnalysisService((s) => s.current)
  const serviceQueue = useAnalysisService((s) => s.queue)
  const serviceRequestAnalysis = useAnalysisService((s) => s.requestAnalysis)

  const [currentIndex, setCurrentIndex] = useState(0)
  const [showPV, setShowPV] = useState(false)
  const [pvStep, setPvStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [shareStatus, setShareStatus] = useState<string | null>(null)

  const pvTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pvIndexAtStart = useRef<number | null>(null)
  const playbackRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const effectiveSpeed = animationSpeed > 0 ? animationSpeed : 1

  const playerSide: Side | null =
    savedMeta?.mode === 'vs-bot'
      ? coerceLegacySide(savedMeta.playerSide)
      : null

  const gameText = useMemo(() => {
    if (!gameState) return null
    return gameToText(gameState)
  }, [gameState])

  const cache = analysisCache

  const analyzing = !!gameText && (
    serviceCurrent?.gameText === gameText || serviceQueue.includes(gameText)
  )

  const progress = serviceCurrent?.gameText === gameText
    ? serviceCurrent.progress
    : { current: 0, total: 0, remainingS: 0 }

  const tbPhase = serviceCurrent?.gameText === gameText
    ? serviceCurrent.tbPhase
    : false

  const positions = useMemo(() => {
    if (!gameState) return []
    return replayPositions(gameState, firstPlayer, rules)
  }, [gameState, firstPlayer, rules])

  useEffect(() => {
    if (!gameState || !gameText) return
    if (cache && isCacheHealthy(cache)) return
    serviceRequestAnalysis(
      { gameText, gameState, firstPlayer, rules },
      { foreground: true },
    )
  }, [gameText, gameState, firstPlayer, rules, cache, serviceRequestAnalysis])

  useEffect(() => {
    return () => {
      if (pvTimerRef.current) clearInterval(pvTimerRef.current)
      if (playbackRef.current) clearInterval(playbackRef.current)
    }
  }, [])

  useEffect(() => {
    if (pvIndexAtStart.current !== null && pvIndexAtStart.current !== currentIndex) {
      if (pvTimerRef.current) clearInterval(pvTimerRef.current)
      pvTimerRef.current = null
      setShowPV(false)
      setPvStep(0)
      pvIndexAtStart.current = null
    }
  }, [currentIndex])

  const currentPos = positions[currentIndex]
  const currentEntry = cache ? cache[currentIndex] : null

  const pvActive = isPVActive(showPV, pvIndexAtStart.current, currentIndex)

  const isHumanTurn =
    currentPos &&
    currentPos.move &&
    (savedMeta?.mode !== 'vs-bot' || currentPos.player === playerSide)

  const playedMoveNotBest =
    currentPos?.move &&
    currentEntry &&
    currentEntry.bestPitIndex >= 0 &&
    currentPos.move!.pitIndex !== currentEntry.bestPitIndex

  const pvMoves = currentEntry?.pv ?? []
  const pvReachedTerminal = currentEntry?.reachedTerminal ?? false

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

  const pvMovesWithPlayers = useMemo(() => {
    if (!currentPos || pvMoves.length === 0) return []
    const result: { pit: number; player: Side }[] = []
    let s = cloneState(currentPos.state)
    for (const pit of pvMoves) {
      result.push({ pit, player: s.currentPlayer })
      const child = applyMove(s, pit, rules)
      s = child
    }
    return result
  }, [currentPos, pvMoves, rules])

  const handlePVPlayback = useCallback(() => {
    if (pvStates.length === 0) return
    if (showPV) {
      if (pvTimerRef.current) clearInterval(pvTimerRef.current)
      setPvStep(0)
      pvTimerRef.current = setInterval(() => {
        setPvStep((prev) => {
          const next = prev + 1
          if (next >= pvStates.length) {
            if (pvTimerRef.current) clearInterval(pvTimerRef.current)
            pvTimerRef.current = null
            return prev
          }
          return next
        })
      }, 1200)
    } else {
      setShowPV(true)
      setPvStep(0)
      pvIndexAtStart.current = currentIndex
      pvTimerRef.current = setInterval(() => {
        setPvStep((prev) => {
          const next = prev + 1
          if (next >= pvStates.length) {
            if (pvTimerRef.current) clearInterval(pvTimerRef.current)
            pvTimerRef.current = null
            return prev
          }
          return next
        })
      }, 1200)
    }
  }, [pvStates, showPV, currentIndex])

  const handlePVChipClick = useCallback((step: number) => {
    if (pvTimerRef.current) clearInterval(pvTimerRef.current)
    pvTimerRef.current = null
    setPvStep(step)
  }, [])

  const togglePlayback = useCallback(() => {
    setPlaying((prev) => !prev)
  }, [])

  useEffect(() => {
    if (!playing) {
      if (playbackRef.current) {
        clearInterval(playbackRef.current)
        playbackRef.current = null
      }
      return
    }

    const interval = Math.max(400, Math.round(1200 / effectiveSpeed))
    playbackRef.current = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = prev + 1
        if (next >= positions.length) {
          setPlaying(false)
          return prev
        }
        return next
      })
    }, interval)

    return () => {
      if (playbackRef.current) {
        clearInterval(playbackRef.current)
        playbackRef.current = null
      }
    }
  }, [playing, positions.length, effectiveSpeed])

  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value)
    setCurrentIndex(val)
    setPlaying(false)
  }, [])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setCurrentIndex((prev) => Math.max(0, prev - 1))
        setPlaying(false)
      } else if (e.key === 'ArrowRight') {
        setCurrentIndex((prev) => Math.min(positions.length - 1, prev + 1))
        setPlaying(false)
      } else if (e.key === ' ') {
        e.preventDefault()
        if (positions.length > 1) togglePlayback()
      }
    },
    [positions.length, togglePlayback],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const viewFromBottom =
    savedMeta?.mode === 'vs-bot'
      ? playerSide === 'bottom'
      : true

  const displayState = pvActive && pvStates[pvStep] ? pvStates[pvStep] : (currentPos?.state ?? null)

  const accentPitForDisplay =
    pvActive && pvMoves[pvStep] != null
      ? pvMoves[pvStep]
      : currentEntry && currentEntry.bestPitIndex >= 0
        ? currentEntry.bestPitIndex
        : null

  const secondaryAccentPit =
    pvActive
      ? null
      : currentPos?.move?.pitIndex ?? null

  const secondaryAccentColor =
    secondaryAccentPit != null && currentEntry
      ? classificationColors[
          currentEntry.bestPitIndex === currentPos?.move?.pitIndex
            ? 'best'
            : classifyEvalDrop(currentEntry.bestEval, currentEntry.playedEval)
        ]
      : undefined

  const board = displayState?.board
  const bottomScore = board?.[6] ?? 0
  const topScore = board?.[13] ?? 0

  const isShared = locationState?.shared === true

  const handlePlayFromHere = useCallback(() => {
    if (!currentPos) return
    useGameStore.getState().clear()
    useGameStore.setState({
      gameState: cloneState(currentPos.state),
      savedMeta: null,
    })
    useModeStore.getState().setMode(null)
    navigate('/game')
  }, [currentPos, navigate])

  const handleShare = useCallback(async () => {
    if (!gameState) return
    const gs = gameState
    const text = gameToText(gs)
    try {
      await shareGame(text, 'mancala game replay')
      setShareStatus(strings.game.shareCopied)
    } catch {
      setShareStatus(strings.game.shareFailed)
    }
    setTimeout(() => setShareStatus(null), 3000)
  }, [gameState])

  const graphPoints = useMemo((): EvalGraphPoint[] => {
    if (!cache) return []
    const pts: EvalGraphPoint[] = []
    for (let i = 0; i < positions.length - 1; i++) {
      const pos = positions[i]
      if (!pos || !pos.move) continue
      const entry = cache[i]
      if (!entry || entry.bestPitIndex < 0) continue
      let clampedEval = Math.max(-15, Math.min(15, entry.bestEval))
      if (playerSide && pos.player !== playerSide) {
        clampedEval = -clampedEval
      }
      pts.push({
        index: i,
        eval: clampedEval,
        moveNumber: i + 1,
      })
    }
    return pts
  }, [cache, positions, playerSide])

  const graphTopLabel = playerSide
    ? playerNameShort(playerSide, savedMeta)
    : strings.game.player1
  const graphBottomLabel = playerSide
    ? playerNameShort(playerSide === 'bottom' ? 'top' : 'bottom', savedMeta)
    : strings.game.player2

  if (!gameState) {
    return <Navigate to="/home" replace />
  }

  const maxIndex = positions.length - 1

  return (
    <div className="min-h-screen p-3 md:p-4 max-w-[1240px] mx-auto">
      {shareStatus && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-accent text-bg text-sm px-4 py-2 rounded-lg shadow-lg">
          {shareStatus}
        </div>
      )}

      <div className="flex items-center justify-between w-full mb-4">
        <h1 className="text-display-md font-display font-semibold text-text">
          {isShared ? strings.shared.readOnlyReview : strings.review.title}
        </h1>
        <div className="flex gap-3">
          {isShared && currentPos && (
            <button
              type="button"
              onClick={handlePlayFromHere}
              className="text-accent hover:underline text-xs"
            >
              {strings.shared.playFromHere}
            </button>
          )}
          <button
            type="button"
            onClick={handleShare}
            className="text-accent hover:underline text-xs"
          >
            {strings.review.shareGame}
          </button>
        </div>
      </div>

      {analyzing && (
        <div className="flex flex-col items-center gap-2 py-12">
          <p className="text-muted text-sm">
            {tbPhase ? strings.review.preparingEndgameTables : strings.review.analyzing}
          </p>
          <div className="w-48 h-2 bg-surface-2 rounded-full overflow-hidden">
            <motion.div
              className={
                'h-full bg-accent rounded-full' +
                (progress.total > 0 && (progress.current / progress.total) * 100 < 100 ? ' animate-pulse' : '')
              }
              initial={{ width: 0 }}
              animate={{
                width: `${progress.total > 0 ? Math.max((progress.current / progress.total) * 100, 3) : 0}%`,
              }}
              transition={{ duration: 0.2 }}
            />
          </div>
          <p className="text-xs text-muted">
            {tbPhase
              ? ''
              : strings.review.progress(progress.current, progress.total)}
            {progress.remainingS > 30 && !tbPhase && (
              <span className="ml-2">
                &middot; ~{Math.floor(progress.remainingS / 60)}m{String(progress.remainingS % 60).padStart(2, '0')}s
              </span>
            )}
          </p>
        </div>
      )}

      {!analyzing && cache && (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-x-8 flex flex-col gap-5">
          <div className="lg:sticky lg:top-4 flex flex-col gap-4 lg:max-h-[calc(100vh-2rem)] order-first lg:order-none">
            <div>
              <p className="text-label text-muted mb-2">{strings.review.evalGraph}</p>
              <EvalGraph
                points={graphPoints}
                currentIndex={currentIndex}
                onSelectIndex={(idx) => {
                  setCurrentIndex(idx)
                  setPlaying(false)
                }}
                height={280}
                topLabel={graphTopLabel}
                bottomLabel={graphBottomLabel}
              />
            </div>

            <div className="flex-1 min-h-0 flex flex-col">
              <p className="text-label text-muted mb-2 shrink-0">{strings.review.moveList}</p>
              <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border/40 bg-surface/30">
                <MoveListPanel
                  positions={positions}
                  cache={cache}
                  currentIndex={currentIndex}
                  onSelect={(idx) => {
                    setCurrentIndex(idx)
                    setPlaying(false)
                  }}
                  savedMeta={savedMeta}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4">
            {displayState && (
              <>
                <ScorePanel
                  bottomLabel={
                    savedMeta?.mode === 'vs-bot'
                      ? (playerSide === 'bottom' ? strings.game.you : strings.game.bot)
                      : strings.game.player1
                  }
                  topLabel={
                    savedMeta?.mode === 'vs-bot'
                      ? (playerSide === 'top' ? strings.game.you : strings.game.bot)
                      : strings.game.player2
                  }
                  bottomScore={bottomScore}
                  topScore={topScore}
                  currentPlayer={displayState.currentPlayer}
                />
                <Board
                  gameState={displayState}
                  viewFromBottom={viewFromBottom}
                  clickablePits={[]}
                  onPitClick={() => {}}
                  pendingMove={null}
                  prevBoard={null}
                  effectiveSpeed={0}
                  onAnimationComplete={() => {}}
                  showPitCounts={showPitCounts}
                  accentPit={accentPitForDisplay}
                  secondaryAccentPit={secondaryAccentPit}
                  {...(secondaryAccentColor ? { secondaryAccentColor } : {})}
                  className="max-w-none"
                />
              </>
            )}

            <div className="flex items-center gap-2 w-full max-w-md">
              <button
                type="button"
                onClick={togglePlayback}
                disabled={maxIndex <= 0}
                className="text-accent disabled:opacity-30 text-sm font-medium w-10 shrink-0"
                aria-label={playing ? strings.review.pause : strings.review.play}
              >
                {playing ? '\u23F8' : '\u25B6'}
              </button>
              <input
                type="range"
                min={0}
                max={maxIndex}
                value={currentIndex}
                onChange={handleScrub}
                className="themed-range flex-1 cursor-pointer"
              />
              <span className="text-xs text-muted w-14 text-right font-mono shrink-0">
                {Math.min(currentIndex + 1, maxIndex)} / {maxIndex}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setCurrentIndex((prev) => Math.max(0, prev - 1))
                  setPlaying(false)
                }}
                disabled={currentIndex === 0}
                className="text-accent disabled:opacity-30 text-lg px-2 py-1 hover:bg-accent/10 rounded-lg transition-colors"
                aria-label="Previous move"
              >
                &#9664;
              </button>
              <span className="text-xs text-muted min-w-[60px] text-center">
                {currentPos?.move
                  ? `${playerLabel(currentPos, savedMeta)}`
                  : 'Start'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setCurrentIndex((prev) => Math.min(maxIndex, prev + 1))
                  setPlaying(false)
                }}
                disabled={currentIndex >= maxIndex}
                className="text-accent disabled:opacity-30 text-lg px-2 py-1 hover:bg-accent/10 rounded-lg transition-colors"
                aria-label="Next move"
              >
                &#9654;
              </button>
            </div>

            <div className="text-xs text-muted text-center flex flex-col gap-1 min-h-[1.5em]">
              {currentPos?.move && (
                <span>
                  <span className="text-text font-mono font-bold">
                    {notatePit(currentPos.move!.pitIndex)}
                  </span>
                </span>
              )}

              {playedMoveNotBest && !pvActive && currentEntry && (
                <>
                  <span>
                    {strings.review.recommended}:{' '}
                    <span className="text-accent font-mono font-bold">
                      {notatePit(currentEntry.bestPitIndex)}
                    </span>
                  </span>
                  {currentEntry.playedEval < currentEntry.bestEval - 0.01 && (
                    <span
                      className="text-[11px] font-medium"
                      style={{ color: classificationColors[classifyEvalDrop(currentEntry.bestEval, currentEntry.playedEval)] }}
                    >
                      {(currentEntry.playedEval - currentEntry.bestEval).toFixed(1)}
                    </span>
                  )}
                </>
              )}
            </div>

            {playedMoveNotBest && !pvActive && isHumanTurn && (
              <button
                type="button"
                onClick={handlePVPlayback}
                className="text-xs text-accent hover:underline"
              >
                {strings.review.seeWhatHappened}
              </button>
            )}

            {pvActive && (
              <motion.div
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-accent font-medium"
              >
                {strings.review.recommended}
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 justify-center mt-1">
                  {pvMovesWithPlayers.map((m, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        handlePVChipClick(i)
                      }}
                      className={
                        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer transition-colors ' +
                        (i === pvStep
                          ? 'bg-accent/20 text-accent ring-1 ring-accent/50'
                          : 'text-muted hover:bg-surface-2')
                      }
                    >
                      <span className="text-[10px] opacity-70">
                        {playerNameShort(m.player, savedMeta)}
                      </span>
                      <span className="font-mono font-bold">{notatePit(m.pit)}</span>
                    </button>
                  ))}
                </div>
                {pvStep < pvStates.length - 1 && (
                  <p className="text-[10px] text-muted/50 mt-1">
                    Animating &middot; click any chip to scrub &middot; press
                    &ldquo;See&hellip;&rdquo; again to restart
                    {pvReachedTerminal && (
                      <span> &middot; {strings.review.linePlaysToEnd}</span>
                    )}
                  </p>
                )}
                {pvStep >= pvStates.length - 1 && (
                  <p className="text-[10px] text-muted/50 mt-1">
                    Variation complete &middot; click any chip to review &middot; press
                    &ldquo;See&hellip;&rdquo; to restart
                    {pvReachedTerminal && (
                      <span> &middot; {strings.review.linePlaysToEnd}</span>
                    )}
                  </p>
                )}
              </motion.div>
            )}

            <p className="text-[10px] text-muted/50 mt-2 text-center">
              &larr; &rarr; to scrub &middot; Space to play/pause &middot; Click move or graph to jump
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function MoveListPanel({
  positions,
  cache,
  currentIndex,
  onSelect,
  savedMeta,
}: {
  positions: PositionInfo[]
  cache: AnalysisCacheEntry[]
  currentIndex: number
  onSelect: (index: number) => void
  savedMeta: SavedMeta | null
}) {
  const movePositions = positions.filter((p) => p.move)

  return (
    <div className="flex flex-col">
      {movePositions.map((pos) => {
        const entry = cache[pos.index]
        if (!entry) return null

        const playedMove = pos.move!
        const index = pos.index
        const isBest = playedMove.pitIndex === entry.bestPitIndex
        const evalDrop = Math.max(0, entry.bestEval - entry.playedEval)
        const cls = isBest ? 'best' : classifyEvalDrop(entry.bestEval, entry.playedEval)
        const color = classificationColors[cls]

        const playedNotation = notatePit(playedMove.pitIndex)
        const bestNotation = notatePit(entry.bestPitIndex)
        const humanRow = isHumanPos(pos, savedMeta)
        const isBotMode = savedMeta?.mode === 'vs-bot'

        return (
          <button
            key={index}
            type="button"
            onClick={() => onSelect(index)}
            className={
              'flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors border-b border-border/20 last:border-b-0 ' +
              (currentIndex === index
                ? 'bg-accent/12 text-text'
                : 'hover:bg-board/20 text-text')
            }
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-muted w-6 text-left text-xs font-mono shrink-0">
                {index + 1}
              </span>
              {isBotMode && (
                <span className="text-muted/50 w-4 text-center text-[10px] shrink-0">
                  {humanRow ? 'Y' : 'B'}
                </span>
              )}
              <span className="font-mono font-bold">{playedNotation}</span>
              {!isBest && playedNotation !== bestNotation && (
                <span className="text-muted text-[11px] ml-0.5">
                  &rarr; {bestNotation}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!isBest && evalDrop > 0.01 && (
                <span className="text-[11px] font-medium tabular-nums" style={{ color }}>
                  {`-${evalDrop.toFixed(1)}`}
                </span>
              )}
              <Chip color={color} className="text-[10px] px-1.5 py-0.5">
                {classificationLabel[cls]}
              </Chip>
            </div>
          </button>
        )
      })}
    </div>
  )
}
