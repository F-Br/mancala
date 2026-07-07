import type { GameState } from '../../engine'
import { strings } from '../strings'
import { Button } from './Button'

interface GameEndOverlayProps {
  gameState: GameState
  bottomLabel: string
  topLabel: string
  onNewGame: () => void
  onReview: () => void
  onHome: () => void
  onShare?: () => void
}

function resultColor(winner: 'bottom' | 'top' | 'draw' | null, bottomLabel: string): string {
  if (winner === 'draw') return 'text-muted'
  const youWin = (winner === 'bottom' && bottomLabel === strings.game.you) ||
    (winner === 'top' && bottomLabel !== strings.game.you)
  if (youWin) return 'text-win'
  // #C0392B at display size passes WCAG's large-text 3:1 threshold on the dark surfaces, so no lighter variant is needed
  return 'text-loss'
}

export function GameEndOverlay({
  gameState,
  bottomLabel,
  topLabel,
  onNewGame,
  onReview,
  onHome,
  onShare,
}: GameEndOverlayProps) {
  const { winner, board } = gameState

  const resultText =
    winner === null
      ? strings.game.gameOver
      : winner === 'draw'
        ? strings.game.draw
        : strings.game.winner(winner === 'bottom' ? bottomLabel : topLabel)

  const finalScore = `${board[6]!}  \u2014  ${board[13]!}`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-md border border-border p-6 flex flex-col items-center gap-5"
        aria-live="assertive"
        style={{
          background: `linear-gradient(180deg, color-mix(in srgb, var(--theme-surface) 94%, white) 0%, var(--theme-surface) 100%)`,
          boxShadow: `var(--theme-shadow-card), inset 0 1px 0 0 var(--theme-highlight)`,
        }}
      >
        <h2
          className={`font-display text-display-lg font-bold text-center ${resultColor(winner, bottomLabel)}`}
        >
          {resultText}
        </h2>

        <p className="font-display text-display-md font-semibold text-text">
          {bottomLabel} {finalScore} {topLabel}
        </p>

        <div className="flex flex-col gap-2 w-full">
          <Button variant="primary" onClick={onNewGame} className="w-full">
            {strings.game.newGame}
          </Button>
          <Button variant="secondary" onClick={onReview} className="w-full">
            {strings.game.reviewGame}
          </Button>
          {onShare && (
            <Button variant="ghost" onClick={onShare} className="w-full">
              {strings.game.shareGame}
            </Button>
          )}
          <Button variant="ghost" onClick={onHome} className="w-full">
            {strings.game.home}
          </Button>
        </div>
      </div>
    </div>
  )
}
