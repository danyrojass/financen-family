import * as React from 'react'
import { cn } from '@/lib/utils'

interface TabsProps {
  value: string
  onValueChange: (value: string) => void
  items: Array<{ value: string; label: React.ReactNode; icon?: React.ReactNode }>
  className?: string
}

export function Tabs({ value, onValueChange, items, className }: TabsProps) {
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cn(
        'no-scrollbar flex w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(item.value)}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
