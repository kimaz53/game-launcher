import * as React from 'react'
import { cn } from '../../lib/utils'

type Variant = 'default' | 'secondary' | 'ghost'
type Size = 'default' | 'icon' | 'sm'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'ui-btn',
        variant === 'default' && 'ui-btn-default',
        variant === 'secondary' && 'ui-btn-secondary',
        variant === 'ghost' && 'ui-btn-ghost',
        size === 'default' && 'ui-btn-size-default',
        size === 'sm' && 'ui-btn-size-sm',
        size === 'icon' && 'ui-btn-size-icon',
        className
      )}
      {...props}
    />
  )
)
Button.displayName = 'Button'

