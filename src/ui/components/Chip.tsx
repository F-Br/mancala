import type { ReactNode } from 'react'

/*
 * Chip – small pill for move tokens, badges, tags.
 *
 * Uses font-body, text-label scale (12px/600 uppercase 0.06em),
 * rounded-chip, surface-2 background, muted text.
 * Accepts an optional `color` prop that overrides the dot colour.
 */
interface ChipProps {
  children: ReactNode
  color?: string
  className?: string
}

export function Chip({ children, color, className = '' }: ChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-chip bg-surface-2 px-2.5 py-1 font-semibold text-label uppercase tracking-label text-muted ${className}`}
    >
      {color && (
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      {children}
    </span>
  )
}
