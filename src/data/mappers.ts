import { Timestamp, type DocumentData } from 'firebase/firestore'
import type {
  Account,
  AccountType,
  Budget,
  Card,
  Category,
  CategoryKind,
  EntryMethod,
  Household,
  HouseholdMember,
  HouseholdRole,
  Invitation,
  InvitationStatus,
  Loan,
  LoanKind,
  RecurrenceFrequency,
  RecurringRule,
  Transaction,
  TransactionAudit,
  TransactionStatus,
  TransactionType,
  UserProfile,
} from '@/domain/models'
import type { CurrencyCode } from '@/domain/money'
import { safeBoolean, safeNumber, safeString } from '@/lib/utils'

export function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const raw = value as { seconds?: unknown; nanoseconds?: unknown }
    const seconds = safeNumber(raw.seconds)
    const nanoseconds = safeNumber(raw.nanoseconds)
    return new Timestamp(seconds, nanoseconds).toDate()
  }
  return null
}

export function toDateOr(value: unknown, fallback: Date = new Date()): Date {
  return toDate(value) ?? fallback
}

function str(value: unknown): string {
  return safeString(value)
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function num(value: unknown): number {
  return Math.trunc(safeNumber(value))
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null
}

function currency(value: unknown, fallback: CurrencyCode = 'PYG'): CurrencyCode {
  return value === 'USD' || value === 'PYG' ? value : fallback
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function mapUser(id: string, data: DocumentData): UserProfile {
  return {
    uid: id,
    displayName: str(data.displayName) || 'Usuario',
    email: str(data.email),
    photoURL: strOrNull(data.photoURL),
    householdIds: stringArray(data.householdIds),
    activeHouseholdId: strOrNull(data.activeHouseholdId),
    defaultCurrency: currency(data.defaultCurrency),
    onboardingCompleted: safeBoolean(data.onboardingCompleted),
    createdAt: toDateOr(data.createdAt),
    updatedAt: toDateOr(data.updatedAt),
    lastSeenAt: toDate(data.lastSeenAt),
  }
}

export function mapHousehold(id: string, data: DocumentData): Household {
  const rawRates = data.fxRates
  const fxRates: Record<string, number> = {}
  if (rawRates && typeof rawRates === 'object') {
    for (const [key, value] of Object.entries(rawRates as Record<string, unknown>)) {
      const rate = safeNumber(value)
      if (rate > 0) fxRates[key] = rate
    }
  }
  return {
    id,
    name: str(data.name) || 'Mi hogar',
    baseCurrency: currency(data.baseCurrency),
    fxRates,
    ownerId: str(data.ownerId),
    createdBy: str(data.createdBy),
    timezone: str(data.timezone) || 'America/Asuncion',
    locale: str(data.locale) || 'es-PY',
    createdAt: toDateOr(data.createdAt),
    updatedAt: toDateOr(data.updatedAt),
  }
}

export function mapMember(id: string, data: DocumentData): HouseholdMember {
  return {
    uid: id,
    role: (data.role === 'OWNER' ? 'OWNER' : 'MEMBER') as HouseholdRole,
    displayName: str(data.displayName) || 'Integrante',
    email: str(data.email),
    photoURL: strOrNull(data.photoURL),
    joinedAt: toDateOr(data.joinedAt),
    invitationId: strOrNull(data.invitationId),
  }
}

export function mapInvitation(id: string, data: DocumentData): Invitation {
  const status = data.status
  return {
    id,
    email: str(data.email),
    role: 'MEMBER',
    status: (
      status === 'accepted' || status === 'revoked' || status === 'expired' ? status : 'pending'
    ) as InvitationStatus,
    createdBy: str(data.createdBy),
    createdAt: toDateOr(data.createdAt),
    expiresAt: toDateOr(data.expiresAt),
    householdName: str(data.householdName) || 'Hogar',
    acceptedBy: strOrNull(data.acceptedBy),
    acceptedAt: toDate(data.acceptedAt),
    revokedAt: toDate(data.revokedAt),
  }
}

const ACCOUNT_TYPES: AccountType[] = [
  'cash',
  'bank',
  'wallet',
  'savings',
  'investment',
  'other',
]

export function mapAccount(id: string, data: DocumentData): Account {
  const type = ACCOUNT_TYPES.includes(data.type as AccountType)
    ? (data.type as AccountType)
    : 'other'
  return {
    id,
    name: str(data.name) || 'Cuenta',
    type,
    currency: currency(data.currency),
    initialBalanceMinor: num(data.initialBalanceMinor),
    includeInAvailable: data.includeInAvailable !== false,
    ownerId: strOrNull(data.ownerId),
    isActive: data.isActive !== false,
    notes: strOrNull(data.notes),
    sortOrder: num(data.sortOrder),
    createdAt: toDateOr(data.createdAt),
    updatedAt: toDateOr(data.updatedAt),
    updatedBy: str(data.updatedBy),
  }
}

export function mapCard(id: string, data: DocumentData): Card {
  return {
    id,
    name: str(data.name) || 'Tarjeta',
    issuer: str(data.issuer) || '',
    holderId: strOrNull(data.holderId),
    limitMinor: num(data.limitMinor),
    currency: currency(data.currency),
    closingDay: Math.min(Math.max(num(data.closingDay) || 1, 1), 31),
    dueDay: Math.min(Math.max(num(data.dueDay) || 1, 1), 31),
    isActive: data.isActive !== false,
    notes: strOrNull(data.notes),
    createdAt: toDateOr(data.createdAt),
    updatedAt: toDateOr(data.updatedAt),
    updatedBy: str(data.updatedBy),
  }
}

export function mapCategory(id: string, data: DocumentData): Category {
  const kind: CategoryKind = data.kind === 'income' ? 'income' : 'expense'
  return {
    id,
    name: str(data.name) || 'Categoría',
    kind,
    parentId: strOrNull(data.parentId),
    color: strOrNull(data.color),
    icon: strOrNull(data.icon),
    isArchived: safeBoolean(data.isArchived),
    isSystem: safeBoolean(data.isSystem),
    sortOrder: num(data.sortOrder),
    createdAt: toDateOr(data.createdAt),
    updatedAt: toDateOr(data.updatedAt),
    updatedBy: str(data.updatedBy),
  }
}

export function mapTransaction(id: string, data: DocumentData): Transaction {
  return {
    id,
    householdId: str(data.householdId),
    type: (str(data.type) || 'expense') as TransactionType,
    date: toDateOr(data.date),
    description: str(data.description) || 'Movimiento',
    amountMinor: num(data.amountMinor),
    currency: currency(data.currency),
    baseAmountMinor: num(data.baseAmountMinor),
    fxRate: safeNumber(data.fxRate, 1),
    categoryId: strOrNull(data.categoryId),
    accountId: strOrNull(data.accountId),
    toAccountId: strOrNull(data.toAccountId),
    toAmountMinor: numOrNull(data.toAmountMinor),
    cardId: strOrNull(data.cardId),
    loanId: strOrNull(data.loanId),
    commitmentId: strOrNull(data.commitmentId),
    principalMinor: numOrNull(data.principalMinor),
    interestMinor: numOrNull(data.interestMinor),
    feeMinor: numOrNull(data.feeMinor),
    installmentPlanId: strOrNull(data.installmentPlanId),
    installmentIndex: numOrNull(data.installmentIndex),
    installmentCount: numOrNull(data.installmentCount),
    createdBy: str(data.createdBy),
    createdByName: str(data.createdByName) || 'Usuario',
    entryMethod: (str(data.entryMethod) || 'manual') as EntryMethod,
    status: (data.status === 'pending' ? 'pending' : 'confirmed') as TransactionStatus,
    notes: strOrNull(data.notes),
    recurringId: strOrNull(data.recurringId),
    rawTranscript: strOrNull(data.rawTranscript),
    confidence: numOrNull(data.confidence),
    deletedAt: toDate(data.deletedAt),
    deletedBy: strOrNull(data.deletedBy),
    updatedBy: strOrNull(data.updatedBy),
    createdAt: toDateOr(data.createdAt),
    updatedAt: toDateOr(data.updatedAt),
  }
}

export function mapBudget(id: string, data: DocumentData): Budget {
  return {
    id,
    period: str(data.period),
    categoryId: str(data.categoryId),
    amountMinor: num(data.amountMinor),
    currency: currency(data.currency),
    notes: strOrNull(data.notes),
    createdAt: toDateOr(data.createdAt),
    updatedAt: toDateOr(data.updatedAt),
    updatedBy: str(data.updatedBy),
  }
}

export function mapLoan(id: string, data: DocumentData): Loan {
  const kind: LoanKind = data.kind === 'commitment' ? 'commitment' : 'loan'
  return {
    id,
    kind,
    name: str(data.name) || 'Compromiso',
    institution: strOrNull(data.institution),
    originalPrincipalMinor: num(data.originalPrincipalMinor),
    interestRate: safeNumber(data.interestRate),
    installmentAmountMinor: num(data.installmentAmountMinor),
    installmentsTotal: Math.max(1, num(data.installmentsTotal) || 1),
    firstDueDate: toDateOr(data.firstDueDate),
    currency: currency(data.currency),
    accountId: strOrNull(data.accountId),
    categoryId: strOrNull(data.categoryId),
    isActive: data.isActive !== false,
    notes: strOrNull(data.notes),
    createdAt: toDateOr(data.createdAt),
    updatedAt: toDateOr(data.updatedAt),
    updatedBy: str(data.updatedBy),
  }
}

const FREQUENCIES: RecurrenceFrequency[] = ['weekly', 'monthly', 'yearly', 'custom']

export function mapRecurringRule(id: string, data: DocumentData): RecurringRule {
  const frequency = FREQUENCIES.includes(data.frequency as RecurrenceFrequency)
    ? (data.frequency as RecurrenceFrequency)
    : 'monthly'
  return {
    id,
    name: str(data.name) || 'Recurrente',
    type: (str(data.type) || 'expense') as TransactionType,
    amountMinor: num(data.amountMinor),
    currency: currency(data.currency),
    frequency,
    intervalDays: numOrNull(data.intervalDays),
    dayOfMonth: numOrNull(data.dayOfMonth),
    nextRunAt: toDateOr(data.nextRunAt),
    accountId: strOrNull(data.accountId),
    cardId: strOrNull(data.cardId),
    toAccountId: strOrNull(data.toAccountId),
    categoryId: strOrNull(data.categoryId),
    loanId: strOrNull(data.loanId),
    autoGenerate: safeBoolean(data.autoGenerate),
    isActive: data.isActive !== false,
    notes: strOrNull(data.notes),
    createdAt: toDateOr(data.createdAt),
    updatedAt: toDateOr(data.updatedAt),
    updatedBy: str(data.updatedBy),
  }
}

export function mapAudit(id: string, data: DocumentData): TransactionAudit {
  const action = data.action
  return {
    id,
    action:
      action === 'updated' || action === 'deleted' || action === 'restored' ? action : 'created',
    by: str(data.by),
    byName: str(data.byName),
    at: toDateOr(data.at),
    summary: strOrNull(data.summary),
    changes:
      data.changes && typeof data.changes === 'object'
        ? (data.changes as Record<string, unknown>)
        : null,
  }
}
