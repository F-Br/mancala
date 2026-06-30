import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { legalMoves, gameToText } from '../../engine'
import type { GameState as EngineGameState, Move, Side } from '../../engine'
import { requestBotMove, terminateBotWorker } from '../../bots/client'
import type { BotMoveHandle } from '../../bots/client'
import { requestAnalysis, terminateAnalysisWorker } from '../../bots/analysisClient'
import type { AnalysisHandle } from '../../bots/analysisClient'
import { useGameStore } from '../../state/gameStore'
import { useModeStore } from '../../state/modeStore'
import { useSettingsStore } from '../../state/settingsStore'
import { useHistoryStore, type GameRecord } from '../../state/historyStore'
import { getAudioContext } from '../../audio/synth'
import {
  playPlacement,
  playCapture as playCaptureSound,
  playExtraTurn as playExtraTurnSound,
  playGameEndWin,
  playGameEndLoss,
  playGameEndDraw,
} from '../../audio/sounds'
import { triggerHaptic } from '../../util/haptics'
import { Board } from '../components/Board'
import { ScorePanel } from '../components/ScorePanel'
import { MoveList } from '../components/MoveList'
import { GameEndOverlay } from '../components/GameEndOverlay'
import { shareGame } from '../share'
import { strings } from '../strings'

function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setPrefers(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return prefers
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 text-accent">
      <motion.span
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
        className="w-1.5 h-1.5 rounded-full bg-current"
      />
      <motion.span
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
        className="w-1.5 h-1.5 rounded-full bg-current"
      />
      <motion.span
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
        className="w-1.5 h-1.5 rounded-full bg-current"
      />
    </div>
  )
}

function LiveAnalysisPanel({
  evalScore,
  pv,
  visible,
}: {
  evalScore: number
  pv: number[]
  visible: boolean
}) {
  if (!visible) return null
  const sign = evalScore >= 0 ? '+' : ''
  const stones = `${sign}${evalScore.toFixed(1)}`

  const pvNotation = pv
    .slice(0, 6)
    .map((p) => {
      if (p <= 5) return String.fromCharCode(97 + p)
      return String.fromCharCode(65 + p - 7)
    })
    .join(' ')

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 text-xs bg-board/40 rounded-lg px-3 py-1.5 max-w-full overflow-hidden"
    >
      <span className="text-accent font-bold text-xs whitespace-nowrap">
        {strings.game.liveAnalysisOn}
      </span>
      <span className="text-text font-mono font-bold">{stones}</span>
      {pvNotation && <span className="text-muted truncate">{pvNotation}</span>}
    </motion.div>
  )
}

export function GameScreen() {
  const navigate = useNavigate()
  const mode = useModeStore((s) => s.mode)
  const botLevel = useModeStore((s) => s.botLevel)
  const playerSide = useModeStore((s) => s.playerSide)

  const gameState = useGameStore((s) => s.gameState)
  const makeMove = useGameStore((s) => s.makeMove)
  const reset = useGameStore((s) => s.reset)
  const takeback = useGameStore((s) => s.takeback)
  const setSavedMeta = useGameStore((s) => s.setSavedMeta)
  const clear = useGameStore((s) => s.clear)
  const savedMeta = useGameStore((s) => s.savedMeta)

  const addRecord = useHistoryStore((s) => s.addRecord)

  const animationSpeed = useSettingsStore((s) => s.animationSpeed)
  const soundEnabled = useSettingsStore((s) => s.soundEnabled)
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled)
  const showPitCounts = useSettingsStore((s) => s.showPitCounts)
  const liveHintsEnabled = useSettingsStore((s) => s.liveHintsEnabled)

  const prefersReducedMotion = usePrefersReducedMotion()
  const effectiveSpeed = prefersReducedMotion ? 0 : animationSpeed

  const [thinking, setThinking] = useState(false)
  const [pendingMove, setPendingMove] = useState<Move | null>(null)
  const [prevBoard, setPrevBoard] = useState<number[] | null>(null)
  const [boardLocked, setBoardLocked] = useState(false)
  const [displayCurrentPlayer, setDisplayCurrentPlayer] = useState<Side>('bottom')
  const [pitCountsVisible, setPitCountsVisible] = useState(false)

  const [liveHintPit, setLiveHintPit] = useState<number | null>(null)
  const [liveHintEval, setLiveHintEval] = useState(0)
  const [liveHintPV, setLiveHintPV] = useState<number[]>([])
  const [liveHintVisible, setLiveHintVisible] = useState(false)
  const [hintLoading, setHintLoading] = useState(false)
  const [oneShotHintPit, setOneShotHintPit] = useState<number | null>(null)
  const [selectedPit, setSelectedPit] = useState<number | null>(null)
  const [shareStatus, setShareStatus] = useState<string | null>(null)

  const botRequestRef = useRef<BotMoveHandle | null>(null)
  const botInFlight = useRef(false)
  const initDone = useRef(false)
  const analysisRef = useRef<AnalysisHandle | null>(null)
  const lastAnalyzedMoveCount = useRef(-1)
  const hintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedToHistoryRef = useRef(false)

  const isVsBot = mode === 'vs-bot'

  const humanSide: Side | null = isVsBot ? (playerSide === 'random' ? 'bottom' : playerSide) : null

  const clickablePits = useMemo(() => {
    if (!gameState || gameState.status !== 'in-progress') return []
    if (isVsBot && gameState.currentPlayer !== humanSide) return []
    if (boardLocked) return []
    return legalMoves(gameState)
  }, [gameState, isVsBot, humanSide, boardLocked])

  const cancelBot = useCallback(() => {
    if (botRequestRef.current) {
      botRequestRef.current.cancel()
      botRequestRef.current = null
    }
    setThinking(false)
    botInFlight.current = false
  }, [])

  const cancelAnalysis = useCallback(() => {
    if (analysisRef.current) {
      analysisRef.current.cancel()
      analysisRef.current = null
    }
  }, [])

  const runLiveAnalysis = useCallback(
    async (state: EngineGameState) => {
      if (!liveHintsEnabled) return
      if (state.status !== 'in-progress') return
      cancelAnalysis()

      try {
        const handle = await requestAnalysis(state, 800)
        analysisRef.current = handle
        const result = await handle.promise
        analysisRef.current = null

        if (result.pitIndex >= 0) {
          setLiveHintPit(result.pitIndex)
          setLiveHintEval(result.evalScore)
          setLiveHintPV(result.principalVariation)
          setLiveHintVisible(true)
        }
      } catch {
        analysisRef.current = null
      }
    },
    [liveHintsEnabled, cancelAnalysis],
  )

  const doBotMove = useCallback(
    async (state: EngineGameState) => {
      botInFlight.current = true
      setThinking(true)
      try {
        const handle = await requestBotMove(state, botLevel)
        botRequestRef.current = handle
        const result = await handle.promise
        botRequestRef.current = null

        const prev = [...state.board]
        makeMove(result.pitIndex)
        const newState = useGameStore.getState().gameState
        if (!newState) return

        const lastMove = newState.moveHistory[newState.moveHistory.length - 1]
        if (!lastMove) {
          botInFlight.current = false
          setThinking(false)
          return
        }
        setPrevBoard(prev)
        setPendingMove(lastMove)
        setBoardLocked(true)
        setThinking(false)
        botInFlight.current = false

        if (soundEnabled) getAudioContext()
      } catch {
        botInFlight.current = false
        setThinking(false)
      }
    },
    [botLevel, makeMove, soundEnabled],
  )

  const handlePitClick = useCallback(
    (pitIndex: number) => {
      if (thinking || botInFlight.current || boardLocked || !gameState) return
      const prev = [...gameState.board]
      makeMove(pitIndex)
      const newState = useGameStore.getState().gameState
      if (!newState) return
      const lastMove = newState.moveHistory[newState.moveHistory.length - 1]
      if (!lastMove) return
      setPrevBoard(prev)
      setPendingMove(lastMove)
      setBoardLocked(true)

      if (effectiveSpeed > 0 && soundEnabled) {
        getAudioContext()
      }
    },
    [gameState, makeMove, thinking, boardLocked, effectiveSpeed, soundEnabled],
  )

  const handleAnimationComplete = useCallback(() => {
    setBoardLocked(false)
    setPrevBoard(null)
    setPendingMove(null)

    const newState = useGameStore.getState().gameState
    if (!newState) return

    setDisplayCurrentPlayer(newState.currentPlayer)

    if (newState.status === 'finished') {
      if (soundEnabled) {
        if (newState.winner === 'draw') playGameEndDraw()
        else if (isVsBot && newState.winner === humanSide) playGameEndWin()
        else if (isVsBot) playGameEndLoss()
      }
      triggerHaptic('game-end', hapticsEnabled)
      return
    }

    if (isVsBot && newState.currentPlayer !== humanSide) {
      doBotMove(newState)
    }
  }, [isVsBot, humanSide, doBotMove, soundEnabled, hapticsEnabled])

  const saveToHistory = useCallback(() => {
    if (savedToHistoryRef.current) return
    const gs = useGameStore.getState().gameState
    if (!gs || gs.status !== 'finished') return

    const meta = savedMeta ?? { mode, botLevel, playerSide }
    if (!meta.mode) return

    const humanSideActual =
      meta.mode === 'vs-bot' ? (meta.playerSide === 'random' ? 'bottom' : meta.playerSide) : null

    const playerScore = gs.board[humanSideActual === 'top' ? 13 : 6]!
    const opponentScore = gs.board[humanSideActual === 'top' ? 6 : 13]!

    let result: 'win' | 'loss' | 'draw'
    if (gs.winner === 'draw') {
      result = 'draw'
    } else if (meta.mode === 'vs-bot' && humanSideActual) {
      result = gs.winner === humanSideActual ? 'win' : 'loss'
    } else {
      result = gs.winner === 'bottom' ? 'win' : gs.winner === 'top' ? 'loss' : 'draw'
    }

    const opponentLabel =
      meta.mode === 'vs-bot'
        ? `${strings.game.bot}${meta.botLevel ? ' (' + meta.botLevel + ')' : ''}`
        : strings.game.player2

    const record: GameRecord = {
      id: crypto.randomUUID(),
      mode: meta.mode,
      botLevel: meta.botLevel,
      playerSide: meta.playerSide,
      opponentLabel,
      result,
      finalScore: { player: playerScore, opponent: opponentScore },
      gameText: gameToText(gs),
      dateISO: new Date().toISOString(),
    }

    addRecord(record)
    savedToHistoryRef.current = true
  }, [mode, botLevel, playerSide, savedMeta, addRecord])

  const handleStoneLanded = useCallback(
    (stoneIndex: number) => {
      if (effectiveSpeed > 0 && soundEnabled) playPlacement(stoneIndex)
    },
    [effectiveSpeed, soundEnabled],
  )

  const handleCaptureEvent = useCallback(() => {
    if (effectiveSpeed > 0 && soundEnabled) playCaptureSound()
    if (hapticsEnabled) triggerHaptic('capture', hapticsEnabled)
  }, [effectiveSpeed, soundEnabled, hapticsEnabled])

  const handleExtraTurnEvent = useCallback(() => {
    if (effectiveSpeed > 0 && soundEnabled) playExtraTurnSound()
    if (hapticsEnabled) triggerHaptic('extra-turn', hapticsEnabled)
  }, [effectiveSpeed, soundEnabled, hapticsEnabled])

  const handleTakeback = useCallback(() => {
    if (boardLocked) return
    cancelBot()
    cancelAnalysis()
    takeback()
  }, [cancelBot, cancelAnalysis, takeback, boardLocked])

  const handleNewGame = useCallback(() => {
    cancelBot()
    cancelAnalysis()
    setBoardLocked(false)
    setPendingMove(null)
    setPrevBoard(null)
    const fp = humanSide ?? 'bottom'
    reset(fp)
    if (mode) setSavedMeta({ mode, botLevel, playerSide })
  }, [cancelBot, cancelAnalysis, reset, humanSide, mode, botLevel, playerSide, setSavedMeta])

  const handleHome = useCallback(() => {
    cancelBot()
    cancelAnalysis()
    terminateBotWorker()
    terminateAnalysisWorker()
    clear()
    useModeStore.getState().setMode(null)
    navigate('/home')
  }, [cancelBot, cancelAnalysis, clear, navigate])

  const handleReview = useCallback(() => {
    saveToHistory()
    navigate('/analysis')
  }, [navigate, saveToHistory])

  const handleShare = useCallback(async () => {
    const gs = useGameStore.getState().gameState
    if (!gs) return
    const text = gameToText(gs)
    try {
      await shareGame(text, 'mancala game')
      setShareStatus(strings.game.shareCopied)
    } catch {
      setShareStatus(strings.game.shareFailed)
    }
    setTimeout(() => setShareStatus(null), 3000)
  }, [])

  const handleHint = useCallback(async () => {
    if (!gameState || gameState.status !== 'in-progress' || boardLocked) return
    setHintLoading(true)
    setOneShotHintPit(null)

    try {
      const handle = await requestAnalysis(gameState, 2000)
      analysisRef.current = handle
      const result = await handle.promise
      analysisRef.current = null

      if (result.pitIndex >= 0) {
        setOneShotHintPit(result.pitIndex)
        if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current)
        hintTimeoutRef.current = setTimeout(() => {
          setOneShotHintPit(null)
        }, 3000)
      }
    } catch {
      analysisRef.current = null
    } finally {
      setHintLoading(false)
    }
  }, [gameState, boardLocked])

  const takebackAllowed = useMemo(
    () =>
      gameState !== null && gameState.moveHistory.length > 0 && gameState.status === 'in-progress',
    [gameState],
  )

  const bottomLabel = isVsBot
    ? humanSide === 'bottom'
      ? strings.game.you
      : strings.game.bot
    : strings.game.player1

  const topLabel = isVsBot
    ? humanSide === 'top'
      ? strings.game.you
      : strings.game.bot
    : strings.game.player2

  useEffect(() => {
    if (initDone.current) return
    initDone.current = true

    const gs = useGameStore.getState()
    if (gs.gameState && gs.savedMeta) {
      useModeStore.getState().setMode(gs.savedMeta.mode)
      useModeStore.getState().setBotLevel(gs.savedMeta.botLevel)
      if (gs.savedMeta.mode === 'vs-bot') {
        useModeStore.getState().setPlayerSide(gs.savedMeta.playerSide)
      }
    } else if (!gs.gameState && mode) {
      reset()
      setSavedMeta({ mode, botLevel, playerSide })
    }
  }, [mode, botLevel, playerSide, reset, setSavedMeta])

  useEffect(() => {
    if (!gameState || !isVsBot || boardLocked) return
    if (gameState.status !== 'in-progress') return
    if (gameState.currentPlayer === humanSide) return
    if (botInFlight.current) return

    doBotMove(gameState)
  }, [gameState, isVsBot, humanSide, doBotMove, boardLocked])

  useEffect(() => {
    if (!gameState || !liveHintsEnabled || boardLocked) {
      if (!liveHintsEnabled) {
        setLiveHintVisible(false)
        setLiveHintPit(null)
      }
      return
    }
    if (gameState.status !== 'in-progress') return
    if (gameState.currentPlayer !== humanSide) return

    const moveCount = gameState.moveHistory.length
    if (moveCount === lastAnalyzedMoveCount.current) return
    lastAnalyzedMoveCount.current = moveCount

    runLiveAnalysis(gameState)
  }, [gameState, liveHintsEnabled, humanSide, boardLocked, runLiveAnalysis])

  useEffect(() => {
    return () => {
      cancelBot()
      cancelAnalysis()
      if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current)
    }
  }, [cancelBot, cancelAnalysis])

  useEffect(() => {
    if (liveHintPit === null) return
    if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current)
    hintTimeoutRef.current = setTimeout(() => {
      setLiveHintPit(null)
    }, 4000)
    return () => {
      if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current)
    }
  }, [liveHintPit])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!gameState || gameState.status !== 'in-progress') return
      if (boardLocked || thinking) return
      if (isVsBot && gameState.currentPlayer !== humanSide) return

      if (e.key >= '1' && e.key <= '6') {
        const idx = parseInt(e.key, 10) - 1
        const row = [0, 1, 2, 3, 4, 5]
        if (idx >= 0 && idx < row.length) {
          const pitIndex = row[idx]!
          if (clickablePits.includes(pitIndex)) {
            setSelectedPit(pitIndex)
          }
        }
        return
      }

      if (e.key === 'Enter' && selectedPit !== null) {
        if (clickablePits.includes(selectedPit)) {
          handlePitClick(selectedPit!)
          setSelectedPit(null)
        }
        return
      }

      if (e.key === 'Escape') {
        setSelectedPit(null)
      }
    },
    [
      gameState,
      boardLocked,
      thinking,
      isVsBot,
      humanSide,
      clickablePits,
      selectedPit,
      handlePitClick,
    ],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    if (gameState?.status === 'finished') {
      saveToHistory()
    }
  }, [gameState?.status, saveToHistory])

  if (!mode && !gameState) return <Navigate to="/home" replace />
  if (!gameState) return null

  const accentPit = selectedPit ?? oneShotHintPit ?? liveHintPit
  const isHumanTurn =
    gameState.status === 'in-progress' &&
    (!isVsBot || gameState.currentPlayer === humanSide) &&
    !boardLocked

  return (
    <div className="min-h-screen p-3 md:p-4 flex flex-col items-center gap-3 max-w-4xl mx-auto relative">
      <div className="flex items-center justify-end w-full max-w-xl mx-auto">
        <div className="flex items-center gap-3">
          {!isVsBot && !boardLocked && gameState.status === 'in-progress' && (
            <button
              type="button"
              onClick={() => setPitCountsVisible((v) => !v)}
              className="text-accent/70 hover:text-accent text-xs"
            >
              {pitCountsVisible ? strings.game.hideCounts : strings.game.showCounts}
            </button>
          )}
          {!isVsBot && takebackAllowed && (
            <button
              type="button"
              onClick={handleTakeback}
              className="text-accent hover:underline text-sm font-medium"
            >
              {strings.game.takeback}
            </button>
          )}
        </div>
      </div>

      {shareStatus && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-accent text-bg text-sm px-4 py-2 rounded-lg shadow-lg">
          {shareStatus}
        </div>
      )}

      <ScorePanel
        bottomLabel={bottomLabel}
        topLabel={topLabel}
        bottomScore={gameState.board[6]!}
        topScore={gameState.board[13]!}
        currentPlayer={displayCurrentPlayer}
      />

      <div className="h-6 flex items-center justify-center">
        {thinking && (
          <div className="flex items-center gap-2 text-accent text-sm">
            {strings.game.thinking}
            <ThinkingDots />
          </div>
        )}
      </div>

      <div className="h-6 flex items-center justify-center gap-3">
        {isHumanTurn && (
          <button
            type="button"
            onClick={handleHint}
            disabled={hintLoading}
            className="text-xs text-accent/70 hover:text-accent disabled:opacity-40 font-medium"
          >
            {hintLoading ? '...' : strings.game.hint}
          </button>
        )}
      </div>

      <div className="h-4 flex items-center justify-center">
        {isHumanTurn && selectedPit !== null && (
          <span className="text-[10px] text-muted">
            Pit {selectedPit + 1} selected &middot; Press Enter to play
          </span>
        )}
      </div>

      <div className="w-full">
        <Board
          gameState={gameState}
          viewFromBottom={true}
          clickablePits={clickablePits}
          onPitClick={handlePitClick}
          pendingMove={pendingMove}
          prevBoard={prevBoard}
          effectiveSpeed={effectiveSpeed}
          onAnimationComplete={handleAnimationComplete}
          onStoneLanded={handleStoneLanded}
          onCapture={handleCaptureEvent}
          onExtraTurn={handleExtraTurnEvent}
          showPitCounts={showPitCounts || pitCountsVisible}
          accentPit={accentPit}
        />
      </div>

      <div className="h-8 flex items-center justify-center">
        <LiveAnalysisPanel
          evalScore={liveHintEval}
          pv={liveHintPV}
          visible={liveHintVisible && liveHintPit !== null}
        />
      </div>

      <MoveList moves={gameState.moveHistory} />

      {gameState.status === 'finished' && (
        <GameEndOverlay
          gameState={gameState}
          bottomLabel={bottomLabel}
          topLabel={topLabel}
          onNewGame={handleNewGame}
          onReview={handleReview}
          onHome={handleHome}
          onShare={handleShare}
        />
      )}
    </div>
  )
}
