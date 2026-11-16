/**
 * Motor contable del hogar.
 *
 * Decision de arquitectura: los saldos NO se guardan como campos mutables.
 * Se derivan de los movimientos confirmados (fuente unica de verdad). Esto:
 *  - elimina el riesgo de doble contabilizacion,
 *  - permite reconstruir cualquier saldo historico,
 *  - evita escrituras multi-documento al registrar un movimiento.
 *
 * Reglas contables implementadas:
 *  - Retiro de tarjeta: aumenta deuda de tarjeta y efectivo. NO es gasto.
 *  - Pago de tarjeta: baja la cuenta bancaria y cancela deuda. NO es gasto.
 *  - Pago de prestamo: baja la cuenta, amortiza capital y el interes es gasto.
 *  - Transferencia / ahorro: mueve saldo entre cuentas propias. NO es gasto.
 *  - Ajuste: corrige un saldo; puede ser negativo.
 *  - Solo los movimientos confirmados afectan saldos y resumenes.
 */
import { addMonths, endOfDay, parseMonthKey, startOfDay } from '@/lib/date'
import type {
  Account,
  Budget,
  Card,
  Category,
  Loan,
  MonthKey,
  RecurringRule,
  Transaction,
} from './models'
import { convertMinor, sumMinor, type CurrencyCode } from './money'

export interface LedgerContext {
  baseCurrency: CurrencyCode
  fxRates: Record<string, number>
}

export interface AccountBalance {
  account: Account
  deltaMinor: number
  currentMinor: number
  currentBaseMinor: number
  rateMissing: boolean
}

export interface CardState {
  card: Card
  chargedMinor: number
  paidMinor: number
  debtMinor: number
  availableMinor: number
  utilization: number
  rateMissing: boolean
  debtBaseMinor: number
}

export interface CardStatement {
  start: Date
  end: Date
  dueDate: Date
}

export interface LoanState {
  loan: Loan
  paidPrincipalMinor: number
  paidInterestMinor: number
  installmentsPaid: number
  installmentsRemaining: number
  outstandingMinor: number
  nextDueDate: Date | null
  isOverdue: boolean
  progress: number
}

export interface MonthSummary {
  incomeMinor: number
  expenseMinor: number
  balanceMinor: number
  savingsMinor: number
  debtPaymentsMinor: number
  pendingCount: number
  pendingAmountMinor: number
  transactionCount: number
}

export interface CategoryBreakdownItem {
  categoryId: string | null
  name: string
  color: string | null
  amountMinor: number
  share: number
  count: number
}

export interface BudgetProgressItem {
  budget: Budget
  categoryName: string
  spentMinor: number
  remainingMinor: number
  ratio: number
  isOverBudget: boolean
}

export function isActiveTransaction(transaction: Transaction): boolean {
  return !transaction.deletedAt
}

export function isCountedTransaction(transaction: Transaction): boolean {
  return isActiveTransaction(transaction) && transaction.status === 'confirmed'
}

/**
 * Convierte una parte de un movimiento (interes, comision, etc.) a moneda base.
 * `baseAmountMinor` corresponde al importe total, por lo que la parte se prorratea
 * para no mezclar unidades de la moneda original con la moneda base del hogar.
 */
function proportionalBaseMinor(transaction: Transaction, partMinor: number): number {
  if (!partMinor || transaction.amountMinor === 0) return 0
  return Math.round((transaction.baseAmountMinor * partMinor) / transaction.amountMinor)
}

/** Movimientos que impactan cuentas (deltas en la moneda de cada cuenta). */
export function computeAccountDeltas(transactions: Transaction[]): Map<string, number> {
  const deltas = new Map<string, number>()
  const add = (accountId: string | null, amount: number) => {
    if (!accountId || !Number.isFinite(amount) || amount === 0) return
    deltas.set(accountId, (deltas.get(accountId) ?? 0) + Math.trunc(amount))
  }

  for (const tx of transactions) {
    if (!isCountedTransaction(tx)) continue
    const destinationAmount = tx.toAmountMinor ?? tx.amountMinor

    switch (tx.type) {
      case 'expense':
        if (!tx.cardId) add(tx.accountId, -tx.amountMinor)
        break
      case 'income':
        if (tx.cardId) {
          // Reintegro / devolucion a la tarjeta: reduce deuda.
          break
        }
        add(tx.accountId, tx.amountMinor)
        break
      case 'transfer':
      case 'savings_contribution':
      case 'savings_withdrawal':
        add(tx.accountId, -tx.amountMinor)
        add(tx.toAccountId, destinationAmount)
        break
      case 'withdrawal':
        add(tx.toAccountId, destinationAmount)
        break
      case 'card_payment':
      case 'loan_payment':
        add(tx.accountId, -tx.amountMinor)
        break
      case 'adjustment':
        if (!tx.cardId) add(tx.accountId, tx.amountMinor)
        break
      default:
        break
    }
  }

  return deltas
}

export function computeAccountBalances(
  accounts: Account[],
  transactions: Transaction[],
  ctx: LedgerContext,
): AccountBalance[] {
  const deltas = computeAccountDeltas(transactions)
  return accounts.map((account) => {
    const deltaMinor = deltas.get(account.id) ?? 0
    const currentMinor = account.initialBalanceMinor + deltaMinor
    const converted =
      account.currency === ctx.baseCurrency
        ? currentMinor
        : convertMinor(currentMinor, account.currency, ctx.baseCurrency, ctx.fxRates, ctx.baseCurrency)
    return {
      account,
      deltaMinor,
      currentMinor,
      currentBaseMinor: converted ?? 0,
      rateMissing: converted === null,
    }
  })
}

export function computeCardStates(cards: Card[], transactions: Transaction[]): CardState[] {
  const charged = new Map<string, number>()
  const paid = new Map<string, number>()
  const add = (map: Map<string, number>, id: string | null, amount: number) => {
    if (!id) return
    map.set(id, (map.get(id) ?? 0) + Math.trunc(amount))
  }

  for (const tx of transactions) {
    if (!isCountedTransaction(tx)) continue
    switch (tx.type) {
      case 'expense':
        if (tx.cardId) add(charged, tx.cardId, tx.amountMinor)
        break
      case 'withdrawal':
        if (tx.cardId) add(charged, tx.cardId, tx.amountMinor + (tx.feeMinor ?? 0))
        break
      case 'income':
        if (tx.cardId) add(paid, tx.cardId, tx.amountMinor)
        break
      case 'card_payment':
        if (tx.cardId) add(paid, tx.cardId, tx.amountMinor)
        break
      case 'adjustment':
        if (tx.cardId) add(charged, tx.cardId, tx.amountMinor)
        break
      default:
        break
    }
  }

  return cards.map((card) => {
    const chargedMinor = charged.get(card.id) ?? 0
    const paidMinor = paid.get(card.id) ?? 0
    const debtMinor = chargedMinor - paidMinor
    const availableMinor = card.limitMinor - debtMinor
    return {
      card,
      chargedMinor,
      paidMinor,
      debtMinor,
      availableMinor,
      utilization: card.limitMinor > 0 ? Math.max(0, debtMinor) / card.limitMinor : 0,
      rateMissing: false,
      debtBaseMinor: debtMinor,
    }
  })
}

export function computeTotalCardDebtBase(states: CardState[], ctx: LedgerContext): number {
  return sumMinor(
    states.map((state) => {
      if (state.card.currency === ctx.baseCurrency) return state.debtMinor
      const converted = convertMinor(
        state.debtMinor,
        state.card.currency,
        ctx.baseCurrency,
        ctx.fxRates,
        ctx.baseCurrency,
      )
      return converted ?? 0
    }),
  )
}

/** Periodo de resumen de una tarjeta segun dia de cierre. */
export function cardStatementRange(card: Card, reference = new Date()): CardStatement {
  const closingDay = Math.min(Math.max(card.closingDay, 1), 31)
  const dueDay = Math.min(Math.max(card.dueDay, 1), 31)

  const build = (year: number, monthIndex: number, day: number) => {
    const lastDay = new Date(year, monthIndex + 1, 0).getDate()
    return new Date(year, monthIndex, Math.min(day, lastDay))
  }

  const thisMonthClosing = build(reference.getFullYear(), reference.getMonth(), closingDay)
  let end = thisMonthClosing
  if (reference > endOfDay(thisMonthClosing)) {
    end = build(reference.getFullYear(), reference.getMonth() + 1, closingDay)
  }
  const start = addMonths(end, -1)
  const afterEnd = addMonths(end, 1)
  const dueDate = build(afterEnd.getFullYear(), afterEnd.getMonth(), dueDay)
  return {
    start: new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 1),
    end: endOfDay(end),
    dueDate,
  }
}

export function isInStatement(tx: Transaction, statement: CardStatement): boolean {
  return tx.date >= statement.start && tx.date <= statement.end
}

export function computeLoanStates(loans: Loan[], transactions: Transaction[]): LoanState[] {
  const now = new Date()

  return loans.map((loan) => {
    const payments = transactions.filter(
      (tx) =>
        isCountedTransaction(tx) &&
        tx.loanId === loan.id &&
        (tx.type === 'loan_payment' || Boolean(tx.commitmentId)),
    )
    const commitmentPayments = transactions.filter(
      (tx) => isCountedTransaction(tx) && tx.commitmentId === loan.id,
    )

    const relevant = loan.kind === 'commitment' ? commitmentPayments : payments
    const paidPrincipalMinor = sumMinor(
      relevant.map((tx) => {
        if (tx.principalMinor != null) return tx.principalMinor
        if (tx.type === 'loan_payment') return tx.amountMinor - (tx.interestMinor ?? 0)
        return tx.amountMinor
      }),
    )
    const paidInterestMinor = sumMinor(relevant.map((tx) => tx.interestMinor ?? 0))
    const installmentsPaid = relevant.length
    const installmentsRemaining = Math.max(0, loan.installmentsTotal - installmentsPaid)
    const outstandingMinor =
      loan.kind === 'loan'
        ? Math.max(0, loan.originalPrincipalMinor - paidPrincipalMinor)
        : 0

    let nextDueDate: Date | null = null
    if (installmentsRemaining > 0) {
      const first = startOfDay(loan.firstDueDate)
      nextDueDate = addMonths(first, installmentsPaid)
      // Si la cuota calculada quedo muy en el pasado, se muestra igual (vencida).
    }

    return {
      loan,
      paidPrincipalMinor,
      paidInterestMinor,
      installmentsPaid,
      installmentsRemaining,
      outstandingMinor,
      nextDueDate,
      isOverdue: Boolean(nextDueDate && nextDueDate < startOfDay(now)),
      progress: loan.installmentsTotal > 0 ? installmentsPaid / loan.installmentsTotal : 0,
    }
  })
}

export interface MonthSummaryOptions {
  /** Filtra por integrante, cuenta, categoria, etc. */
  predicate?: (tx: Transaction) => boolean
}

export function computeMonthSummary(
  transactions: Transaction[],
  options: MonthSummaryOptions = {},
): MonthSummary {
  const predicate = options.predicate ?? (() => true)
  const confirmed = transactions.filter((tx) => isCountedTransaction(tx) && predicate(tx))
  const pending = transactions.filter(
    (tx) => isActiveTransaction(tx) && tx.status === 'pending' && predicate(tx),
  )

  let incomeMinor = 0
  let expenseMinor = 0
  let savingsMinor = 0
  let debtPaymentsMinor = 0

  for (const tx of confirmed) {
    const base = tx.baseAmountMinor
    switch (tx.type) {
      case 'income':
        // Un ingreso sobre tarjeta es un reintegro: reduce el gasto, no es ingreso.
        if (tx.cardId) expenseMinor -= base
        else incomeMinor += base
        break
      case 'expense':
        expenseMinor += base
        break
      case 'loan_payment': {
        const interestBase = proportionalBaseMinor(tx, tx.interestMinor ?? 0)
        expenseMinor += interestBase
        debtPaymentsMinor += Math.max(0, base - interestBase)
        break
      }
      case 'withdrawal':
        expenseMinor += proportionalBaseMinor(tx, tx.feeMinor ?? 0)
        break
      case 'card_payment':
        debtPaymentsMinor += base
        break
      case 'savings_contribution':
        savingsMinor += base
        break
      case 'savings_withdrawal':
        savingsMinor -= base
        break
      default:
        break
    }
  }

  return {
    incomeMinor,
    expenseMinor,
    balanceMinor: incomeMinor - expenseMinor,
    savingsMinor,
    debtPaymentsMinor,
    pendingCount: pending.length,
    pendingAmountMinor: sumMinor(pending.map((tx) => Math.abs(tx.baseAmountMinor))),
    transactionCount: confirmed.length,
  }
}

export function computeCategoryBreakdown(
  transactions: Transaction[],
  categories: Category[],
  kind: 'expense' | 'income' = 'expense',
): CategoryBreakdownItem[] {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const totals = new Map<string | null, { amountMinor: number; count: number }>()

  const filtered = transactions.filter((tx) => {
    if (!isCountedTransaction(tx)) return false
    if (kind === 'expense') {
      if (tx.type === 'expense') return true
      return tx.type === 'loan_payment' && (tx.interestMinor ?? 0) > 0
    }
    return tx.type === 'income'
  })

  for (const tx of filtered) {
    const amount =
      kind === 'expense' && tx.type === 'loan_payment'
        ? proportionalBaseMinor(tx, tx.interestMinor ?? 0)
        : Math.abs(tx.baseAmountMinor)
    const entry = totals.get(tx.categoryId) ?? { amountMinor: 0, count: 0 }
    entry.amountMinor += amount
    entry.count += 1
    totals.set(tx.categoryId, entry)
  }

  const total = sumMinor([...totals.values()].map((entry) => entry.amountMinor))

  return [...totals.entries()]
    .map(([categoryId, entry]) => {
      const category = categoryId ? byId.get(categoryId) : null
      return {
        categoryId,
        name: category?.name ?? 'Sin categoría',
        color: category?.color ?? '#94a3b8',
        amountMinor: entry.amountMinor,
        share: total > 0 ? entry.amountMinor / total : 0,
        count: entry.count,
      }
    })
    .sort((a, b) => b.amountMinor - a.amountMinor)
}

/** Gasto de una categoria (incluye subcategorias) expresado en moneda base. */
export function computeCategorySpent(
  transactions: Transaction[],
  categoryId: string,
  categories: Category[],
): number {
  const ids = new Set<string>([categoryId])
  for (const category of categories) {
    if (category.parentId === categoryId) ids.add(category.id)
  }
  const filtered = transactions.filter(
    (tx) =>
      isCountedTransaction(tx) &&
      tx.categoryId != null &&
      ids.has(tx.categoryId) &&
      (tx.type === 'expense' || tx.type === 'loan_payment'),
  )
  return sumMinor(
    filtered.map((tx) => {
      if (tx.type !== 'loan_payment') return Math.abs(tx.baseAmountMinor)
      // La porcion de interes es gasto; se prorratea el equivalente en base.
      const interest = tx.interestMinor ?? 0
      if (tx.amountMinor === 0) return 0
      return Math.round((tx.baseAmountMinor * interest) / tx.amountMinor)
    }),
  )
}

export function computeBudgetProgress(
  budgets: Budget[],
  transactions: Transaction[],
  categories: Category[],
  ctx: LedgerContext,
): BudgetProgressItem[] {
  const byId = new Map(categories.map((category) => [category.id, category]))
  return budgets
    .map((budget) => {
      const budgetBaseMinor =
        budget.currency === ctx.baseCurrency
          ? budget.amountMinor
          : convertMinor(
              budget.amountMinor,
              budget.currency,
              ctx.baseCurrency,
              ctx.fxRates,
              ctx.baseCurrency,
            ) ?? budget.amountMinor
      const spentMinor = computeCategorySpent(transactions, budget.categoryId, categories)
      const remainingMinor = budgetBaseMinor - spentMinor
      const ratio = budgetBaseMinor > 0 ? spentMinor / budgetBaseMinor : 0
      return {
        budget,
        categoryName: byId.get(budget.categoryId)?.name ?? 'Categoría',
        spentMinor,
        remainingMinor,
        ratio,
        isOverBudget: spentMinor > budgetBaseMinor,
      }
    })
    .sort((a, b) => b.ratio - a.ratio)
}

export interface MonthlySeriesPoint {
  monthKey: string
  incomeMinor: number
  expenseMinor: number
  savingsMinor: number
}

export function computeMonthlySeries(
  transactions: Transaction[],
  months: string[],
): MonthlySeriesPoint[] {
  return months.map((monthKey) => {
    const { year, month } = parseMonthKey(monthKey)
    const filtered = transactions.filter((tx) => {
      if (!isCountedTransaction(tx)) return false
      return tx.date.getFullYear() === year && tx.date.getMonth() === month - 1
    })
    const summary = computeMonthSummary(filtered)
    return {
      monthKey,
      incomeMinor: summary.incomeMinor,
      expenseMinor: summary.expenseMinor,
      savingsMinor: summary.savingsMinor,
    }
  })
}

export interface UpcomingItem {
  id: string
  kind: 'recurring' | 'loan' | 'card' | 'commitment'
  label: string
  amountMinor: number
  currency: CurrencyCode
  dueDate: Date
  overdue: boolean
  referenceId: string
}

export function computeUpcoming(
  recurring: RecurringRule[],
  loanStates: LoanState[],
  cardStates: CardState[],
  now = new Date(),
): UpcomingItem[] {
  const items: UpcomingItem[] = []

  for (const rule of recurring) {
    if (!rule.isActive) continue
    const due = startOfDay(rule.nextRunAt)
    // Solo vencidos o dentro de los proximos 60 dias.
    if (due.getTime() - now.getTime() > 60 * 86_400_000) continue
    items.push({
      id: `recurring-${rule.id}`,
      kind: 'recurring',
      label: rule.name,
      amountMinor: rule.amountMinor,
      currency: rule.currency,
      dueDate: due,
      overdue: due < startOfDay(now),
      referenceId: rule.id,
    })
  }

  for (const state of loanStates) {
    if (!state.loan.isActive || !state.nextDueDate) continue
    items.push({
      id: `loan-${state.loan.id}`,
      kind: state.loan.kind === 'loan' ? 'loan' : 'commitment',
      label: state.loan.name,
      amountMinor: state.loan.installmentAmountMinor,
      currency: state.loan.currency,
      dueDate: state.nextDueDate,
      overdue: state.isOverdue,
      referenceId: state.loan.id,
    })
  }

  for (const state of cardStates) {
    if (!state.card.isActive || state.debtMinor <= 0) continue
    const statement = cardStatementRange(state.card, now)
    items.push({
      id: `card-${state.card.id}`,
      kind: 'card',
      label: `Vencimiento ${state.card.name}`,
      amountMinor: state.debtMinor,
      currency: state.card.currency,
      dueDate: statement.dueDate,
      overdue: statement.dueDate < startOfDay(now),
      referenceId: state.card.id,
    })
  }

  return items.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
}

export function availableMoneyBase(balances: AccountBalance[]): {
  availableMinor: number
  savingsMinor: number
  rateMissing: boolean
} {
  let availableMinor = 0
  let savingsMinor = 0
  let rateMissing = false

  for (const balance of balances) {
    if (!balance.account.isActive) continue
    if (balance.rateMissing) rateMissing = true
    if (balance.account.type === 'savings') {
      savingsMinor += balance.currentBaseMinor
    } else if (balance.account.includeInAvailable) {
      availableMinor += balance.currentBaseMinor
    }
  }

  return { availableMinor, savingsMinor, rateMissing }
}

/** Proxima ocurrencia de una regla recurrente a partir de una fecha. */
export function nextOccurrence(from: Date, frequency: string, intervalDays?: number | null): Date {
  switch (frequency) {
    case 'weekly':
      return new Date(from.getTime() + 7 * 86_400_000)
    case 'yearly':
      return addMonths(from, 12)
    case 'custom':
      return new Date(from.getTime() + Math.max(1, intervalDays ?? 30) * 86_400_000)
    case 'monthly':
    default:
      return addMonths(from, 1)
  }
}

export function isRecurringDue(rule: RecurringRule, now = new Date()): boolean {
  if (!rule.isActive) return false
  return startOfDay(rule.nextRunAt) <= endOfDay(now)
}

export function monthKeyOfDate(date: Date): MonthKey {
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}
