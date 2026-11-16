import { Mic, Repeat } from 'lucide-react'
import type { Account, Card, Category, Transaction } from '@/domain/models'
import type { CurrencyCode } from '@/domain/money'
import { formatMoney } from '@/domain/money'
import { formatDate } from '@/lib/date'
import { TRANSACTION_TYPE_LABELS } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { TransactionTypeIcon } from '@/components/common/transaction-type-icon'

export function transactionSecondaryText(
  transaction: Transaction,
  lookups: {
    category?: Category | null
    account?: Account | null
    toAccount?: Account | null
    card?: Card | null
    memberName?: string
  },
): string {
  const parts: string[] = []
  if (lookups.category) parts.push(lookups.category.name)
  if (lookups.card) parts.push(lookups.card.name)
  else if (lookups.account) parts.push(lookups.account.name)
  if (lookups.toAccount) parts.push(`→ ${lookups.toAccount.name}`)
  if (lookups.memberName) parts.push(lookups.memberName)
  if (parts.length === 0) parts.push(TRANSACTION_TYPE_LABELS[transaction.type])
  return parts.join(' · ')
}

export interface TransactionAmountLabel {
  text: string
  tone: string
  converted?: string
}

export function transactionAmountLabel(
  transaction: Transaction,
  baseCurrency: CurrencyCode,
): TransactionAmountLabel {
  const amount = formatMoney(Math.abs(transaction.amountMinor), transaction.currency)
  if (transaction.type === 'income') {
    return { text: `+ ${amount}`, tone: 'text-success' }
  }
  if (transaction.type === 'expense') {
    return { text: `- ${amount}`, tone: 'text-destructive' }
  }
  if (transaction.type === 'adjustment' && transaction.amountMinor < 0) {
    return { text: `- ${amount}`, tone: 'text-destructive' }
  }
  if (transaction.type === 'adjustment') {
    return { text: `+ ${amount}`, tone: 'text-muted-foreground' }
  }
  const converted =
    transaction.currency === baseCurrency
      ? undefined
      : formatMoney(Math.abs(transaction.baseAmountMinor), baseCurrency)
  return { text: amount, tone: 'text-foreground', converted }
}

export function TransactionRow({
  transaction,
  category,
  account,
  toAccount,
  card,
  memberName,
  baseCurrency,
  showDate = false,
  onClick,
}: {
  transaction: Transaction
  category?: Category | null
  account?: Account | null
  toAccount?: Account | null
  card?: Card | null
  memberName?: string
  baseCurrency: CurrencyCode
  showDate?: boolean
  onClick?: () => void
}) {
  const amount = transactionAmountLabel(transaction, baseCurrency)
  const secondary = transactionSecondaryText(transaction, {
    category,
    account,
    toAccount,
    card,
    memberName,
  })

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-1 py-2.5 text-left transition-colors hover:bg-accent/40 sm:px-2',
        onClick ? 'cursor-pointer' : 'cursor-default',
        transaction.deletedAt && 'opacity-60',
      )}
    >
      <TransactionTypeIcon type={transaction.type} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium">{transaction.description}</p>
          {transaction.status === 'pending' ? (
            <Badge variant="warning" className="shrink-0">
              Pendiente
            </Badge>
          ) : null}
          {transaction.entryMethod === 'voice' ? (
            <Mic className="size-3 shrink-0 text-muted-foreground" aria-label="Cargado por voz" />
          ) : null}
          {transaction.recurringId ? (
            <Repeat className="size-3 shrink-0 text-muted-foreground" aria-label="Recurrente" />
          ) : null}
          {transaction.deletedAt ? (
            <Badge variant="outline" className="shrink-0">
              Eliminado
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {showDate ? `${formatDate(transaction.date)} · ` : ''}
          {secondary}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={cn('text-sm font-semibold tabular-nums', amount.tone)}>{amount.text}</p>
        {amount.converted ? (
          <p className="text-[11px] text-muted-foreground tabular-nums">{amount.converted}</p>
        ) : null}
      </div>
    </button>
  )
}
