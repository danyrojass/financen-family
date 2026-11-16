import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { monthLabel, shiftMonthKey } from '@/lib/date'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function MonthNav({
  value,
  onChange,
  className,
  allowNext = true,
}: {
  /** YYYY-MM */
  value: string
  onChange: (next: string) => void
  className?: string
  allowNext?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label="Mes anterior"
        onClick={() => onChange(shiftMonthKey(value, -1))}
      >
        <ChevronLeft />
      </Button>
      <div className="flex h-8 min-w-36 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2 text-sm font-medium">
        <CalendarDays className="size-3.5 text-muted-foreground" />
        {monthLabel(value)}
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label="Mes siguiente"
        disabled={!allowNext}
        onClick={() => onChange(shiftMonthKey(value, 1))}
      >
        <ChevronRight />
      </Button>
    </div>
  )
}
