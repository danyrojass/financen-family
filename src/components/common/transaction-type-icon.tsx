import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Landmark,
  PiggyBank,
  SlidersHorizontal,
  Wallet,
} from 'lucide-react'
import type { TransactionType } from '@/domain/models'
import { cn } from '@/lib/utils'

const ICONS = {
  expense: ArrowDownRight,
  income: ArrowUpRight,
  transfer: ArrowLeftRight,
  withdrawal: Banknote,
  card_payment: CreditCard,
  loan_payment: Landmark,
  savings_contribution: PiggyBank,
  savings_withdrawal: PiggyBank,
  adjustment: SlidersHorizontal,
  account: Wallet,
} as const

const TONES: Record<TransactionType | 'account', string> = {
  expense: 'bg-destructive/10 text-destructive',
  income: 'bg-success/10 text-success',
  transfer: 'bg-primary/10 text-primary',
  withdrawal: 'bg-warning/10 text-warning',
  card_payment: 'bg-primary/10 text-primary',
  loan_payment: 'bg-chart-4/15 text-chart-4',
  savings_contribution: 'bg-chart-6/15 text-chart-6',
  savings_withdrawal: 'bg-chart-6/15 text-chart-6',
  adjustment: 'bg-muted text-muted-foreground',
  account: 'bg-primary/10 text-primary',
}

export function TransactionTypeIcon({
  type,
  className,
  size = 'md',
}: {
  type: TransactionType | 'account'
  className?: string
  size?: 'sm' | 'md'
}) {
  const Icon = ICONS[type] ?? Wallet
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        size === 'sm' ? 'size-7' : 'size-9',
        TONES[type] ?? 'bg-muted text-muted-foreground',
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} />
    </span>
  )
}
