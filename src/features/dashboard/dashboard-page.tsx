import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CreditCard,
  Landmark,
  Mic,
  PiggyBank,
  Plus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TransactionDraft } from '@/domain/models'
import type { CurrencyCode } from '@/domain/money'
import { CURRENCY_CODES, convertMinor, formatMoney, formatPercent } from '@/domain/money'
import {
  availableMoneyBase,
  computeAccountBalances,
  computeBudgetProgress,
  computeCardStates,
  computeCategoryBreakdown,
  computeLoanStates,
  computeMonthSummary,
  computeMonthlySeries,
  computeTotalCardDebtBase,
  computeUpcoming,
  isActiveTransaction,
} from '@/domain/ledger'
import {
  formatDate,
  lastNMonthKeys,
  monthKeyOf,
  monthLabel,
  monthRange,
  relativeDayLabel,
} from '@/lib/date'
import { cn } from '@/lib/utils'
import { useHousehold } from '@/providers/household-provider'
import { useQuickAdd } from '@/providers/quick-add-provider'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { MonthNav } from '@/components/common/month-nav'
import { Select } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { EmptyState } from '@/components/ui/empty-state'
import { Alert } from '@/components/ui/alert'
import { TransactionRow } from '@/features/transactions/transaction-row'
import { VoiceDialog } from '@/features/transactions/voice-dialog'

const CHART_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-chart-6)',
]

function chartMoney(value: number, currency: CurrencyCode): string {
  return formatMoney(value, currency, { compact: true })
}

export function DashboardPage() {
  const {
    household,
    members,
    accounts,
    cards,
    categories,
    budgets,
    loans,
    recurring,
    transactions,
    ctx,
    memberName,
  } = useHousehold()
  const { openQuickAdd } = useQuickAdd()

  const [month, setMonth] = React.useState(() => monthKeyOf(new Date()))
  const [memberId, setMemberId] = React.useState('')
  const [accountId, setAccountId] = React.useState('')
  const [categoryId, setCategoryId] = React.useState('')
  const [voiceOpen, setVoiceOpen] = React.useState(false)

  const range = React.useMemo(() => monthRange(month), [month])

  const filteredTransactions = React.useMemo(() => {
    return transactions.filter((tx) => {
      if (tx.date < range.from || tx.date > range.to) return false
      if (!isActiveTransaction(tx)) return false
      if (memberId && tx.createdBy !== memberId) return false
      if (accountId && tx.accountId !== accountId && tx.toAccountId !== accountId) return false
      if (categoryId && tx.categoryId !== categoryId) return false
      return true
    })
  }, [accountId, categoryId, memberId, range.from, range.to, transactions])

  const summary = React.useMemo(
    () => computeMonthSummary(filteredTransactions),
    [filteredTransactions],
  )
  const balances = React.useMemo(
    () => computeAccountBalances(accounts, transactions, ctx),
    [accounts, ctx, transactions],
  )
  const available = React.useMemo(() => availableMoneyBase(balances), [balances])
  const cardStates = React.useMemo(() => computeCardStates(cards, transactions), [cards, transactions])
  const cardDebt = React.useMemo(() => computeTotalCardDebtBase(cardStates, ctx), [cardStates, ctx])
  const loanStates = React.useMemo(
    () => computeLoanStates(loans, transactions),
    [loans, transactions],
  )
  const loanDebt = React.useMemo(
    () =>
      loanStates.reduce((total, state) => {
        if (state.loan.kind !== 'loan' || state.outstandingMinor <= 0) return total
        const converted =
          state.loan.currency === ctx.baseCurrency
            ? state.outstandingMinor
            : convertMinor(
                state.outstandingMinor,
                state.loan.currency,
                ctx.baseCurrency,
                ctx.fxRates,
                ctx.baseCurrency,
              ) ?? 0
        return total + converted
      }, 0),
    [ctx, loanStates],
  )

  const categoryBreakdown = React.useMemo(
    () => computeCategoryBreakdown(filteredTransactions, categories, 'expense').slice(0, 6),
    [categories, filteredTransactions],
  )

  const series = React.useMemo(() => {
    const reference = new Date(range.from.getFullYear(), range.from.getMonth(), 1)
    const keys = lastNMonthKeys(6, reference)
    return computeMonthlySeries(transactions, keys).map((point) => ({
      ...point,
      label: monthLabel(point.monthKey, { short: true, withYear: false }),
    }))
  }, [range.from, transactions])

  const monthBudgets = React.useMemo(
    () => budgets.filter((budget) => budget.period === month),
    [budgets, month],
  )
  const budgetProgress = React.useMemo(
    () => computeBudgetProgress(monthBudgets, transactions, categories, ctx),
    [categories, ctx, monthBudgets, transactions],
  )
  const budgetChartData = React.useMemo(
    () =>
      budgetProgress.slice(0, 6).map((item) => ({
        name: item.categoryName,
        gastado: item.spentMinor,
        presupuesto: item.spentMinor + item.remainingMinor,
        over: item.isOverBudget,
      })),
    [budgetProgress],
  )

  const upcoming = React.useMemo(
    () => computeUpcoming(recurring, loanStates, cardStates),
    [cardStates, loanStates, recurring],
  )

  const recent = React.useMemo(
    () =>
      [...filteredTransactions]
        .filter((tx) => isActiveTransaction(tx))
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 8),
    [filteredTransactions],
  )

  const expensesByCategory = React.useMemo(
    () =>
      categoryBreakdown.map((item, index) => ({
        ...item,
        fill: item.color ?? CHART_COLORS[index % CHART_COLORS.length],
      })),
    [categoryBreakdown],
  )

  const handleVoiceConfirm = (draft: TransactionDraft) => {
    setVoiceOpen(false)
    openQuickAdd({
      initial: {
        type: draft.type,
        date: draft.date,
        description: draft.description,
        amountMinor: draft.amountMinor,
        currency: draft.currency,
        categoryId: draft.categoryId,
        accountId: draft.accountId,
        toAccountId: draft.toAccountId,
        cardId: draft.cardId,
        loanId: draft.loanId,
        notes: draft.notes,
        entryMethod: 'voice',
        rawTranscript: draft.rawTranscript,
      },
    })
  }

  const memberOptions = members.map((member) => ({
    id: member.uid,
    name: member.displayName,
  }))
  const accountOptions = accounts.filter((account) => account.isActive)
  const categoryOptions = categories.filter((category) => !category.isArchived)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Panel del hogar"
        description={`${household?.name ?? 'Mi hogar'} · ${monthLabel(month)}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setVoiceOpen(true)}>
              <Mic />
              <span className="hidden sm:inline">Por voz</span>
            </Button>
            <Button onClick={() => openQuickAdd()}>
              <Plus />
              Nuevo movimiento
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <MonthNav value={month} onChange={setMonth} />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Select
              aria-label="Filtrar por integrante"
              className="h-9"
              value={memberId}
              onChange={(event) => setMemberId(event.target.value)}
            >
              <option value="">Todo el hogar</option>
              {memberOptions.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filtrar por cuenta"
              className="h-9"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              <option value="">Todas las cuentas</option>
              {accountOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filtrar por categoría"
              className="col-span-2 h-9 sm:col-span-1"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">Todas las categorías</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.parentId ? '— ' : ''}
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      {summary.pendingCount > 0 ? (
        <Alert
          variant="warning"
          title={`${summary.pendingCount} movimiento(s) pendiente(s)`}
          action={
            <Link to="/app/movimientos" className="text-xs font-medium text-primary underline">
              Revisar
            </Link>
          }
        >
          Hay borradores por {formatMoney(summary.pendingAmountMinor, ctx.baseCurrency)} que todavía no
          afectan los saldos. Confirmalos o editalos desde Movimientos.
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <StatCard
          label="Ingresos"
          value={formatMoney(summary.incomeMinor, ctx.baseCurrency)}
          icon={<TrendingUp />}
          tone="positive"
          hint={monthLabel(month)}
        />
        <StatCard
          label="Gastos"
          value={formatMoney(summary.expenseMinor, ctx.baseCurrency)}
          icon={<TrendingDown />}
          tone="negative"
          hint={`${summary.transactionCount} movimiento(s)`}
        />
        <StatCard
          label="Balance del mes"
          value={formatMoney(summary.balanceMinor, ctx.baseCurrency)}
          icon={<Wallet />}
          tone={summary.balanceMinor >= 0 ? 'positive' : 'negative'}
          hint="Ingresos menos gastos"
        />
        <StatCard
          label="Dinero disponible"
          value={formatMoney(available.availableMinor, ctx.baseCurrency)}
          icon={<PiggyBank />}
          tone="default"
          hint={available.rateMissing ? 'Falta una cotización' : 'Cuentas incluidas'}
        />
        <StatCard
          label="Deuda de tarjetas"
          value={formatMoney(cardDebt, ctx.baseCurrency)}
          icon={<CreditCard />}
          tone={cardDebt > 0 ? 'warning' : 'muted'}
          hint={`${cardStates.filter((state) => state.debtMinor > 0).length} tarjeta(s) con saldo`}
        />
        <StatCard
          label="Préstamos"
          value={formatMoney(loanDebt, ctx.baseCurrency)}
          icon={<Landmark />}
          tone={loanDebt > 0 ? 'warning' : 'muted'}
          hint="Capital pendiente"
        />
        <StatCard
          label="Ahorros"
          value={formatMoney(available.savingsMinor, ctx.baseCurrency)}
          icon={<PiggyBank />}
          tone="positive"
          hint="Cuentas de ahorro"
        />
        <StatCard
          label="Pagos de deuda"
          value={formatMoney(summary.debtPaymentsMinor, ctx.baseCurrency)}
          icon={<CreditCard />}
          tone="muted"
          hint="No cuentan como gasto"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gastos por categoría</CardTitle>
            <CardDescription>Distribución de {monthLabel(month)}.</CardDescription>
          </CardHeader>
          <CardContent>
            {expensesByCategory.length === 0 ? (
              <EmptyState
                icon={<TrendingDown />}
                title="Sin gastos este mes"
                description="Cuando registres gastos vas a ver la distribución por categoría."
              />
            ) : (
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                <div className="h-52 w-full sm:w-1/2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expensesByCategory}
                        dataKey="amountMinor"
                        nameKey="name"
                        innerRadius={48}
                        outerRadius={80}
                        paddingAngle={2}
                        strokeWidth={0}
                      >
                        {expensesByCategory.map((item) => (
                          <Cell key={item.categoryId ?? item.name} fill={item.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) =>
                          formatMoney(Number(value ?? 0), ctx.baseCurrency)
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="w-full space-y-1.5 sm:w-1/2">
                  {expensesByCategory.map((item) => (
                    <li key={item.categoryId ?? item.name} className="flex items-center gap-2 text-sm">
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: item.fill }}
                      />
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatPercent(item.share)}
                      </span>
                      <span className="tabular-nums">
                        {formatMoney(item.amountMinor, ctx.baseCurrency, { compact: true })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evolución mensual</CardTitle>
            <CardDescription>Últimos 6 meses hasta {monthLabel(month)}.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis
                    width={48}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => chartMoney(Number(value), ctx.baseCurrency)}
                  />
                  <Tooltip
                    formatter={(value) => formatMoney(Number(value ?? 0), ctx.baseCurrency)}
                  />
                  <Legend />
                  <Bar dataKey="incomeMinor" name="Ingresos" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenseMinor" name="Gastos" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle>Presupuesto vs. real</CardTitle>
                <CardDescription>Comparación del mes seleccionado.</CardDescription>
              </div>
              <Link
                to="/app/presupuestos"
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0')}
              >
                Ver todo
                <ArrowRight />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {budgetProgress.length === 0 ? (
              <EmptyState
                icon={<PiggyBank />}
                title="Sin presupuestos para este mes"
                description="Creá presupuestos por categoría para comparar con tus gastos reales."
                action={
                  <Link to="/app/presupuestos" className={buttonVariants({ size: 'sm' })}>
                    Crear presupuesto
                  </Link>
                }
              />
            ) : (
              <div className="space-y-3">
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={budgetChartData}
                      layout="vertical"
                      margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                      <XAxis
                        type="number"
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => chartMoney(Number(value), ctx.baseCurrency)}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={96}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        formatter={(value) => formatMoney(Number(value ?? 0), ctx.baseCurrency)}
                      />
                      <Legend />
                      <Bar dataKey="presupuesto" name="Presupuesto" fill="var(--color-chart-3)" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="gastado" name="Gastado" fill="var(--color-chart-2)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {budgetProgress.slice(0, 4).map((item) => (
                  <div key={item.budget.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium">{item.categoryName}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatMoney(item.spentMinor, ctx.baseCurrency, { compact: true })} /{' '}
                        {formatMoney(item.spentMinor + item.remainingMinor, ctx.baseCurrency, {
                          compact: true,
                        })}
                      </span>
                    </div>
                    <Progress value={item.ratio * 100} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximos vencimientos</CardTitle>
            <CardDescription>Recurrentes, cuotas y tarjetas.</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <EmptyState
                icon={<CalendarClock />}
                title="Nada por vencer"
                description="No hay cuotas, tarjetas ni recurrentes con vencimiento cercano."
              />
            ) : (
              <ul className="divide-y divide-border">
                {upcoming.slice(0, 6).map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-2.5">
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-full',
                        item.overdue
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-primary/10 text-primary',
                      )}
                    >
                      {item.kind === 'card' ? (
                        <CreditCard className="size-4" />
                      ) : item.kind === 'recurring' ? (
                        <Sparkles className="size-4" />
                      ) : (
                        <Landmark className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {relativeDayLabel(item.dueDate)} · {formatDate(item.dueDate)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatMoney(item.amountMinor, item.currency, { compact: true })}
                      </p>
                      {item.overdue ? <Badge variant="destructive">Vencido</Badge> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>Movimientos recientes</CardTitle>
              <CardDescription>Los últimos registros de {monthLabel(month)}.</CardDescription>
            </div>
            <Link
              to="/app/movimientos"
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0')}
            >
              Ver todos
              <ArrowRight />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-2 sm:p-3">
          {recent.length === 0 ? (
            <EmptyState
              icon={<Wallet />}
              title="Todavía no hay movimientos"
              description="Registrá el primer gasto, ingreso o transferencia del mes."
              action={
                <Button size="sm" onClick={() => openQuickAdd()}>
                  <Plus />
                  Nuevo movimiento
                </Button>
              }
            />
          ) : (
            <div className="divide-y divide-border">
              {recent.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  transaction={tx}
                  baseCurrency={ctx.baseCurrency}
                  category={categories.find((category) => category.id === tx.categoryId) ?? null}
                  account={accounts.find((account) => account.id === tx.accountId) ?? null}
                  toAccount={accounts.find((account) => account.id === tx.toAccountId) ?? null}
                  card={cards.find((card) => card.id === tx.cardId) ?? null}
                  memberName={memberName(tx.createdBy)}
                  onClick={() => openQuickAdd({ transaction: tx })}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-2.5 sm:grid-cols-3">
        <Link to="/app/movimientos" className={cn(buttonVariants({ variant: 'outline' }), 'justify-between')}>
          <span className="flex items-center gap-2">
            <ArrowUpRight className="size-4" />
            Movimientos
          </span>
          <span className="text-xs text-muted-foreground">
            {formatMoney(summary.incomeMinor - summary.expenseMinor, ctx.baseCurrency, {
              compact: true,
              explicitSign: true,
            })}
          </span>
        </Link>
        <Link to="/app/tarjetas" className={cn(buttonVariants({ variant: 'outline' }), 'justify-between')}>
          <span className="flex items-center gap-2">
            <CreditCard className="size-4" />
            Tarjetas
          </span>
          <span className="text-xs text-muted-foreground">
            {formatMoney(cardDebt, ctx.baseCurrency, { compact: true })}
          </span>
        </Link>
        <Link to="/app/prestamos" className={cn(buttonVariants({ variant: 'outline' }), 'justify-between')}>
          <span className="flex items-center gap-2">
            <Landmark className="size-4" />
            Préstamos
          </span>
          <span className="text-xs text-muted-foreground">
            {formatMoney(loanDebt, ctx.baseCurrency, { compact: true })}
          </span>
        </Link>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        {CURRENCY_CODES.join(' · ')} · Los saldos se calculan con movimientos confirmados.
      </p>

      <VoiceDialog open={voiceOpen} onOpenChange={setVoiceOpen} onConfirm={handleVoiceConfirm} />
    </div>
  )
}
