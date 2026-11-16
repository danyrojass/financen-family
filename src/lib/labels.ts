import type {
  AccountType,
  LoanKind,
  RecurrenceFrequency,
  TransactionType,
} from '@/domain/models'

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  expense: 'Gasto',
  income: 'Ingreso',
  transfer: 'Transferencia',
  withdrawal: 'Retiro de tarjeta',
  card_payment: 'Pago de tarjeta',
  loan_payment: 'Pago de préstamo',
  savings_contribution: 'Aporte a ahorro',
  savings_withdrawal: 'Retiro de ahorro',
  adjustment: 'Ajuste',
}

export const TRANSACTION_TYPE_DESCRIPTIONS: Record<TransactionType, string> = {
  expense: 'Dinero que sale del hogar',
  income: 'Dinero que entra al hogar',
  transfer: 'Movimiento entre tus cuentas (no es gasto)',
  withdrawal: 'Avance de tarjeta a efectivo (aumenta la deuda)',
  card_payment: 'Pago del resumen (reduce la deuda, no es gasto)',
  loan_payment: 'Cuota de préstamo (el interés es gasto)',
  savings_contribution: 'Pasás dinero a una cuenta de ahorro',
  savings_withdrawal: 'Rescatás dinero de tu ahorro',
  adjustment: 'Corrección manual de saldo',
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Efectivo',
  bank: 'Cuenta bancaria',
  wallet: 'Billetera digital',
  savings: 'Ahorro',
  investment: 'Inversión',
  other: 'Otra',
}

export const LOAN_KIND_LABELS: Record<LoanKind, string> = {
  loan: 'Préstamo',
  commitment: 'Compromiso',
}

export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  weekly: 'Semanal',
  monthly: 'Mensual',
  yearly: 'Anual',
  custom: 'Personalizada',
}

export const ROLE_LABELS = {
  OWNER: 'Owner',
  MEMBER: 'Integrante',
} as const

/** 1 = ingreso, -1 = gasto, 0 = movimiento neutro (no es consumo). */
export function transactionSign(type: TransactionType): 1 | -1 | 0 {
  if (type === 'income') return 1
  if (type === 'expense') return -1
  return 0
}

export function transactionListTypes(): TransactionType[] {
  return [
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
}
