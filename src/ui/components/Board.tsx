import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { GameState, Move } from '../../engine'
import type { StonePattern } from '../../state/settingsStore'

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
  stonePattern?: StonePattern
  showPitCounts?: boolean
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function getJitteredPositions(
  count: number,
  pitIndex: number,
): { x: number; y: number }[] {
  if (count === 0) return []
  if (count === 1) return [{ x: 0.5, y: 0.5 }]
  if (count === 2) {
    const s = pitIndex * 73 + 7
    const spread = 0.2 + seededRandom(s) * 0.15
    return [
      { x: 0.5 - spread, y: 0.5 },
      { x: 0.5 + spread, y: 0.5 },
    ]
  }

  const positions: { x: number; y: number }[] = []
  const cols = Math.max(2, Math.ceil(Math.sqrt(count)))
  const rows = Math.ceil(count / cols)

  for (let i = 0; i < count; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const seed = pitIndex * 1000 + i * 137 + count * 53 + 7
    const jx = (seededRandom(seed) - 0.5) * 0.9
    const jy = (seededRandom(seed + 1) - 0.5) * 0.9
    const cx = (col + 0.5 + jx) / cols
    const cy = (row + 0.5 + jy) / rows
    positions.push({
      x: Math.max(0.06, Math.min(0.94, cx)),
      y: Math.max(0.06, Math.min(0.94, cy)),
    })
  }
  return positions
}

function getSymmetricPositions(count: number): { x: number; y: number }[] {
  if (count === 0) return []

  const ringLayouts: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]],
    2: [[0.3, 0.5], [0.7, 0.5]],
    3: [[0.5, 0.25], [0.25, 0.65], [0.75, 0.65]],
    4: [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]],
    5: [[0.5, 0.5], [0.35, 0.2], [0.65, 0.2], [0.35, 0.8], [0.65, 0.8]],
    6: [[0.25, 0.3], [0.75, 0.3], [0.25, 0.7], [0.75, 0.7], [0.5, 0.15], [0.5, 0.85]],
    7: [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75], [0.5, 0.1], [0.5, 0.9]],
    8: [[0.2, 0.2], [0.5, 0.2], [0.8, 0.2], [0.2, 0.5], [0.8, 0.5], [0.2, 0.8], [0.5, 0.8], [0.8, 0.8]],
    9: [[0.5, 0.5], [0.2, 0.2], [0.5, 0.2], [0.8, 0.2], [0.2, 0.5], [0.8, 0.5], [0.2, 0.8], [0.5, 0.8], [0.8, 0.8]],
  }

  const predefined = ringLayouts[count]
  if (predefined) return predefined.map(([x, y]) => ({ x, y }))

  const positions: { x: number; y: number }[] = []
  let remaining = count

  if (remaining % 2 === 1) {
    positions.push({ x: 0.5, y: 0.5 })
    remaining--
  }

  let ring = 1
  while (remaining > 0) {
    const slots = ring * 4
    const toPlace = Math.min(remaining, slots)
    const step = (Math.PI * 2) / toPlace
    const radius = ring * 0.17
    const offset = (ring % 2) * step * 0.5

    for (let i = 0; i < toPlace; i++) {
      positions.push({
        x: 0.5 + Math.cos(i * step + offset) * radius,
        y: 0.5 + Math.sin(i * step + offset) * radius,
      })
    }
    remaining -= toPlace
    ring++
  }

  return positions
}

function getStonePositions(
  count: number,
  pitIndex: number,
  pattern: StonePattern,
): { x: number; y: number }[] {
  if (pattern === 'symmetric') return getSymmetricPositions(count)
  return getJitteredPositions(count, pitIndex)
}

function StoneCircles({
  count,
  pitIndex,
  pattern,
  mirror,
  className,
}: {
  count: number
  pitIndex: number
  pattern: StonePattern
  mirror: boolean
  className?: string
}) {
  const positions = useMemo(
    () => getStonePositions(count, pitIndex, pattern),
    [count, pitIndex, pattern],
  )
  return (
    <>
      {positions.map((pos, i) => {
        const x = mirror ? 1 - pos.x : pos.x
        const y = mirror ? 1 - pos.y : pos.y
        return (
          <span
            key={i}
            className={
              'absolute w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ' +
              (className ?? 'bg-stone')
            }
            style={{
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              transform: 'translate(-50%, -50%)',
            }}
          />
        )
      })}
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
  stonePattern = 'random',
  showPitCounts = false,
}: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null)

  const [animPhase, setAnimPhase] = useState<
    'idle' | 'sowing' | 'capture' | 'extraturn' | 'done'
  >('idle')
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

  const ownStore = pendingMove
    ? pendingMove.player === 'bottom'
      ? 6
      : 13
    : 6

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
    animPhase === 'sowing' &&
    pendingMove &&
    stonesLanded < pendingMove.sowedTo.length
      ? pendingMove.sowedTo[stonesLanded]!
      : null

  const getCenter = useCallback(
    (pitIndex: number): { x: number; y: number } | null => {
      const boardEl = boardRef.current
      if (!boardEl) return null
      const el = boardEl.querySelector(
        `[data-el="${pitIndex}"]`,
      ) as HTMLElement | null
      if (!el) return null
      const br = boardEl.getBoundingClientRect()
      const pr = el.getBoundingClientRect()
      return {
        x: pr.left - br.left + pr.width / 2,
        y: pr.top - br.top + pr.height / 2,
      }
    },
    [],
  )

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
  const captureToCenter =
    animPhase === 'capture' && capturePhase >= 1
      ? getCenter(ownStore)
      : null

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

  const mirrored = !viewFromBottom

  const renderPit = useCallback(
    (pitIndex: number) => {
      const clickable = clickablePits.includes(pitIndex) && !animating
      const count = displayBoard[pitIndex]!
      const enabled = clickable && count > 0
      return (
        <button
          key={pitIndex}
          type="button"
          data-el={pitIndex}
          onClick={() => enabled && onPitClick(pitIndex)}
          disabled={!enabled}
          className={
            'relative w-11 h-11 md:w-14 md:h-14 rounded-xl overflow-hidden border-2 ' +
            (enabled
              ? 'bg-pit border-board cursor-pointer hover:scale-105 hover:ring-2 hover:ring-accent active:scale-95 transition-all'
              : 'bg-pit/50 border-board/50 cursor-default')
          }
        >
          <StoneCircles
            count={count}
            pitIndex={pitIndex}
            pattern={stonePattern}
            mirror={mirrored}
          />
          {showPitCounts && (
            <span
              className="absolute bottom-0.5 right-1 text-[9px] md:text-[10px] font-bold text-stone/80 leading-none pointer-events-none"
              style={mirrored ? { transform: 'rotate(180deg)' } : undefined}
            >
              {count}
            </span>
          )}
        </button>
      )
    },
    [clickablePits, animating, displayBoard, onPitClick, stonePattern, showPitCounts, mirrored],
  )

  const renderStore = (storeIndex: number, accent: boolean) => (
    <div
      key={`store-${storeIndex}`}
      data-el={storeIndex}
      className={
        'relative flex items-center justify-center bg-pit rounded-xl border-2 overflow-hidden ' +
        'h-16 w-full md:h-32 md:w-16 ' +
        (accent ? 'border-accent' : 'border-board')
      }
    >
      <StoneCircles
        count={displayBoard[storeIndex]!}
        pitIndex={100 + storeIndex}
        pattern={stonePattern}
        mirror={mirrored}
        className="bg-stone/70"
      />
      <span
        className="relative z-10 text-lg md:text-2xl font-bold drop-shadow-md"
        style={mirrored ? { transform: 'rotate(180deg)' } : undefined}
      >
        {displayBoard[storeIndex]}
      </span>
    </div>
  )

  const stoneSize = effectiveSpeed > 0 ? 'w-2.5 h-2.5 md:w-3 md:h-3' : 'w-2 h-2 md:w-2.5 md:h-2.5'

  return (
    <div
      ref={boardRef}
      className="flex flex-col md:flex-row items-center gap-2 w-full max-w-xl mx-auto relative"
    >
      {sourceCenter && targetCenter && animPhase === 'sowing' && (
        <motion.div
          className={'absolute z-20 rounded-full bg-stone shadow-sm ' + stoneSize}
          style={{ left: sourceCenter.x - 6, top: sourceCenter.y - 6 }}
          animate={{
            left: targetCenter.x - 6,
            top: targetCenter.y - 6,
          }}
          transition={{
            duration: getInterval(effectiveSpeed) / 1000,
            ease: [0.4, 0, 0.2, 1],
          }}
        />
      )}

      {animPhase === 'capture' &&
        capturePhase >= 1 &&
        captureFromCenter &&
        captureToCenter && (
          <motion.div
            className={
              'absolute z-20 rounded-full bg-accent shadow-md ' +
              (effectiveSpeed > 0 ? 'w-3 h-3 md:w-3.5 md:h-3.5' : 'w-2.5 h-2.5 md:w-3 md:h-3')
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

      {renderStore(leftStore, animPhase !== 'idle' && leftStore === ownStore)}

      <div className="flex flex-col gap-2 flex-1 w-full">
        <div className="flex gap-1.5 md:gap-2 justify-center">
          {topRowPits.map(renderPit)}
        </div>
        <div className="flex gap-1.5 md:gap-2 justify-center">
          {bottomRowPits.map(renderPit)}
        </div>
      </div>

      {renderStore(rightStore, animPhase !== 'idle' && rightStore === ownStore)}
    </div>
  )
}

export const Board = memo(BoardInner)
