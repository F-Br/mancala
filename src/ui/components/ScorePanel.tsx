interface ScorePanelProps {
  bottomLabel: string
  topLabel: string
  bottomScore: number
  topScore: number
  currentPlayer: 'bottom' | 'top'
  thinking?: boolean
}

export function ScorePanel({
  bottomLabel,
  topLabel,
  bottomScore,
  topScore,
  currentPlayer,
  thinking,
}: ScorePanelProps) {
  const isBottomTurn = currentPlayer === 'bottom'

  return (
    <div className="flex items-center justify-between w-full select-none">
      <div
        className={
          'flex flex-col items-center min-w-0 ' +
          (isBottomTurn ? 'text-accent' : 'text-muted')
        }
      >
        <span className="text-label uppercase tracking-label font-semibold truncate max-w-[80px]">
          {bottomLabel}
        </span>
        <span className="font-display text-display-lg font-bold leading-none">
          {bottomScore}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-accent shrink-0 px-2">
        {thinking ? (
          <span className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{ animationDelay: '0.2s' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{ animationDelay: '0.4s' }} />
          </span>
        ) : (
          <span className="text-lg leading-none">
            {isBottomTurn ? '\u25B8' : '\u25C2'}
          </span>
        )}
      </div>

      <div
        className={
          'flex flex-col items-center min-w-0 ' +
          (!isBottomTurn ? 'text-accent' : 'text-muted')
        }
      >
        <span className="text-label uppercase tracking-label font-semibold truncate max-w-[80px]">
          {topLabel}
        </span>
        <span className="font-display text-display-lg font-bold leading-none">
          {topScore}
        </span>
      </div>
    </div>
  )
}
