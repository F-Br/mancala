import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { legalMoves } from '../../engine'
import type { GameState as EngineGameState, Side } from '../../engine'
import { requestBotMove, terminateBotWorker } from '../../bots/client'
import type { BotMoveHandle } from '../../bots/client'
import { useGameStore } from '../../state/gameStore'
import { useModeStore } from '../../state/modeStore'
import { useSettingsStore } from '../../state/settingsStore'
import { Board } from '../components/Board'
import { ScorePanel } from '../components/ScorePanel'
import { MoveList } from '../components/MoveList'
import { GameEndOverlay } from '../components/GameEndOverlay'
import { strings } from '../strings'

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

  const [thinking, setThinking] = useState(false)
  const [passToShown, setPassToShown] = useState(false)
  const [botTrigger, setBotTrigger] = useState(0)
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
    return legalMoves(gameState)
  }, [gameState, isVsBot, humanSide])

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
        makeMove(result.pitIndex)
      } catch {
        // bot move cancelled or errored
      }
      botInFlight.current = false
      setThinking(false)
      setBotTrigger((n) => n + 1)
    },
    [botLevel, makeMove],
  )

  const handlePitClick = useCallback(
    (pitIndex: number) => {
      if (thinking || botInFlight.current) return
      makeMove(pitIndex)
      if (isVsBot) {
        const newState = useGameStore.getState().gameState
        if (
          newState &&
          newState.status === 'in-progress' &&
          newState.currentPlayer !== humanSide
        ) {
          doBotMove(newState)
        }
      } else if (boardFlip) {
        const newState = useGameStore.getState().gameState
        if (newState && newState.moveHistory.length > 0) {
          const lastMove =
            newState.moveHistory[newState.moveHistory.length - 1]
          if (lastMove && lastMove.player !== newState.currentPlayer) {
            setPassToShown(true)
            setTimeout(() => setPassToShown(false), 1200)
          }
        }
      }
    },
    [makeMove, thinking, isVsBot, humanSide, doBotMove, boardFlip],
  )

  const handleTakeback = useCallback(() => {
    cancelBot()
    takeback()
  }, [cancelBot, takeback])

  const handleNewGame = useCallback(() => {
    cancelBot()
    const fp = humanSide ?? 'bottom'
    reset(fp)
    if (mode) {
      setSavedMeta({ mode, botLevel, playerSide })
    }
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
      gameState.status === 'in-progress',
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

  // Initialize game on mount
  useEffect(() => {
    if (initDone.current) return
    initDone.current = true

    const gs = useGameStore.getState()
    if (gs.gameState && gs.savedMeta) {
      // Resume saved game
      useModeStore.getState().setMode(gs.savedMeta.mode)
      useModeStore.getState().setBotLevel(gs.savedMeta.botLevel)
      if (gs.savedMeta.mode === 'vs-bot') {
        useModeStore.getState().setPlayerSide(gs.savedMeta.playerSide)
      }
    } else if (!gs.gameState && mode) {
      // Start new game
      reset()
      setSavedMeta({ mode, botLevel, playerSide })
    }
  }, [mode, botLevel, playerSide, reset, setSavedMeta])

  // Trigger bot move when it's bot's turn
  useEffect(() => {
    if (!gameState || !isVsBot) return
    if (gameState.status !== 'in-progress') return
    if (gameState.currentPlayer === humanSide) return
    if (botInFlight.current) return

    doBotMove(gameState)
  }, [botTrigger, gameState, isVsBot, humanSide, doBotMove])

  // Cleanup on unmount
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
        <div className="text-accent text-sm animate-pulse">
          {strings.game.thinking}
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
