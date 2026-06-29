import type { ReactNode, ButtonHTMLAttributes } from 'react'

/*
 * Button – reusable action primitive.
 *
 * Variants:
 *   primary   – accent fill, dark-on-light text contrast, pill or radius-chip
 *   secondary – surface-2 fill, text colour, 1px border
 *   ghost     – transparent, text colour only, underline on hover
 *
 * All variants share consistent height (min-h-11), radius-chip,
 * focus ring in accent.
 * The size prop tailors the internal padding: "sm" | "md" (default) | "lg".
 */
type ButtonVariant = 'primary' | 'secondary' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-bg font-semibold',
  secondary: 'bg-surface-2 text-text border border-border hover:brightness-110 font-medium',
  ghost: 'text-muted hover:text-text font-medium',
}

const sizeClass: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm min-h-9',
  md: 'px-5 py-2.5 text-body min-h-11',
  lg: 'px-6 py-3 text-body-lg min-h-12',
}

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-chip transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${variantClass[variant]} ${sizeClass[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
