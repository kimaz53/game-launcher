import * as React from 'react'
import { cn } from '../../lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-10 w-full rounded-md border border-theme-border bg-theme-card px-3 text-sm text-theme-text placeholder:text-theme-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent',
      className
    )}
    {...props}
  />
))
Input.displayName = 'Input'

