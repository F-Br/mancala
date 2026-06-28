import type { GameState } from '../../engine'
import { strings } from '../strings'

interface GameEndOverlayProps {
  gameState: GameState
  bottomLabel: string
  topLabel: string
  onNewGame: () => void
  onReview: () => void
  onHome: () => void
}

export function GameEndOverlay({
  gameState,
  bottomLabel,
  topLabel,
  onNewGame,
  onReview,
  onHome,
}: GameEndOverlayProps) {
  const { winner, board } = gameState

  const resultText =
    winner === null
      ? strings.game.gameOver
      : winner === 'draw'
        ? strings.game.draw
        : strings.game.winner(
            winner === 'bottom' ? bottomLabel : topLabel,
          )

  const finalScore = `${bottomLabel}: ${board[6]!}  \u2014  ${topLabel}: ${board[13]!}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-board rounded-2xl p-6 mx-4 max-w-sm w-full flex flex-col items-center gap-4 shadow-2xl">
        <h2 className="text-2xl font-bold text-text">{resultText}</h2>
        <p className="text-lg text-muted">{finalScore}</p>
        <div className="flex flex-col gap-2 w-full">
          <button
            type="button"
            onClick={onNewGame}
            className="w-full py-2 rounded-xl bg-accent text-bg font-semibold hover:brightness-110"
          >
            {strings.game.newGame}
          </button>
          <button
            type="button"
            onClick={onReview}
            className="w-full py-2 rounded-xl border border-accent text-accent font-semibold hover:bg-accent/10"
          >
            {strings.game.reviewGame}
          </button>
          <button
            type="button"
            onClick={onHome}
            className="w-full py-2 rounded-xl text-muted font-semibold hover:text-text"
          >
            {strings.game.home}
          </button>
        </div>
      </div>
    </div>
  )
}
