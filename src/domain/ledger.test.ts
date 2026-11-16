import { describe, expect, it } from 'vitest'
import {
  availableMoneyBase,
  computeAccountBalances,
  computeBudgetProgress,
  computeCardStates,
  computeCategoryBreakdown,
  computeLoanStates,
  computeMonthSummary,
  computeMonthlySeries,
  computeUpcoming,
  nextOccurrence,
} from '@/domain/ledger'
import type { Budget, Loan } from '@/domain/models'
import { makeAccount, makeCard, makeCategory, makeTransaction } from '@/test/fixtures'

const ctx = { baseCurrency: 'PYG' as const, fxRates: { USD: 7500 } }

describe('saldos de cuentas', () => {
  it('reconstruye saldos desde los movimientos', () => {
    const bank = makeAccount({ id: 'bank', initialBalanceMinor: 1_000_000 })
    const cash = makeAccount({ id: 'cash', type: 'cash' })
    const savings = makeAccount({ id: 'savings', type: 'savings', initialBalanceMinor: 500_000 })

    const transactions = [
      makeTransaction({ type: 'income', accountId: 'bank', amountMinor: 2_000_000 }),
      makeTransaction({ type: 'transfer', accountId: 'bank', toAccountId: 'cash', amountMinor: 500_000 }),
      makeTransaction({ type: 'expense', accountId: 'cash', amountMinor: 180_000 }),
      makeTransaction({ type: 'savings_contribution', accountId: 'bank', toAccountId: 'savings', amountMinor: 100_000 }),
    ]

    const balances = computeAccountBalances([bank, cash, savings], transactions, ctx)
    const byId = new Map(balances.map((balance) => [balance.account.id, balance]))

    expect(byId.get('bank')?.currentMinor).toBe(1_000_000 + 2_000_000 - 500_000 - 100_000)
    expect(byId.get('cash')?.currentMinor).toBe(320_000)
    expect(byId.get('savings')?.currentMinor).toBe(600_000)
  })

  it('ignora movimientos pendientes y eliminados', () => {
    const cash = makeAccount({ id: 'cash', type: 'cash' })
    const transactions = [
      makeTransaction({ type: 'expense', accountId: 'cash', amountMinor: 10_000, status: 'pending' }),
      makeTransaction({ type: 'expense', accountId: 'cash', amountMinor: 20_000, deletedAt: new Date() }),
    ]
    const balances = computeAccountBalances([cash], transactions, ctx)
    expect(balances[0]?.currentMinor).toBe(0)
  })

  it('separa dinero disponible de ahorros y aplica conversion', () => {
    const pyg = makeAccount({ id: 'pyg', initialBalanceMinor: 1_000_000 })
    const usd = makeAccount({
      id: 'usd',
      currency: 'USD',
      initialBalanceMinor: 10_000,
      includeInAvailable: false,
    })
    const savings = makeAccount({ id: 'save', type: 'savings', initialBalanceMinor: 500_000 })
    const balances = computeAccountBalances([pyg, usd, savings], [], ctx)
    const result = availableMoneyBase(balances)
    expect(result.availableMinor).toBe(1_000_000)
    expect(result.savingsMinor).toBe(500_000)
    expect(result.rateMissing).toBe(false)
  })
})

describe('tarjetas de credito', () => {
  it('el retiro de tarjeta genera deuda y efectivo, no gasto de consumo', () => {
    const card = makeCard({ id: 'visa' })
    const cash = makeAccount({ id: 'cash', type: 'cash' })

    const transactions = [
      makeTransaction({ type: 'withdrawal', cardId: 'visa', toAccountId: 'cash', amountMinor: 500_000 }),
      makeTransaction({ type: 'expense', accountId: 'cash', amountMinor: 180_000 }),
    ]

    const balances = computeAccountBalances([cash], transactions, ctx)
    const cards = computeCardStates([card], transactions)

    expect(balances[0]?.currentMinor).toBe(320_000)
    expect(cards[0]?.debtMinor).toBe(500_000)
    expect(computeMonthSummary(transactions).expenseMinor).toBe(180_000)
  })

  it('el pago de tarjeta cancela deuda y no duplica el gasto', () => {
    const card = makeCard({ id: 'visa', limitMinor: 1_000_000 })
    const bank = makeAccount({ id: 'bank', initialBalanceMinor: 2_000_000 })

    const transactions = [
      makeTransaction({ type: 'expense', cardId: 'visa', amountMinor: 300_000 }),
      makeTransaction({ type: 'card_payment', cardId: 'visa', accountId: 'bank', amountMinor: 200_000 }),
    ]

    const balances = computeAccountBalances([bank], transactions, ctx)
    const cards = computeCardStates([card], transactions)
    const summary = computeMonthSummary(transactions)

    expect(balances[0]?.currentMinor).toBe(1_800_000)
    expect(cards[0]?.debtMinor).toBe(100_000)
    expect(cards[0]?.availableMinor).toBe(900_000)
    expect(summary.expenseMinor).toBe(300_000)
    expect(summary.debtPaymentsMinor).toBe(200_000)
  })

  it('un reintegro en tarjeta reduce el gasto', () => {
    const card = makeCard({ id: 'visa' })
    const transactions = [
      makeTransaction({ type: 'expense', cardId: 'visa', amountMinor: 100_000 }),
      makeTransaction({ type: 'income', cardId: 'visa', amountMinor: 30_000 }),
    ]
    const summary = computeMonthSummary(transactions)
    const cards = computeCardStates([card], transactions)
    expect(summary.expenseMinor).toBe(70_000)
    expect(cards[0]?.debtMinor).toBe(70_000)
  })
})

describe('prestamos', () => {
  const loan: Loan = {
    id: 'loan-1',
    kind: 'loan',
    name: 'Préstamo auto',
    institution: 'Banco',
    originalPrincipalMinor: 10_000_000,
    interestRate: 12,
    installmentAmountMinor: 500_000,
    installmentsTotal: 24,
    firstDueDate: new Date('2026-01-15T12:00:00.000Z'),
    currency: 'PYG',
    accountId: 'bank',
    categoryId: null,
    isActive: true,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: 'user-1',
  }

  it('separa capital de interes en el pago de cuota', () => {
    const payment = makeTransaction({
      type: 'loan_payment',
      loanId: 'loan-1',
      accountId: 'bank',
      amountMinor: 500_000,
      principalMinor: 450_000,
      interestMinor: 50_000,
      categoryId: null,
    })
    const summary = computeMonthSummary([payment])
    const states = computeLoanStates([loan], [payment])

    expect(summary.expenseMinor).toBe(50_000)
    expect(summary.debtPaymentsMinor).toBe(450_000)
    expect(states[0]?.outstandingMinor).toBe(9_550_000)
    expect(states[0]?.installmentsPaid).toBe(1)
    expect(states[0]?.nextDueDate?.getMonth()).toBe(1) // febrero
  })
})

describe('multi-moneda', () => {
  it('prorratea interes y comision a moneda base en el resumen', () => {
    const interestCategory = makeCategory({ id: 'cat-interest', name: 'Intereses' })
    const payment = makeTransaction({
      type: 'loan_payment',
      accountId: 'bank',
      loanId: 'loan-1',
      categoryId: 'cat-interest',
      amountMinor: 10_000,
      currency: 'USD',
      baseAmountMinor: 750_000,
      fxRate: 7500,
      principalMinor: 8_000,
      interestMinor: 2_000,
    })
    const withdrawal = makeTransaction({
      type: 'withdrawal',
      cardId: 'visa',
      toAccountId: 'cash',
      amountMinor: 10_000,
      currency: 'USD',
      baseAmountMinor: 750_000,
      fxRate: 7500,
      feeMinor: 500,
    })

    const summary = computeMonthSummary([payment, withdrawal])
    expect(summary.expenseMinor).toBe(150_000 + 37_500)
    expect(summary.debtPaymentsMinor).toBe(600_000)

    const breakdown = computeCategoryBreakdown([payment], [interestCategory])
    expect(breakdown[0]?.amountMinor).toBe(150_000)
  })
})

describe('presupuestos y series', () => {
  it('calcula el porcentaje usado de un presupuesto', () => {
    const groceries = makeCategory({ id: 'cat-food', name: 'Supermercado' })
    const budget: Budget = {
      id: 'b1',
      period: '2026-11',
      categoryId: 'cat-food',
      amountMinor: 500_000,
      currency: 'PYG',
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: 'user-1',
    }
    const transactions = [
      makeTransaction({ type: 'expense', categoryId: 'cat-food', accountId: 'cash', amountMinor: 250_000 }),
      makeTransaction({ type: 'expense', categoryId: 'cat-food', accountId: 'cash', amountMinor: 100_000 }),
    ]
    const progress = computeBudgetProgress([budget], transactions, [groceries], ctx)
    expect(progress[0]?.spentMinor).toBe(350_000)
    expect(progress[0]?.ratio).toBeCloseTo(0.7)
    expect(progress[0]?.remainingMinor).toBe(150_000)
  })

  it('arma la serie mensual', () => {
    const transactions = [
      makeTransaction({ type: 'income', accountId: 'a', amountMinor: 100_000, date: new Date(2026, 9, 5) }),
      makeTransaction({ type: 'expense', accountId: 'a', amountMinor: 40_000, date: new Date(2026, 10, 5) }),
    ]
    const series = computeMonthlySeries(transactions, ['2026-10', '2026-11'])
    expect(series[0]?.incomeMinor).toBe(100_000)
    expect(series[1]?.expenseMinor).toBe(40_000)
  })
})

describe('proximos vencimientos', () => {
  it('incluye compromisos recurrentes y prestamos', () => {
    const recurring = {
      id: 'r1',
      name: 'Gimnasio',
      type: 'expense' as const,
      amountMinor: 180_000,
      currency: 'PYG' as const,
      frequency: 'monthly' as const,
      intervalDays: null,
      dayOfMonth: 10,
      nextRunAt: new Date('2026-11-12T12:00:00.000Z'),
      accountId: 'cash',
      cardId: null,
      toAccountId: null,
      categoryId: null,
      loanId: null,
      autoGenerate: true,
      isActive: true,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: 'user-1',
    }
    const items = computeUpcoming([recurring], [], [], new Date('2026-11-10T12:00:00.000Z'))
    expect(items).toHaveLength(1)
    expect(items[0]?.label).toBe('Gimnasio')
  })

  it('calcula la proxima ocurrencia segun frecuencia', () => {
    const base = new Date(2026, 0, 31)
    expect(nextOccurrence(base, 'monthly').getMonth()).toBe(1)
    expect(nextOccurrence(base, 'weekly').getDate()).toBe(7)
    expect(nextOccurrence(base, 'yearly').getFullYear()).toBe(2027)
    expect(nextOccurrence(base, 'custom', 10).getDate()).toBe(10)
  })
})
