import type { ReactNode } from 'react'

/*
 * Card – reusable surface panel.
 *
 * Renders a rounded card with a subtle vertical gradient (color-mix
 * surface+6% white → surface), a 1px top inset highlight line, a 1px
 * border in the theme's border colour, and the theme's card shadow.
 *
 * Accepts an optional title string rendered in font-display display-md.
 */
interface CardProps {
  children: ReactNode
  title?: string
  className?: string
}

export function Card({ children, title, className = '' }: CardProps) {
  return (
    <div
      className={`rounded-card border border-border ${className}`}
      style={{
        background: `linear-gradient(180deg, color-mix(in srgb, var(--theme-surface) 94%, white) 0%, var(--theme-surface) 100%)`,
        boxShadow: `var(--theme-shadow-card), inset 0 1px 0 0 var(--theme-highlight)`,
      }}
    >
      {title && (
        <h3 className="font-display text-display-md font-semibold text-text px-4 pt-4 pb-2">
          {title}
        </h3>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}
