import type { ReactNode } from 'react'

/*
 * PageLayout – centered container with consistent horizontal padding
 * and vertical rhythm.
 *
 * max-width: 1100px
 * Horizontal padding: 24px desktop / 16px mobile
 *
 * Accepts an optional `title` rendered as display-lg in font-display.
 */
interface PageLayoutProps {
  children: ReactNode
  title?: string
  className?: string
}

export function PageLayout({ children, title, className = '' }: PageLayoutProps) {
  return (
    <main className={`mx-auto max-w-[1100px] px-4 md:px-6 py-6 md:py-8 ${className}`}>
      {title && (
        <h1 className="font-display text-display-lg font-semibold text-text mb-6">{title}</h1>
      )}
      {children}
    </main>
  )
}
