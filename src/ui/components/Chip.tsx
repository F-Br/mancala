import type { ReactNode } from 'react'

/*
 * Chip – small pill for move tokens, badges, tags.
 *
 * Uses font-body, text-label scale (12px/600 uppercase 0.06em),
 * rounded-chip, surface-2 background, muted text.
 * Accepts an optional `color` prop that overrides the dot colour.
 * Pass `bg` / `text` to override background and text colour.
 */
interface ChipProps {
  children: ReactNode
  color?: string
  bg?: string
  text?: string
  className?: string
}

export function Chip({ children, color, bg = 'bg-surface-2', text = 'text-muted', className = '' }: ChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-chip ${bg} px-2.5 py-1 font-semibold text-label uppercase tracking-label ${text} ${className}`}
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
