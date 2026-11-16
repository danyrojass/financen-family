import * as React from 'react'
import { cn } from '@/lib/utils'

interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  id?: string
  disabled?: boolean
  label?: string
}

export function Switch({ checked, onCheckedChange, id, disabled, label }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-input',
      )}
    >
      <span
        className={cn(
          'pointer-events-none block size-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  )
}

export function SwitchField({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  const id = React.useId()
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        label={label}
      />
    </div>
  )
}
