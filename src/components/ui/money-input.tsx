import * as React from 'react'
import { cn } from '@/lib/utils'
import { formatMoney, parseAmountToMinor, type CurrencyCode } from '@/domain/money'
import { Input } from './input'

interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string
  onValueChange: (value: string) => void
  currency: CurrencyCode
  error?: boolean
}

/**
 * Input de importes pensado para mobile: teclado numerico, acepta "1.500.000",
 * "45 mil" no (eso es voz) y muestra la interpretacion exacta en unidades minimas.
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onValueChange, currency, className, error, ...props }, ref) => {
    const parsed = parseAmountToMinor(value, currency)
    return (
      <div className="space-y-1">
        <div className="relative">
          <Input
            ref={ref}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            className={cn('pr-16 text-lg font-semibold tabular-nums', error && 'border-destructive', className)}
            {...props}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">
            {currency}
          </span>
        </div>
        <p className="min-h-4 text-xs text-muted-foreground">
          {parsed != null && parsed !== 0 ? formatMoney(parsed, currency) : 'Ingresá el importe'}
        </p>
      </div>
    )
  },
)
MoneyInput.displayName = 'MoneyInput'
