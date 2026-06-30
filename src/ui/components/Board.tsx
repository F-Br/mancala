import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { GameState, Move } from '../../engine'
import { Chip } from './Chip'

interface BoardProps {
  gameState: GameState
  viewFromBottom: boolean
  clickablePits: number[]
  onPitClick: (pitIndex: number) => void
  pendingMove: Move | null
  prevBoard: number[] | null
  effectiveSpeed: number
  onAnimationComplete: () => void
  onStoneLanded?: (stoneIndex: number) => void
  onCapture?: () => void
  onExtraTurn?: () => void
  showPitCounts?: boolean
  accentPit?: number | null
  secondaryAccentPit?: number | null
  secondaryAccentColor?: string
  className?: string
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function getOrganicPositions(
  count: number,
  pitIndex: number,
): { x: number; y: number }[] {
  if (count === 0) return []

  const maxVisible = 12
  const displayCount = Math.min(count, maxVisible)
  const seedBase = pitIndex * 10007 + count * 31337

  const positions: { x: number; y: number }[] = []

  if (displayCount === 1) return [{ x: 0.5, y: 0.5 }]

  const rings: { radius: number; spread: number; capacity: number }[] = [
    { radius: 0, spread: 0.08, capacity: 1 },
    { radius: 0.16, spread: 0.09, capacity: 5 },
    { radius: 0.30, spread: 0.10, capacity: 6 },
  ]

  let placed = 0
  for (const ring of rings) {
    const toPlace = Math.min(ring.capacity, displayCount - placed)
    if (toPlace <= 0) break

    const angleBase = seededRandom(seedBase + ring.radius * 2000 + placed * 73) * Math.PI * 2
    for (let i = 0; i < toPlace; i++) {
      const angle = angleBase + (i / toPlace) * Math.PI * 2 +
        (seededRandom(seedBase + i * 79 + placed * 137) - 0.5) * 0.55
      const r = Math.max(0, ring.radius + (seededRandom(seedBase + i * 731 + placed * 313) - 0.5) * ring.spread * 2)
      positions.push({
        x: Math.max(0.06, Math.min(0.94, 0.5 + Math.cos(angle) * r)),
        y: Math.max(0.06, Math.min(0.94, 0.5 + Math.sin(angle) * r)),
      })
    }
    placed += toPlace
  }

  return positions
}

interface StoneClusterProps {
  count: number
  pitIndex: number
  isStore: boolean
  showPitCounts: boolean
}

const MAX_VISIBLE_STONES = 12

function StoneCluster({
  count,
  pitIndex,
  isStore,
  showPitCounts,
}: StoneClusterProps) {
  if (isStore) {
    return (
      <span
        className={
          'absolute inset-0 flex items-center justify-center z-10 ' +
          'font-display font-semibold text-display-md md:text-display-lg ' +
          'drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)] text-stone pointer-events-none'
        }
      >
        {count}
      </span>
    )
  }

  const visibleCount = Math.min(count, MAX_VISIBLE_STONES)
  const overflow = count > MAX_VISIBLE_STONES

  const positions = useMemo(
    () => getOrganicPositions(visibleCount, pitIndex),
    [visibleCount, pitIndex],
  )

  return (
    <>
      {positions.map((pos, i) => (
        <span
          key={i}
          className="absolute stone-3d w-[9px] h-[9px] md:w-[10px] md:h-[10px]"
          style={{
            left: `${pos.x * 100}%`,
            top: `${pos.y * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}

      {overflow && (
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-10">
          <Chip className="text-[10px] px-1.5 py-0.5">{count}</Chip>
        </div>
      )}

      {showPitCounts && !overflow && (
        <span
          className={
            'absolute bottom-1 right-1.5 z-10 pointer-events-none ' +
            'font-body text-label font-semibold text-muted'
          }
        >
          {count}
        </span>
      )}
    </>
  )
}

function getInterval(speed: number): number {
  if (speed <= 0) return 0
  return Math.max(16, Math.round(300 / speed))
}

function BoardInner({
  gameState,
  viewFromBottom,
  clickablePits,
  onPitClick,
  pendingMove,
  prevBoard,
  effectiveSpeed,
  onAnimationComplete,
  onStoneLanded,
  onCapture,
  onExtraTurn,
  showPitCounts = false,
  accentPit = null,
  secondaryAccentPit = null,
  secondaryAccentColor,
  className = '',
}: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null)

  const [animPhase, setAnimPhase] = useState<'idle' | 'sowing' | 'capture' | 'extraturn' | 'done'>(
    'idle',
  )
  const [stonesLanded, setStonesLanded] = useState(0)
  const [capturePhase, setCapturePhase] = useState(0)
  const [showExtraToast, setShowExtraToast] = useState(false)

  const topRowPits = useMemo(
    () => (viewFromBottom ? [12, 11, 10, 9, 8, 7] : [5, 4, 3, 2, 1, 0]),
    [viewFromBottom],
  )
  const bottomRowPits = useMemo(
    () => (viewFromBottom ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]),
    [viewFromBottom],
  )
  const leftStore = viewFromBottom ? 13 : 6
  const rightStore = viewFromBottom ? 6 : 13

  const ownStore = pendingMove ? (pendingMove.player === 'bottom' ? 6 : 13) : 6

  const displayBoard = useMemo(() => {
    if (!prevBoard || !pendingMove || animPhase === 'idle' || animPhase === 'done')
      return gameState.board
    const d = [...prevBoard]
    const { pitIndex, sowedTo, captured } = pendingMove
    d[pitIndex] = 0
    for (let i = 0; i < stonesLanded; i++) d[sowedTo[i]!]!++
    if (animPhase === 'capture' && capturePhase >= 1 && captured) {
      const lastPos = sowedTo[sowedTo.length - 1]!
      d[captured.fromPit] = 0
      d[lastPos] = 0
      const store = pendingMove.player === 'bottom' ? 6 : 13
      d[store]! += captured.count
    }
    return d
  }, [prevBoard, pendingMove, animPhase, stonesLanded, capturePhase, gameState.board])

  const flyingStoneTarget =
    animPhase === 'sowing' && pendingMove && stonesLanded < pendingMove.sowedTo.length
      ? pendingMove.sowedTo[stonesLanded]!
      : null

  const getCenter = useCallback((pitIndex: number): { x: number; y: number } | null => {
    const boardEl = boardRef.current
    if (!boardEl) return null
    const el = boardEl.querySelector(`[data-el="${pitIndex}"]`) as HTMLElement | null
    if (!el) return null
    const br = boardEl.getBoundingClientRect()
    const pr = el.getBoundingClientRect()
    return {
      x: pr.left - br.left + pr.width / 2,
      y: pr.top - br.top + pr.height / 2,
    }
  }, [])

  const sourceCenter = useMemo(() => {
    if (!pendingMove) return null
    return getCenter(pendingMove.pitIndex)
  }, [pendingMove, getCenter])

  const targetCenter = useMemo(() => {
    if (flyingStoneTarget === null) return null
    return getCenter(flyingStoneTarget)
  }, [flyingStoneTarget, getCenter])

  const captureFromCenter =
    animPhase === 'capture' && capturePhase >= 1 && pendingMove?.captured
      ? getCenter(pendingMove.captured.fromPit)
      : null
  const captureToCenter = animPhase === 'capture' && capturePhase >= 1 ? getCenter(ownStore) : null

  const animating = animPhase !== 'idle' && animPhase !== 'done'

  const onStoneLandedRef = useRef(onStoneLanded)
  onStoneLandedRef.current = onStoneLanded
  const onCaptureRef = useRef(onCapture)
  onCaptureRef.current = onCapture
  const onExtraTurnRef = useRef(onExtraTurn)
  onExtraTurnRef.current = onExtraTurn

  useEffect(() => {
    if (!pendingMove) return
    if (effectiveSpeed === 0) {
      onAnimationComplete()
      return
    }
    setStonesLanded(0)
    setCapturePhase(0)
    setShowExtraToast(false)
    setAnimPhase('sowing')
  }, [pendingMove, effectiveSpeed, onAnimationComplete])

  useEffect(() => {
    if (animPhase !== 'sowing' || !pendingMove) return
    const { sowedTo } = pendingMove
    const interval = getInterval(effectiveSpeed)
    const timer = setInterval(() => {
      setStonesLanded((prev) => {
        const next = prev + 1
        if (next >= sowedTo.length) clearInterval(timer)
        return next
      })
    }, interval)
    return () => clearInterval(timer)
  }, [animPhase, pendingMove, effectiveSpeed])

  useEffect(() => {
    if (animPhase !== 'sowing' || stonesLanded === 0) return
    onStoneLandedRef.current?.(stonesLanded - 1)
  }, [stonesLanded, animPhase])

  useEffect(() => {
    if (animPhase !== 'sowing' || !pendingMove) return
    if (stonesLanded < pendingMove.sowedTo.length) return

    if (pendingMove.captured) {
      onCaptureRef.current?.()
      setAnimPhase('capture')
      const delay = getInterval(effectiveSpeed)
      setTimeout(() => setCapturePhase(1), delay)
    } else if (pendingMove.wasExtraTurn) {
      onExtraTurnRef.current?.()
      setAnimPhase('extraturn')
      setShowExtraToast(true)
      setTimeout(() => {
        setShowExtraToast(false)
        setAnimPhase('done')
      }, 1000)
    } else {
      setAnimPhase('done')
    }
  }, [animPhase, stonesLanded, pendingMove, effectiveSpeed])

  useEffect(() => {
    if (animPhase !== 'capture' || capturePhase < 1) return
    const delay = getInterval(effectiveSpeed)
    const t = setTimeout(() => {
      if (pendingMove?.wasExtraTurn) {
        onExtraTurnRef.current?.()
        setAnimPhase('extraturn')
        setShowExtraToast(true)
        setTimeout(() => {
          setShowExtraToast(false)
          setAnimPhase('done')
        }, 1000)
      } else {
        setAnimPhase('done')
      }
    }, delay)
    return () => clearTimeout(t)
  }, [animPhase, capturePhase, pendingMove, effectiveSpeed])

  useEffect(() => {
    if (animPhase !== 'done') return
    const t = setTimeout(() => {
      setAnimPhase('idle')
      onAnimationComplete()
    }, 80)
    return () => clearTimeout(t)
  }, [animPhase, onAnimationComplete])

  const pitAriaLabel = (pitIndex: number) => {
    const count = displayBoard[pitIndex]!
    const bottomPits = viewFromBottom ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]
    const side = bottomPits.includes(pitIndex) ? 'your' : 'opponent'
    return `Pit ${pitIndex + 1}, ${count} stones, ${side} side`
  }

  const renderPit = useCallback(
    (pitIndex: number) => {
      const clickable = clickablePits.includes(pitIndex) && !animating
      const count = displayBoard[pitIndex]!
      const enabled = clickable && count > 0
      const isAccent = accentPit === pitIndex
      const isSecondary = secondaryAccentPit === pitIndex
      const isBoth = isAccent && isSecondary && secondaryAccentColor != null

      let ringClass = ''
      let ringStyle: React.CSSProperties | undefined
      if (isBoth) {
        ringClass = 'glow-both cursor-default'
        ringStyle = { '--glow-classification-color': secondaryAccentColor } as React.CSSProperties
      } else if (isAccent) {
        ringClass = 'glow-accent cursor-pointer hover:scale-105 active:scale-95 transition-all duration-150'
      } else if (isSecondary && secondaryAccentColor) {
        ringClass = 'glow-classification cursor-default'
        ringStyle = { '--glow-classification-color': secondaryAccentColor } as React.CSSProperties
      } else if (enabled) {
        ringClass = 'cursor-pointer hover:scale-105 hover:glow-accent active:scale-95 transition-all duration-150'
      } else {
        ringClass = 'opacity-60 cursor-default'
      }

      return (
        <button
          key={pitIndex}
          type="button"
          data-el={pitIndex}
          onClick={() => enabled && onPitClick(pitIndex)}
          disabled={!enabled}
          aria-label={pitAriaLabel(pitIndex)}
          className={`relative w-11 h-11 md:w-14 md:h-14 well-pit ${ringClass}`}
          style={ringStyle}
        >
          <StoneCluster
            count={count}
            pitIndex={pitIndex}
            isStore={false}
            showPitCounts={showPitCounts}
          />
        </button>
      )
    },
    [
      clickablePits,
      animating,
      displayBoard,
      onPitClick,
      showPitCounts,
      accentPit,
      secondaryAccentPit,
      secondaryAccentColor,
    ],
  )

  const renderStore = (storeIndex: number, accent: boolean) => (
    <div
      key={`store-${storeIndex}`}
      data-el={storeIndex}
      className={
        'relative well-store ' +
        'h-[72px] w-full md:h-32 md:w-[60px] ' +
        (accent ? 'border-2 border-accent' : '')
      }
    >
      <StoneCluster
        count={displayBoard[storeIndex]!}
        pitIndex={100 + storeIndex}
        isStore
        showPitCounts={showPitCounts}
      />
    </div>
  )

  const flyingStoneSize = effectiveSpeed > 0
    ? 'w-[9px] h-[9px] md:w-[10px] md:h-[10px]'
    : 'w-[8px] h-[8px] md:w-[9px] md:h-[9px]'

  const flyingOffset = 5

  return (
    <div
      ref={boardRef}
      className={`relative w-full max-w-xl mx-auto ${className}`}
    >
      <div className="board-slab flex items-center justify-center p-3 md:p-4">
        <div className="flex flex-col md:flex-row items-center gap-2 md:gap-3 w-full">
          {renderStore(leftStore, animPhase !== 'idle' && leftStore === ownStore)}

          <div className="flex flex-col gap-2 md:gap-3 flex-1 w-full">
            <div className="flex gap-1.5 md:gap-2 justify-center">
              {topRowPits.map(renderPit)}
            </div>
            <div className="flex gap-1.5 md:gap-2 justify-center">
              {bottomRowPits.map(renderPit)}
            </div>
          </div>

          {renderStore(rightStore, animPhase !== 'idle' && rightStore === ownStore)}
        </div>
      </div>

      {sourceCenter && targetCenter && animPhase === 'sowing' && (
        <motion.div
          className={'absolute z-20 stone-3d ' + flyingStoneSize}
          style={{
            left: sourceCenter.x - flyingOffset,
            top: sourceCenter.y - flyingOffset,
          }}
          animate={{
            left: targetCenter.x - flyingOffset,
            top: targetCenter.y - flyingOffset,
          }}
          transition={{
            duration: getInterval(effectiveSpeed) / 1000,
            ease: [0.4, 0, 0.2, 1],
          }}
        />
      )}

      {animPhase === 'capture' && capturePhase >= 1 && captureFromCenter && captureToCenter && (
        <motion.div
          className={
            'absolute z-20 rounded-full bg-accent shadow-md ' +
            (effectiveSpeed > 0 ? 'w-[12px] h-[12px] md:w-[14px] md:h-[14px]' : 'w-[10px] h-[10px] md:w-[12px] md:h-[12px]')
          }
          style={{
            left: captureFromCenter.x - 7,
            top: captureFromCenter.y - 7,
          }}
          animate={{
            left: captureToCenter.x - 7,
            top: captureToCenter.y - 7,
          }}
          transition={{
            duration: getInterval(effectiveSpeed) / 1000,
            ease: [0.4, 0, 0.2, 1],
          }}
        />
      )}

      {showExtraToast && (
        <motion.div
          className="absolute top-1/2 left-1/2 z-30 -translate-x-1/2 -translate-y-1/2
                     bg-accent text-bg text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.2 }}
        >
          Extra Turn
        </motion.div>
      )}
    </div>
  )
}

export const Board = memo(BoardInner)
