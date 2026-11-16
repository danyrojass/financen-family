import * as React from 'react'
import type { Transaction } from '@/domain/models'
import {
  TransactionFormDialog,
  type TransactionFormInitial,
} from '@/features/transactions/transaction-form-dialog'

export interface QuickAddOptions {
  initial?: TransactionFormInitial
  transaction?: Transaction | null
}

interface QuickAddContextValue {
  openQuickAdd: (options?: QuickAddOptions) => void
}

const QuickAddContext = React.createContext<QuickAddContextValue | null>(null)

/**
 * Dialogo global de alta/edicion de movimientos. Cualquier pagina puede abrirlo
 * con valores iniciales (por ejemplo "pagar tarjeta" desde la tarjeta).
 */
export function QuickAddProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const [initial, setInitial] = React.useState<TransactionFormInitial | null>(null)
  const [transaction, setTransaction] = React.useState<Transaction | null>(null)

  const openQuickAdd = React.useCallback((options?: QuickAddOptions) => {
    setInitial(options?.initial ?? null)
    setTransaction(options?.transaction ?? null)
    setOpen(true)
  }, [])

  const value = React.useMemo(() => ({ openQuickAdd }), [openQuickAdd])

  return (
    <QuickAddContext.Provider value={value}>
      {children}
      <TransactionFormDialog
        open={open}
        onOpenChange={setOpen}
        initial={initial}
        transaction={transaction}
      />
    </QuickAddContext.Provider>
  )
}

export function useQuickAdd(): QuickAddContextValue {
  const context = React.useContext(QuickAddContext)
  if (!context) throw new Error('useQuickAdd debe usarse dentro de QuickAddProvider')
  return context
}
