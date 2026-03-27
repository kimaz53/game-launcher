import * as React from 'react'
import { cn } from '../../lib/utils'

type Variant = 'default' | 'secondary' | 'ghost'
type Size = 'default' | 'icon' | 'sm'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const variantClass =
      variant === 'secondary'
        ? 'bg-theme-secondary text-theme-text hover:bg-theme-secondary-hover border border-theme-border'
        : variant === 'ghost'
          ? 'bg-transparent text-theme-text hover:bg-theme-card'
          : 'bg-theme-primary text-theme-text hover:bg-theme-primary-hover'

    const sizeClass =
      size === 'sm'
        ? 'h-8 px-3 text-xs'
        : size === 'icon'
          ? 'h-9 w-9 p-0'
          : 'h-9 px-4 py-2 text-sm'

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent disabled:pointer-events-none disabled:opacity-50',
          variantClass,
          sizeClass,
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

