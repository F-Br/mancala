import { motion } from 'framer-motion'
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
  const displayLabel = viewFromBottom ? bottomLabel : topLabel
  const displayScore = viewFromBottom ? bottomScore : topScore
  const oppLabel = viewFromBottom ? topLabel : bottomLabel
  const oppScore = viewFromBottom ? topScore : bottomScore

  const isDisplayActive = currentPlayer === (viewFromBottom ? 'bottom' : 'top')

  return (
    <div className="flex items-center justify-between w-full max-w-xl mx-auto mb-2">
      <motion.div
        animate={isDisplayActive ? { scale: [1, 1.05, 1] } : { scale: 1 }}
        transition={
          isDisplayActive ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }
        }
        className={
          'flex flex-col items-center px-4 py-2 rounded-lg ' +
          (isDisplayActive ? 'bg-accent/20 text-accent' : 'text-muted')
        }
      >
        <span className="text-sm font-medium">{displayLabel}</span>
        <span className="text-2xl font-bold">{displayScore}</span>
      </motion.div>

      <div className="text-xs text-muted px-2">
        {currentPlayer === (viewFromBottom ? 'bottom' : 'top') ? '\u25B6' : '\u25C0'}
      </div>

      <motion.div
        animate={!isDisplayActive ? { scale: [1, 1.05, 1] } : { scale: 1 }}
        transition={
          !isDisplayActive
            ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0 }
        }
        className={
          'flex flex-col items-center px-4 py-2 rounded-lg ' +
          (!isDisplayActive ? 'bg-accent/20 text-accent' : 'text-muted')
        }
      >
        <span className="text-sm font-medium">{oppLabel}</span>
        <span className="text-2xl font-bold">{oppScore}</span>
      </motion.div>
    </div>
  )
}
