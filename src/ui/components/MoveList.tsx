import { moveToNotation } from '../../engine'
import type { Move } from '../../engine'
import { Chip } from './Chip'

interface MoveListProps {
  moves: Move[]
  className?: string
}

export function MoveList({ moves, className = '' }: MoveListProps) {
  if (moves.length === 0) return null

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`} aria-live="polite">
      {moves.map((move, i) => (
        <Chip
          key={i}
          className={
            move.player === 'bottom' ? '' : 'opacity-70'
          }
        >
          {i + 1}.{moveToNotation(move)}
        </Chip>
      ))}
    </div>
  )
}
