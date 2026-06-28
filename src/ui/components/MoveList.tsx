import { moveToNotation } from '../../engine'
import type { Move } from '../../engine'

interface MoveListProps {
  moves: Move[]
}

export function MoveList({ moves }: MoveListProps) {
  if (moves.length === 0) return null

  return (
    <div className="w-full max-w-xl mx-auto mt-4" aria-live="polite">
      <h3 className="text-sm text-muted mb-1 font-medium">Moves</h3>
      <div className="flex flex-wrap gap-1">
        {moves.map((move, i) => (
          <span
            key={i}
            className={
              'text-xs px-2 py-0.5 rounded ' +
              (move.player === 'bottom'
                ? 'bg-accent/10 text-accent'
                : 'bg-accent/5 text-muted')
            }
          >
            {i + 1}.{moveToNotation(move)}
          </span>
        ))}
      </div>
    </div>
  )
}
