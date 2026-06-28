import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { legalMoves } from '../../engine'
import type { GameState as EngineGameState, Move, Side } from '../../engine'
import { requestBotMove, terminateBotWorker } from '../../bots/client'
import type { BotMoveHandle } from '../../bots/client'
import { useGameStore } from '../../state/gameStore'
import { useModeStore } from '../../state/modeStore'
import { useSettingsStore } from '../../state/settingsStore'
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

  const boardFlip = useSettingsStore((s) => s.boardFlip)
  const animationSpeed = useSettingsStore((s) => s.animationSpeed)
  const soundEnabled = useSettingsStore((s) => s.soundEnabled)
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled)

  const prefersReducedMotion = usePrefersReducedMotion()
  const effectiveSpeed = prefersReducedMotion ? 0 : animationSpeed

  const [thinking, setThinking] = useState(false)
  const [passToShown, setPassToShown] = useState(false)
  const [pendingMove, setPendingMove] = useState<Move | null>(null)
  const [prevBoard, setPrevBoard] = useState<number[] | null>(null)
  const [boardLocked, setBoardLocked] = useState(false)

  const botRequestRef = useRef<BotMoveHandle | null>(null)
  const botInFlight = useRef(false)
  const initDone = useRef(false)

  const isVsBot = mode === 'vs-bot'

  const humanSide: Side | null = isVsBot
    ? playerSide === 'random'
      ? 'bottom'
      : playerSide
    : null

  const viewFromBottom = isVsBot
    ? humanSide === 'bottom'
    : boardFlip
      ? gameState?.currentPlayer === 'bottom'
      : true

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

        const lastMove =
          newState.moveHistory[newState.moveHistory.length - 1]
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
    } else if (!isVsBot && boardFlip) {
      const lastMove =
        newState.moveHistory[newState.moveHistory.length - 1]
      if (lastMove && lastMove.player !== newState.currentPlayer) {
        setPassToShown(true)
        setTimeout(() => setPassToShown(false), 1200)
      }
    }
  }, [
    isVsBot,
    humanSide,
    doBotMove,
    boardFlip,
    pendingMove,
    soundEnabled,
    hapticsEnabled,
  ])

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
    cancelBot()
    takeback()
  }, [cancelBot, takeback])

  const handleNewGame = useCallback(() => {
    cancelBot()
    setBoardLocked(false)
    setPendingMove(null)
    setPrevBoard(null)
    const fp = humanSide ?? 'bottom'
    reset(fp)
    if (mode) setSavedMeta({ mode, botLevel, playerSide })
  }, [cancelBot, reset, humanSide, mode, botLevel, playerSide, setSavedMeta])

  const handleHome = useCallback(() => {
    cancelBot()
    terminateBotWorker()
    clear()
    useModeStore.getState().setMode(null)
    navigate('/home')
  }, [cancelBot, clear, navigate])

  const handleReview = useCallback(() => {
    navigate('/analysis')
  }, [navigate])

  const takebackAllowed = useMemo(
    () =>
      gameState !== null &&
      gameState.moveHistory.length > 0 &&
      gameState.status === 'in-progress' &&
      !boardLocked,
    [gameState, boardLocked],
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
    return () => {
      cancelBot()
    }
  }, [cancelBot])

  if (!mode && !gameState) return <Navigate to="/home" replace />
  if (!gameState) return null

  return (
    <div className="min-h-screen p-3 md:p-4 flex flex-col items-center gap-3 max-w-4xl mx-auto relative">
      <div className="flex items-center justify-between w-full max-w-xl mx-auto">
        <button
          type="button"
          onClick={handleHome}
          className="text-accent hover:underline text-sm"
        >
          &larr; {strings.game.home}
        </button>
        {!isVsBot && takebackAllowed && (
          <button
            type="button"
            onClick={handleTakeback}
            className="text-accent hover:underline text-sm"
          >
            {strings.game.takeback}
          </button>
        )}
        {isVsBot && <div className="text-sm" />}
      </div>

      <ScorePanel
        bottomLabel={bottomLabel}
        topLabel={topLabel}
        bottomScore={gameState.board[6]!}
        topScore={gameState.board[13]!}
        currentPlayer={gameState.currentPlayer}
        viewFromBottom={viewFromBottom}
      />

      {thinking && (
        <div className="flex items-center gap-2 text-accent text-sm">
          {strings.game.thinking}
          <ThinkingDots />
        </div>
      )}

      {passToShown && !isVsBot && (
        <div className="text-accent text-sm font-medium">
          {strings.game.passTo}{' '}
          {gameState.currentPlayer === 'bottom'
            ? bottomLabel
            : topLabel}
        </div>
      )}

      <Board
        gameState={gameState}
        viewFromBottom={viewFromBottom}
        clickablePits={clickablePits}
        onPitClick={handlePitClick}
        pendingMove={pendingMove}
        prevBoard={prevBoard}
        effectiveSpeed={effectiveSpeed}
        onAnimationComplete={handleAnimationComplete}
        onStoneLanded={handleStoneLanded}
        onCapture={handleCaptureEvent}
        onExtraTurn={handleExtraTurnEvent}
      />

      <MoveList moves={gameState.moveHistory} />

      {gameState.status === 'finished' && (
        <GameEndOverlay
          gameState={gameState}
          bottomLabel={bottomLabel}
          topLabel={topLabel}
          onNewGame={handleNewGame}
          onReview={handleReview}
          onHome={handleHome}
        />
      )}
    </div>
  )
}
