import * as React from 'react'
import { cn } from '@/lib/utils'
import { Card } from './card'

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ReactNode
  tone?: 'default' | 'positive' | 'negative' | 'warning' | 'muted'
  className?: string
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-success'
      : tone === 'negative'
        ? 'text-destructive'
        : tone === 'warning'
          ? 'text-warning'
          : tone === 'muted'
            ? 'text-muted-foreground'
            : 'text-foreground'

  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </div>
      <p className={cn('mt-2 truncate text-lg font-semibold tabular-nums sm:text-xl', toneClass)}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  )
}
