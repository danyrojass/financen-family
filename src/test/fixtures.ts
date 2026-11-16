import type { Account, Card, Category, Transaction } from '@/domain/models'

const NOW = new Date('2026-11-10T12:00:00.000Z')

let sequence = 0

export function makeAccount(overrides: Partial<Account> = {}): Account {
  sequence += 1
  return {
    id: `account-${sequence}`,
    name: `Cuenta ${sequence}`,
    type: 'bank',
    currency: 'PYG',
    initialBalanceMinor: 0,
    includeInAvailable: true,
    ownerId: null,
    isActive: true,
    notes: null,
    sortOrder: sequence,
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: 'user-1',
    ...overrides,
  }
}

export function makeCard(overrides: Partial<Card> = {}): Card {
  sequence += 1
  return {
    id: `card-${sequence}`,
    name: `Tarjeta ${sequence}`,
    issuer: 'Banco',
    holderId: null,
    limitMinor: 5_000_000,
    currency: 'PYG',
    closingDay: 25,
    dueDay: 5,
    isActive: true,
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: 'user-1',
    ...overrides,
  }
}

export function makeCategory(overrides: Partial<Category> = {}): Category {
  sequence += 1
  return {
    id: `category-${sequence}`,
    name: `Categoria ${sequence}`,
    kind: 'expense',
    parentId: null,
    color: '#64748b',
    icon: null,
    isArchived: false,
    isSystem: false,
    sortOrder: sequence,
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: 'user-1',
    ...overrides,
  }
}

export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  sequence += 1
  const amountMinor = overrides.amountMinor ?? 100_000
  return {
    id: `tx-${sequence}`,
    householdId: 'household-1',
    type: 'expense',
    date: new Date('2026-11-05T12:00:00.000Z'),
    description: 'Movimiento',
    amountMinor,
    currency: 'PYG',
    baseAmountMinor: amountMinor,
    fxRate: 1,
    categoryId: null,
    accountId: null,
    toAccountId: null,
    toAmountMinor: null,
    cardId: null,
    loanId: null,
    commitmentId: null,
    principalMinor: null,
    interestMinor: null,
    feeMinor: null,
    installmentPlanId: null,
    installmentIndex: null,
    installmentCount: null,
    createdBy: 'user-1',
    createdByName: 'Dany',
    entryMethod: 'manual',
    status: 'confirmed',
    notes: null,
    recurringId: null,
    rawTranscript: null,
    confidence: null,
    deletedAt: null,
    deletedBy: null,
    updatedBy: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

export const testNow = NOW
