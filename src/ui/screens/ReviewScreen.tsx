import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, Navigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { createInitialState, applyMove, cloneState } from '../../engine'
import type { GameState, Move, Side, RuleConfig } from '../../engine'
import { evaluateExpert } from '../../bots/evaluation'
import { requestAnalysis } from '../../bots/analysisClient'
import type { AnalysisHandle } from '../../bots/analysisClient'
import { useGameStore, type AnalysisCacheEntry, type SavedMeta } from '../../state/gameStore'
import { useModeStore } from '../../state/modeStore'
import { useSettingsStore } from '../../state/settingsStore'
import { useHistoryStore } from '../../state/historyStore'
import { classificationColors, type ClassificationKey } from '../theme'
import { shareGame } from '../share'
import { gameToText } from '../../engine'
import { strings } from '../strings'
import { Board } from '../components/Board'
import { Chip } from '../components/Chip'
import { ScorePanel } from '../components/ScorePanel'
import { EvalGraph, type EvalGraphPoint } from '../components/EvalGraph'

function classifyEvalDrop(drop: number): ClassificationKey {
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
  move: Move | undefined
  index: number
  player: Side
}

function notatePit(p: number): string {
  if (p <= 5) return String.fromCharCode(97 + p)
  return String.fromCharCode(65 + p - 7)
}

function playerLabel(pos: PositionInfo, savedMeta: SavedMeta | null): string {
  if (savedMeta?.mode === 'vs-bot') {
    const human = savedMeta.playerSide === 'random' ? 'bottom' : savedMeta.playerSide
    return pos.player === human ? strings.game.you : strings.game.bot
  }
  return pos.player === 'bottom' ? strings.game.player1 : strings.game.player2
}

function playerNameShort(side: Side, savedMeta: SavedMeta | null): string {
  if (savedMeta?.mode === 'vs-bot') {
    const human = savedMeta.playerSide === 'random' ? 'bottom' : savedMeta.playerSide
    return side === human ? strings.game.you : strings.game.bot
  }
  return side === 'bottom' ? strings.game.player1 : strings.game.player2
}

function isHumanPos(pos: PositionInfo, savedMeta: SavedMeta | null): boolean {
  if (savedMeta?.mode !== 'vs-bot') return false
  const human = savedMeta.playerSide === 'random' ? 'bottom' : savedMeta.playerSide
  return pos.player === human
}

function replayPositions(
  gameState: GameState,
  firstPlayer: Side,
  rules: RuleConfig,
): PositionInfo[] {
  const initial = createInitialState(rules, firstPlayer)
  const positions: PositionInfo[] = []

  let current = cloneState(initial)

  for (let i = 0; i < gameState.moveHistory.length; i++) {
    const move = gameState.moveHistory[i]!
    positions.push({
      state: cloneState(current),
      move,
      index: i,
      player: move.player,
    })
    current = applyMove(current, move.pitIndex, rules)
  }

  positions.push({
    state: cloneState(current),
    move: undefined,
    index: gameState.moveHistory.length,
    player: current.currentPlayer,
  })

  return positions
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
  const setAnalysisCache = useGameStore((s) => s.setAnalysisCache)

  const updateAnalysisInHistory = useHistoryStore((s) => s.updateAnalysis)
  const animationSpeed = useSettingsStore((s) => s.animationSpeed)
  const showPitCounts = useSettingsStore((s) => s.showPitCounts)

  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, remaining: 0 })
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showPV, setShowPV] = useState(false)
  const [pvStep, setPvStep] = useState(0)
  const [localCache, setLocalCache] = useState<AnalysisCacheEntry[] | null>(null)
  const [playing, setPlaying] = useState(false)
  const [shareStatus, setShareStatus] = useState<string | null>(null)

  const analysisRef = useRef<AnalysisHandle | null>(null)
  const pvTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pvIndexAtStart = useRef<number | null>(null)
  const playbackRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const updateHistoryRef = useRef(false)

  const effectiveSpeed = animationSpeed > 0 ? animationSpeed : 1

  const playerSide: Side | null =
    savedMeta?.mode === 'vs-bot'
      ? savedMeta.playerSide === 'random'
        ? 'bottom'
        : savedMeta.playerSide
      : null

  const cache = localCache ?? analysisCache

  const positions = useMemo(() => {
    if (!gameState) return []
    return replayPositions(gameState, firstPlayer, rules)
  }, [gameState, firstPlayer, rules])

  const runBatchAnalysis = useCallback(async () => {
    if (!gameState || positions.length <= 1) return
    const moveCount = gameState.moveHistory.length
    setAnalyzing(true)
    setProgress({ current: 0, total: moveCount, remaining: 0 })

    const entries: AnalysisCacheEntry[] = []

      const startTime = performance.now()
      for (let i = 0; i < moveCount; i++) {
      const pos = positions[i]
      if (!pos || !pos.move || pos.state.status !== 'in-progress') {
        entries.push({
          bestPitIndex: -1,
          bestEval: 0,
          pv: [],
          depth: 0,
          playedEval: 0,
          rootScores: {},
        })
        setProgress({ current: i + 1, total: moveCount, remaining: 0 })
        continue
      }

      let remaining = 0
      try {
        const handle = await requestAnalysis(pos.state, 5000)
        analysisRef.current = handle
        const result = await handle.promise
        analysisRef.current = null

        const elapsed = performance.now() - startTime
        const avgMsPerPos = elapsed / (i + 1)
        remaining = Math.round((moveCount - i - 1) * avgMsPerPos / 1000)

        const rootScores = result.rootScores ?? {}
        const playedMove = pos.move

        if (playedMove.pitIndex === result.pitIndex || result.pitIndex < 0) {
          entries.push({
            bestPitIndex: result.pitIndex,
            bestEval: result.evalScore,
            pv: result.principalVariation,
            depth: result.depthReached,
            playedEval: result.evalScore,
            rootScores,
          })
        } else {
          let playedEval = result.evalScore
          const rootScore = rootScores[playedMove.pitIndex]
          if (rootScore !== undefined) {
            playedEval = rootScore
          } else {
            try {
              const childState = applyMove(pos.state, playedMove.pitIndex, rules)
              const childEval = evaluateExpert(childState, rules)
              const childMove = childState.moveHistory[childState.moveHistory.length - 1]
              playedEval = childMove?.wasExtraTurn ? childEval : -childEval
            } catch {
              playedEval = result.evalScore
            }
          }

          entries.push({
            bestPitIndex: result.pitIndex,
            bestEval: result.evalScore,
            pv: result.principalVariation,
            depth: result.depthReached,
            playedEval,
            rootScores,
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
          rootScores: {},
        })
      }

      setProgress({ current: i + 1, total: moveCount, remaining })
    }

    setLocalCache(entries)
    setAnalysisCache(entries)
    setAnalyzing(false)
    updateHistoryRef.current = true
  }, [gameState, positions, rules, setAnalysisCache])

  useEffect(() => {
    if (cache) return
    runBatchAnalysis()
  }, [cache, runBatchAnalysis])

  useEffect(() => {
    if (updateHistoryRef.current && cache && gameState) {
      updateHistoryRef.current = false
      const gt = gameToText(gameState)
      updateAnalysisInHistory(gt, cache)
    }
  }, [cache, gameState, updateAnalysisInHistory])

  useEffect(() => {
    return () => {
      if (analysisRef.current) analysisRef.current.cancel()
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

  const displayState = showPV && pvStates[pvStep] ? pvStates[pvStep] : (currentPos?.state ?? null)

  // Primary accent (theme colour): the recommended/best move (or PV step during playback)
  const accentPitForDisplay =
    showPV && pvMoves[pvStep] != null
      ? pvMoves[pvStep]
      : currentEntry && currentEntry.bestPitIndex >= 0
        ? currentEntry.bestPitIndex
        : null

  // Secondary accent (classification-coloured): the move the player actually played
  const secondaryAccentPit =
    showPV
      ? null
      : currentPos?.move?.pitIndex ?? null

  const secondaryAccentColor =
    secondaryAccentPit != null && currentEntry
      ? classificationColors[
          currentEntry.bestPitIndex === currentPos?.move?.pitIndex
            ? 'best'
            : classifyEvalDrop(currentEntry.bestEval - currentEntry.playedEval)
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

  if (!gameState && !localCache) {
    if (!useGameStore.getState().gameState) {
      return <Navigate to="/home" replace />
    }
  }
  if (!gameState) return null

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
            {progress.remaining > 30 && (
              <span className="ml-2">
                &middot; ~{Math.floor(progress.remaining / 60)}m{String(progress.remaining % 60).padStart(2, '0')}s
              </span>
            )}
          </p>
        </div>
      )}

      {!analyzing && cache && (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-x-8 flex flex-col gap-5">
          {/* RIGHT column: Graph + Move List (rendered first in DOM for mobile stacking) */}
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

          {/* LEFT column: Board + Controls */}
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

            {/* Scrubber bar */}
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
                className="flex-1 accent-accent h-1 cursor-pointer"
              />
              <span className="text-xs text-muted w-14 text-right font-mono shrink-0">
                {Math.min(currentIndex + 1, maxIndex)} / {maxIndex}
              </span>
            </div>

            {/* Prev/Next row */}
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

            {/* Move context */}
            <div className="text-xs text-muted text-center flex flex-col gap-1 min-h-[1.5em]">
              {currentPos?.move && (
                <span>
                  <span className="text-text font-mono font-bold">
                    {notatePit(currentPos.move!.pitIndex)}
                  </span>
                </span>
              )}

              {playedMoveNotBest && !showPV && currentEntry && (
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
                      style={{ color: classificationColors[classifyEvalDrop(currentEntry.bestEval - currentEntry.playedEval)] }}
                    >
                      {(currentEntry.playedEval - currentEntry.bestEval).toFixed(1)}
                    </span>
                  )}
                </>
              )}
            </div>

            {/* PV section */}
            {playedMoveNotBest && !showPV && isHumanTurn && (
              <button
                type="button"
                onClick={handlePVPlayback}
                className="text-xs text-accent hover:underline"
              >
                {strings.review.seeWhatHappened}
              </button>
            )}

            {showPV && (
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
                          : 'text-muted hover:bg-board/40')
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
                  </p>
                )}
                {pvStep >= pvStates.length - 1 && (
                  <p className="text-[10px] text-muted/50 mt-1">
                    Variation complete &middot; click any chip to review &middot; press
                    &ldquo;See&hellip;&rdquo; to restart
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
        const evalDrop = isBest ? 0 : Math.max(0, entry.bestEval - entry.playedEval)
        const cls = isBest ? 'best' : classifyEvalDrop(evalDrop)
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
            {/* Left part */}
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

            {/* Right part */}
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
