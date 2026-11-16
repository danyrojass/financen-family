import * as React from 'react'
import { cn } from '@/lib/utils'

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('text-sm font-medium leading-none text-foreground', className)}
      {...props}
    />
  )
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null
  return <p className="text-xs font-medium text-destructive">{children}</p>
}

export function FieldHint({ children }: { children?: React.ReactNode }) {
  if (!children) return null
  return <p className="text-xs text-muted-foreground">{children}</p>
}
