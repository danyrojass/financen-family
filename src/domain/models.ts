import type { CurrencyCode } from './money'

export type HouseholdRole = 'OWNER' | 'MEMBER'

export type TransactionType =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'withdrawal'
  | 'card_payment'
  | 'loan_payment'
  | 'savings_contribution'
  | 'savings_withdrawal'
  | 'adjustment'

export type EntryMethod = 'manual' | 'voice' | 'import'
export type TransactionStatus = 'confirmed' | 'pending'

export type AccountType = 'cash' | 'bank' | 'wallet' | 'savings' | 'investment' | 'other'
export type CategoryKind = 'expense' | 'income'
export type LoanKind = 'loan' | 'commitment'
export type RecurrenceFrequency = 'weekly' | 'monthly' | 'yearly' | 'custom'

export interface UserProfile {
  uid: string
  displayName: string
  email: string
  photoURL: string | null
  householdIds: string[]
  activeHouseholdId: string | null
  defaultCurrency: CurrencyCode
  onboardingCompleted: boolean
  createdAt: Date
  updatedAt: Date
  lastSeenAt: Date | null
}

export interface Household {
  id: string
  name: string
  baseCurrency: CurrencyCode
  /** 1 unidad de la moneda X = rate unidades de baseCurrency. */
  fxRates: Record<string, number>
  ownerId: string
  createdBy: string
  timezone: string
  locale: string
  createdAt: Date
  updatedAt: Date
}

export interface HouseholdMember {
  uid: string
  role: HouseholdRole
  displayName: string
  email: string
  photoURL: string | null
  joinedAt: Date
  invitationId: string | null
}

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

export interface Invitation {
  id: string
  email: string
  role: 'MEMBER'
  status: InvitationStatus
  createdBy: string
  createdAt: Date
  expiresAt: Date
  householdName: string
  acceptedBy: string | null
  acceptedAt: Date | null
  revokedAt: Date | null
}

export interface Account {
  id: string
  name: string
  type: AccountType
  currency: CurrencyCode
  initialBalanceMinor: number
  /** Suma al "dinero disponible" del hogar. */
  includeInAvailable: boolean
  ownerId: string | null
  isActive: boolean
  notes: string | null
  sortOrder: number
  createdAt: Date
  updatedAt: Date
  updatedBy: string
}

export interface Card {
  id: string
  name: string
  issuer: string
  holderId: string | null
  limitMinor: number
  currency: CurrencyCode
  closingDay: number
  dueDay: number
  isActive: boolean
  notes: string | null
  createdAt: Date
  updatedAt: Date
  updatedBy: string
}

export interface Category {
  id: string
  name: string
  kind: CategoryKind
  parentId: string | null
  color: string | null
  icon: string | null
  isArchived: boolean
  isSystem: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
  updatedBy: string
}

export interface Transaction {
  id: string
  householdId: string
  type: TransactionType
  date: Date
  description: string
  /** Entero en unidades minimas de `currency`. Negativo solo en ajustes. */
  amountMinor: number
  currency: CurrencyCode
  /** Equivalente en la moneda base del hogar. Negativo solo en ajustes. */
  baseAmountMinor: number
  /** Tasa aplicada (unidades de base por 1 unidad de `currency`). 1 si es base. */
  fxRate: number
  categoryId: string | null
  /** Cuenta de origen (o cuenta afectada en gastos/ingresos). */
  accountId: string | null
  toAccountId: string | null
  /** Importe acreditado en la cuenta destino cuando cambia de moneda. */
  toAmountMinor: number | null
  cardId: string | null
  loanId: string | null
  commitmentId: string | null
  /** Parte del pago de prestamo que amortiza capital. */
  principalMinor: number | null
  /** Parte del pago de prestamo que es interes (gasto real). */
  interestMinor: number | null
  feeMinor: number | null
  installmentPlanId: string | null
  installmentIndex: number | null
  installmentCount: number | null
  createdBy: string
  createdByName: string
  entryMethod: EntryMethod
  status: TransactionStatus
  notes: string | null
  recurringId: string | null
  rawTranscript: string | null
  confidence: number | null
  deletedAt: Date | null
  deletedBy: string | null
  updatedBy: string | null
  createdAt: Date
  updatedAt: Date
}

export interface TransactionAudit {
  id: string
  action: 'created' | 'updated' | 'deleted' | 'restored'
  by: string
  byName: string
  at: Date
  summary: string | null
  changes: Record<string, unknown> | null
}

export interface Budget {
  id: string
  /** YYYY-MM */
  period: string
  categoryId: string
  amountMinor: number
  currency: CurrencyCode
  notes: string | null
  createdAt: Date
  updatedAt: Date
  updatedBy: string
}

export interface Loan {
  id: string
  kind: LoanKind
  name: string
  institution: string | null
  originalPrincipalMinor: number
  interestRate: number
  installmentAmountMinor: number
  installmentsTotal: number
  firstDueDate: Date
  currency: CurrencyCode
  accountId: string | null
  categoryId: string | null
  isActive: boolean
  notes: string | null
  createdAt: Date
  updatedAt: Date
  updatedBy: string
}

export interface RecurringRule {
  id: string
  name: string
  type: TransactionType
  amountMinor: number
  currency: CurrencyCode
  frequency: RecurrenceFrequency
  intervalDays: number | null
  dayOfMonth: number | null
  nextRunAt: Date
  accountId: string | null
  cardId: string | null
  toAccountId: string | null
  categoryId: string | null
  loanId: string | null
  /** Si es true, el sistema genera borradores pendientes. Nunca paga solo. */
  autoGenerate: boolean
  isActive: boolean
  notes: string | null
  createdAt: Date
  updatedAt: Date
  updatedBy: string
}

/** Borrador interpretado por voz: todos los campos son opcionales hasta confirmar. */
export interface TransactionDraft {
  type: TransactionType
  date: Date
  description: string
  amountMinor: number | null
  currency: CurrencyCode
  categoryId: string | null
  categoryName: string | null
  accountId: string | null
  accountName: string | null
  toAccountId: string | null
  toAccountName: string | null
  cardId: string | null
  cardName: string | null
  loanId: string | null
  notes: string | null
  entryMethod: EntryMethod
  rawTranscript: string | null
  confidence: number
  missing: string[]
  warnings: string[]
}

export interface MonthKey {
  year: number
  month: number
}
