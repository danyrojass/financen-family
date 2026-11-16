import { cn } from '@/lib/utils'

export function Progress({
  value,
  className,
  indicatorClassName,
  label,
}: {
  value: number
  className?: string
  indicatorClassName?: string
  label?: string
}) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-all',
          clamped >= 100 ? 'bg-destructive' : clamped >= 80 ? 'bg-warning' : 'bg-primary',
          indicatorClassName,
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
