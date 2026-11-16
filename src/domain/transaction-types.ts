import type { TransactionType } from './models'

export interface TransactionTypeMeta {
  label: string
  shortLabel: string
  description: string
  /** Como impacta en los reportes de flujo. */
  flow: 'expense' | 'income' | 'neutral' | 'saving'
  requiresSourceAccount: boolean
  requiresDestinationAccount: boolean
  requiresCard: boolean
  requiresLoan: boolean
  allowsCategory: boolean
  icon: string
}

export const TRANSACTION_TYPES: TransactionType[] = [
  'expense',
  'income',
  'transfer',
  'withdrawal',
  'card_payment',
  'loan_payment',
  'savings_contribution',
  'savings_withdrawal',
  'adjustment',
]

export const TRANSACTION_TYPE_META: Record<TransactionType, TransactionTypeMeta> = {
  expense: {
    label: 'Gasto',
    shortLabel: 'Gasto',
    description: 'Consumo real. Si usa tarjeta, aumenta la deuda de la tarjeta.',
    flow: 'expense',
    requiresSourceAccount: false,
    requiresDestinationAccount: false,
    requiresCard: false,
    requiresLoan: false,
    allowsCategory: true,
    icon: 'ArrowUpRight',
  },
  income: {
    label: 'Ingreso',
    shortLabel: 'Ingreso',
    description: 'Dinero que entra al hogar.',
    flow: 'income',
    requiresSourceAccount: false,
    requiresDestinationAccount: false,
    requiresCard: false,
    requiresLoan: false,
    allowsCategory: true,
    icon: 'ArrowDownLeft',
  },
  transfer: {
    label: 'Transferencia',
    shortLabel: 'Transferencia',
    description: 'Mueve dinero entre cuentas propias sin ser gasto.',
    flow: 'neutral',
    requiresSourceAccount: true,
    requiresDestinationAccount: true,
    requiresCard: false,
    requiresLoan: false,
    allowsCategory: false,
    icon: 'ArrowLeftRight',
  },
  withdrawal: {
    label: 'Retiro de efectivo',
    shortLabel: 'Retiro',
    description: 'Avance de tarjeta a efectivo: genera deuda, no es un gasto.',
    flow: 'neutral',
    requiresSourceAccount: false,
    requiresDestinationAccount: true,
    requiresCard: true,
    requiresLoan: false,
    allowsCategory: false,
    icon: 'Banknote',
  },
  card_payment: {
    label: 'Pago de tarjeta',
    shortLabel: 'Pago tarjeta',
    description: 'Cancela deuda de tarjeta. No vuelve a registrar los consumos.',
    flow: 'neutral',
    requiresSourceAccount: true,
    requiresDestinationAccount: false,
    requiresCard: true,
    requiresLoan: false,
    allowsCategory: false,
    icon: 'CreditCard',
  },
  loan_payment: {
    label: 'Pago de préstamo',
    shortLabel: 'Pago préstamo',
    description: 'Amortiza capital y registra el interés como gasto.',
    flow: 'neutral',
    requiresSourceAccount: true,
    requiresDestinationAccount: false,
    requiresCard: false,
    requiresLoan: true,
    allowsCategory: true,
    icon: 'Landmark',
  },
  savings_contribution: {
    label: 'Aporte a ahorro',
    shortLabel: 'Ahorro',
    description: 'Mueve dinero a una cuenta de ahorro. No es gasto de consumo.',
    flow: 'saving',
    requiresSourceAccount: true,
    requiresDestinationAccount: true,
    requiresCard: false,
    requiresLoan: false,
    allowsCategory: false,
    icon: 'PiggyBank',
  },
  savings_withdrawal: {
    label: 'Retiro de ahorro',
    shortLabel: 'Retiro ahorro',
    description: 'Devuelve dinero desde una cuenta de ahorro.',
    flow: 'saving',
    requiresSourceAccount: true,
    requiresDestinationAccount: true,
    requiresCard: false,
    requiresLoan: false,
    allowsCategory: false,
    icon: 'PiggyBank',
  },
  adjustment: {
    label: 'Ajuste de saldo',
    shortLabel: 'Ajuste',
    description: 'Corrige un saldo por conciliación. El importe puede ser negativo.',
    flow: 'neutral',
    requiresSourceAccount: false,
    requiresDestinationAccount: false,
    requiresCard: false,
    requiresLoan: false,
    allowsCategory: false,
    icon: 'SlidersHorizontal',
  },
}

/** Tipos que suman "gasto del mes". */
export const EXPENSE_FLOW_TYPES: TransactionType[] = ['expense', 'loan_payment', 'withdrawal']
/** Tipos que representan movimiento entre cuentas propias. */
export const TRANSFER_TYPES: TransactionType[] = [
  'transfer',
  'withdrawal',
  'card_payment',
  'loan_payment',
  'savings_contribution',
  'savings_withdrawal',
]

export function isTransactionType(value: unknown): value is TransactionType {
  return typeof value === 'string' && (TRANSACTION_TYPES as string[]).includes(value)
}

export function transactionTypeLabel(type: TransactionType): string {
  return TRANSACTION_TYPE_META[type]?.label ?? type
}
