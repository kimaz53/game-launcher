import * as React from 'react'
import { cn } from '../../lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Badge({ className, ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border border-theme-border bg-theme-card px-2 py-1 text-xs font-medium tracking-[0.4px] text-theme-muted',
        className
      )}
      {...props}
    />
  )
}
