import * as React from 'react'

import { cn } from '@/lib/utils'

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl border border-white/10 bg-slate-900/30 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] backdrop-blur-xl',
        className
      )}
      {...props}
    />
  )
)
Card.displayName = 'Card'

export { Card }

