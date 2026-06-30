import { useState, useMemo } from 'react'

export interface EvalGraphPoint {
  index: number
  eval: number
  moveNumber: number
}

interface EvalGraphProps {
  points: EvalGraphPoint[]
  currentIndex?: number
  onSelectIndex?: (index: number) => void
  sparkline?: boolean
  height?: number
  width?: number
  topLabel?: string
  bottomLabel?: string
}

function toFixed1(n: number): string {
  const s = n.toFixed(1)
  return n > 0 ? `+${s}` : s
}

export function EvalGraph({
  points,
  currentIndex,
  onSelectIndex,
  sparkline = false,
  height = 260,
  width: widthProp,
  topLabel,
  bottomLabel,
}: EvalGraphProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const valid = points.filter((d) => isFinite(d.eval))

  const {
    viewWidth,
    viewHeight,
    padding,
    innerH,
    toX,
    toY,
    zeroY,
    maxAbsEval,
    areaSegments,
    linePath,
  } = useMemo(() => {
    if (valid.length < 2) {
      return {
        viewWidth: widthProp ?? 400,
        viewHeight: height,
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
        innerW: 0,
        innerH: 0,
        toX: (_x: number) => 0,
        toY: (_e: number) => 0,
        zeroY: 0,
        maxAbsEval: 1,
        areaSegments: [] as { path: string; positive: boolean }[],
        linePath: '',
      }
    }

    if (sparkline) {
      const w = widthProp ?? 400
      const h = height
      const innerWidth = w
      const innerHeight = h

      const absMax = Math.max(0.01, ...valid.map((d) => Math.abs(d.eval)))
      const yR = absMax * 1.15

      const xScale = (x: number) => (x / Math.max(1, valid.length - 1)) * innerWidth
      const yScale = (e: number) => innerHeight / 2 - (e / yR) * (innerHeight / 2)
      const zY = innerHeight / 2

      const lp = valid.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.index)} ${yScale(d.eval)}`).join(' ')

      const segs = buildAreaSegments(valid, xScale, yScale, zY)

      return {
        viewWidth: w,
        viewHeight: h,
        padding: { left: 0, right: 0, top: 0, bottom: 0 },
        innerW: innerWidth,
        innerH: innerHeight,
        toX: xScale,
        toY: yScale,
        zeroY: zY,
        maxAbsEval: absMax,
        areaSegments: segs,
        linePath: lp,
      }
    }

    const pad = { left: 48, right: 16, top: 24, bottom: 40 }
    const w = widthProp ?? 620
    const h = height
    const iW = w - pad.left - pad.right
    const iH = h - pad.top - pad.bottom

    const absMax = Math.max(1, ...valid.map((d) => Math.abs(d.eval)))
    const yR = absMax * 1.2

    const xScale = (x: number) => pad.left + (x / Math.max(1, valid.length - 1)) * iW
    const yScale = (e: number) => pad.top + iH / 2 - (e / yR) * (iH / 2)
    const zY = yScale(0)

    const lp = valid.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.index)} ${yScale(d.eval)}`).join(' ')

    const segs = buildAreaSegments(valid, xScale, yScale, zY)

    return {
      viewWidth: w,
      viewHeight: h,
      padding: pad,
      innerW: iW,
      innerH: iH,
      toX: xScale,
      toY: yScale,
      zeroY: zY,
      maxAbsEval: absMax,
      areaSegments: segs,
      linePath: lp,
    }
  }, [valid, height, widthProp, sparkline])

  if (valid.length < 2) return null

  const handlePointClick = (idx: number) => {
    onSelectIndex?.(idx)
  }

  const handlePointerEnter = (idx: number) => {
    setHoveredIndex(idx)
  }

  const handlePointerLeave = () => {
    setHoveredIndex(null)
  }

  const interactive = !sparkline && !!onSelectIndex

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        className="w-full"
        style={{ height: sparkline ? height : undefined }}
        preserveAspectRatio={sparkline ? 'none' : 'xMidYMid meet'}
      >
        {!sparkline && (
          <>
            {/* Y-axis labels */}
            <text x={6} y={padding.top + 12} className="text-[9px] fill-muted">
              +{Math.round(maxAbsEval)}
            </text>
            <text x={6} y={zeroY + 4} className="text-[9px] fill-muted">
              0
            </text>
            <text x={6} y={viewHeight - padding.bottom + 8} className="text-[9px] fill-muted">
              -{Math.round(maxAbsEval)}
            </text>

            {/* Player advantage labels */}
            {topLabel && (
              <text
                x={padding.left - 4}
                y={padding.top - 4}
                className="text-[9px] fill-muted"
                textAnchor="end"
              >
                {topLabel}
              </text>
            )}
            {bottomLabel && (
              <text
                x={padding.left - 4}
                y={viewHeight - padding.bottom + 14}
                className="text-[9px] fill-muted"
                textAnchor="end"
              >
                {bottomLabel}
              </text>
            )}

            {/* Zero reference line */}
            <line
              x1={padding.left}
              y1={zeroY}
              x2={viewWidth - padding.right}
              y2={zeroY}
              stroke="currentColor"
              strokeOpacity={0.12}
              strokeWidth={1}
              strokeDasharray="4 3"
            />

            {/* X-axis move markers */}
            {valid.length <= 30 &&
              valid.map((d, i) => {
                const x = toX(d.index)
                if (i % Math.max(1, Math.ceil(valid.length / 12)) !== 0 && i !== valid.length - 1)
                  return null
                return (
                  <g key={`tick-${i}`}>
                    <line
                      x1={x}
                      y1={viewHeight - padding.bottom + 2}
                      x2={x}
                      y2={viewHeight - padding.bottom + 6}
                      stroke="currentColor"
                      strokeOpacity={0.15}
                      strokeWidth={1}
                    />
                    <text
                      x={x}
                      y={viewHeight - padding.bottom + 14}
                      textAnchor="middle"
                      className="text-[8px] fill-muted"
                    >
                      {d.moveNumber}
                    </text>
                  </g>
                )
              })}
          </>
        )}

        {/* Shaded area segments */}
        {areaSegments.map((seg, i) => (
          <path
            key={i}
            d={seg.path}
            fill={seg.positive ? 'var(--theme-accent)' : 'var(--theme-muted)'}
            fillOpacity={seg.positive ? 0.12 : 0.08}
          />
        ))}

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke="var(--theme-accent)"
          strokeWidth={sparkline ? 1.5 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points (hidden in sparkline) */}
        {!sparkline &&
          valid.map((d, i) => {
            const cx = toX(d.index)
            const cy = toY(d.eval)
            const isActive = d.index === currentIndex
            const isHovered = d.index === hoveredIndex
            const r = isActive ? 5 : 3

            return (
              <g key={i}>
                {(isHovered || isActive) && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={11}
                    fill="var(--theme-accent)"
                    fillOpacity={0.12}
                    className={interactive ? 'cursor-pointer' : ''}
                    onClick={() => interactive && handlePointClick(d.index)}
                  />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="var(--theme-accent)"
                  fillOpacity={isActive ? 1 : 0.75}
                  className={interactive ? 'cursor-pointer' : ''}
                  onMouseEnter={() => interactive && handlePointerEnter(d.index)}
                  onMouseLeave={() => interactive && handlePointerLeave()}
                  onTouchStart={() => interactive && handlePointerEnter(d.index)}
                  onTouchEnd={() => {
                    if (interactive) {
                      handlePointerLeave()
                      handlePointClick(d.index)
                    }
                  }}
                  onClick={() => interactive && handlePointClick(d.index)}
                />
                {isHovered && !isActive && (
                  <>
                    <rect
                      x={Math.max(0, cx - 34)}
                      y={Math.max(0, cy - 26)}
                      width={68}
                      height={18}
                      rx={4}
                      fill="var(--theme-bg)"
                      stroke="var(--theme-accent)"
                      strokeWidth={0.5}
                    />
                    <text
                      x={cx}
                      y={cy - 13}
                      textAnchor="middle"
                      className="text-[9px] fill-text"
                    >
                      #{d.moveNumber} {toFixed1(d.eval)}
                    </text>
                  </>
                )}
              </g>
            )
          })}

        {/* Hover tooltip also on the line itself */}
        {!sparkline && hoveredIndex !== null && (
          <line
            x1={toX(hoveredIndex)}
            y1={zeroY - innerH / 2}
            x2={toX(hoveredIndex)}
            y2={zeroY + innerH / 2}
            stroke="var(--theme-accent)"
            strokeOpacity={0.15}
            strokeWidth={1}
            strokeDasharray="2 4"
          />
        )}
      </svg>
    </div>
  )
}

function buildAreaSegments(
  points: EvalGraphPoint[],
  toX: (x: number) => number,
  toY: (e: number) => number,
  zeroY: number,
): { path: string; positive: boolean }[] {
  const segments: { path: string; positive: boolean }[] = []

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const ax = toX(a.index)
    const ay = toY(a.eval)
    const bx = toX(b.index)
    const by = toY(b.eval)

    const aPos = a.eval >= 0
    const bPos = b.eval >= 0

    if (aPos === bPos) {
      const path = `M ${ax} ${ay} L ${bx} ${by} L ${bx} ${zeroY} L ${ax} ${zeroY} Z`
      segments.push({ path, positive: aPos })
    } else {
      const t = a.eval / (a.eval - b.eval)
      const ix = ax + t * (bx - ax)
      if (aPos) {
        segments.push({
          path: `M ${ax} ${ay} L ${ix} ${zeroY} L ${ax} ${zeroY} Z`,
          positive: true,
        })
        segments.push({
          path: `M ${ix} ${zeroY} L ${bx} ${by} L ${bx} ${zeroY} Z`,
          positive: false,
        })
      } else {
        segments.push({
          path: `M ${ax} ${ay} L ${ix} ${zeroY} L ${ax} ${zeroY} Z`,
          positive: false,
        })
        segments.push({
          path: `M ${ix} ${zeroY} L ${bx} ${by} L ${bx} ${zeroY} Z`,
          positive: true,
        })
      }
    }
  }

  return segments
}

export function EvalGraphSparkline({ points, height = 48 }: { points: EvalGraphPoint[]; height?: number }) {
  return <EvalGraph points={points} sparkline height={height} />
}
