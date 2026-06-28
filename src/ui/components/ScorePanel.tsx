import type { Side } from '../../engine'

interface ScorePanelProps {
  bottomLabel: string
  topLabel: string
  bottomScore: number
  topScore: number
  currentPlayer: Side
  viewFromBottom: boolean
}

export function ScorePanel({
  bottomLabel,
  topLabel,
  bottomScore,
  topScore,
  currentPlayer,
  viewFromBottom,
}: ScorePanelProps) {
  const activeSide: Side = viewFromBottom ? 'bottom' : 'top'
  const isBottomActive = currentPlayer === activeSide

  return (
    <div className="flex items-center justify-between w-full max-w-xl mx-auto mb-2">
      <div
        className={
          'flex flex-col items-center px-4 py-2 rounded-lg ' +
          (isBottomActive ? 'bg-accent/20 text-accent' : 'text-muted')
        }
      >
        <span className="text-sm font-medium">{bottomLabel}</span>
        <span className="text-2xl font-bold">{bottomScore}</span>
      </div>

      <div className="text-xs text-muted px-2">
        {currentPlayer === (viewFromBottom ? 'bottom' : 'top')
          ? '\u25B6'
          : '\u25C0'}
      </div>

      <div
        className={
          'flex flex-col items-center px-4 py-2 rounded-lg ' +
          (!isBottomActive ? 'bg-accent/20 text-accent' : 'text-muted')
        }
      >
        <span className="text-sm font-medium">{topLabel}</span>
        <span className="text-2xl font-bold">{topScore}</span>
      </div>
    </div>
  )
}
