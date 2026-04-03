import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'font-display peer grid h-4 w-4 shrink-0 place-content-center rounded-sm border border-theme-border bg-theme-card text-theme-text shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-theme-primary data-[state=checked]:bg-theme-primary data-[state=checked]:text-theme-text',
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="font-display grid place-content-center text-current">
      <Check className="h-3 w-3 stroke-[3]" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
