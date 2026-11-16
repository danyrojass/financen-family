import * as React from 'react'
import { Download, FileSpreadsheet, FilterX, Search } from 'lucide-react'
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Transaction } from '@/domain/models'
import { formatMoney, formatPercent } from '@/domain/money'
import { computeCategoryBreakdown, computeMonthSummary, computeMonthlySeries, isActiveTransaction } from '@/domain/ledger'
import { fetchTransactionsInRange, fetchTransactionsPage } from '@/data/transactions'
import { buildTransactionExportTable, downloadCsv, downloadXlsx, exportFilename } from '@/lib/export'
import { endOfMonth, formatDate, lastNMonthKeys, monthKeyOf, monthLabel, startOfMonth, toDateInput, fromDateInput } from '@/lib/date'
import { TRANSACTION_TYPE_LABELS } from '@/lib/labels'
import { errorMessage } from '@/lib/errors'
import { useHousehold } from '@/providers/household-provider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { Input, Select } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { TransactionRow } from '@/features/transactions/transaction-row'
import { cn } from '@/lib/utils'

const CHART_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-chart-6)',
]

type QuickRange = 'this-month' | 'last-month' | 'last-3' | 'this-year'

function quickRangeDates(range: QuickRange): { from: Date; to: Date } {
  const now = new Date()
  if (range === 'last-month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return { from: start, to: endOfMonth(start) }
  }
  if (range === 'last-3') {
    return {
      from: new Date(now.getFullYear(), now.getMonth() - 2, 1),
      to: endOfMonth(now),
    }
  }
  if (range === 'this-year') {
    return { from: new Date(now.getFullYear(), 0, 1), to: endOfMonth(now) }
  }
  return { from: startOfMonth(now), to: endOfMonth(now) }
}

export function ReportsPage() {
  const { householdId, members, accounts, cards, categories, ctx, actor } = useHousehold()
  const { toast } = useToast()

  const initial = React.useMemo(() => quickRangeDates('this-month'), [])

  const [fromInput, setFromInput] = React.useState(() => toDateInput(initial.from))
  const [toInput, setToInput] = React.useState(() => toDateInput(initial.to))
  const [type, setType] = React.useState('')
  const [accountId, setAccountId] = React.useState('')
  const [categoryId, setCategoryId] = React.useState('')
  const [memberId, setMemberId] = React.useState('')
  const [status, setStatus] = React.useState<'all' | 'confirmed' | 'pending'>('all')

  const [items, setItems] = React.useState<Transaction[]>([])
  const [cursor, setCursor] = React.useState<QueryDocumentSnapshot<DocumentData> | null>(null)
  const [hasMore, setHasMore] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [exporting, setExporting] = React.useState(false)

  const range = React.useMemo(() => {
    const from = fromDateInput(fromInput) ?? startOfMonth(new Date())
    const to = fromDateInput(toInput) ?? endOfMonth(new Date())
    if (from > to) return { from: to, to: from }
    from.setHours(0, 0, 0, 0)
    to.setHours(23, 59, 59, 999)
    return { from, to }
  }, [fromInput, toInput])

  const applyQuickRange = (value: QuickRange) => {
    const next = quickRangeDates(value)
    setFromInput(toDateInput(next.from))
    setToInput(toDateInput(next.to))
  }

  React.useEffect(() => {
    if (!householdId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchTransactionsPage({ householdId, from: range.from, to: range.to, pageSize: 100 })
      .then((page) => {
        if (cancelled) return
        setItems(page.items)
        setCursor(page.cursor)
        setHasMore(page.hasMore)
      })
      .catch((fetchError: unknown) => {
        if (!cancelled) setError(errorMessage(fetchError))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [householdId, range.from, range.to])

  const loadMore = async () => {
    if (!householdId || !cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await fetchTransactionsPage({
        householdId,
        from: range.from,
        to: range.to,
        pageSize: 100,
        cursor,
      })
      setItems((current) => [...current, ...page.items])
      setCursor(page.cursor)
      setHasMore(page.hasMore)
    } catch (fetchError) {
      toast({ title: 'No se pudo cargar más', description: errorMessage(fetchError), variant: 'error' })
    } finally {
      setLoadingMore(false)
    }
  }

  const filtered = React.useMemo(() => {
    return items.filter((tx) => {
      if (!isActiveTransaction(tx)) return false
      if (status !== 'all' && tx.status !== status) return false
      if (type && tx.type !== type) return false
      if (accountId && tx.accountId !== accountId && tx.toAccountId !== accountId) return false
      if (categoryId && tx.categoryId !== categoryId) return false
      if (memberId && tx.createdBy !== memberId) return false
      return true
    })
  }, [accountId, categoryId, items, memberId, status, type])

  const summary = React.useMemo(() => computeMonthSummary(filtered), [filtered])
  const breakdown = React.useMemo(() => {
    const data = computeCategoryBreakdown(filtered, categories, 'expense').slice(0, 6)
    return data.map((item, index) => ({
      ...item,
      fill: item.color ?? CHART_COLORS[index % CHART_COLORS.length],
    }))
  }, [categories, filtered])

  const series = React.useMemo(() => {
    const keys: string[] = []
    const start = new Date(range.from.getFullYear(), range.from.getMonth(), 1)
    const end = new Date(range.to.getFullYear(), range.to.getMonth(), 1)
    const guard = 36
    let cursorDate = start
    let count = 0
    while (cursorDate <= end && count < guard) {
      keys.push(monthKeyOf(cursorDate))
      cursorDate = new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 1, 1)
      count += 1
    }
    const safeKeys = keys.length > 0 ? keys : lastNMonthKeys(6)
    return computeMonthlySeries(filtered, safeKeys).map((point) => ({
      ...point,
      label: monthLabel(point.monthKey, { short: true, withYear: false }),
    }))
  }, [filtered, range.from, range.to])

  const hasFilters = Boolean(type || accountId || categoryId || memberId) || status !== 'all'

  const clearFilters = () => {
    setType('')
    setAccountId('')
    setCategoryId('')
    setMemberId('')
    setStatus('all')
  }

  const exportData = async (format: 'csv' | 'xlsx') => {
    if (!householdId) return
    setExporting(true)
    try {
      const all = await fetchTransactionsInRange({
        householdId,
        from: range.from,
        to: range.to,
        max: 5000,
      })
      const rows = all
        .filter((tx) => isActiveTransaction(tx))
        .filter((tx) => {
          if (status !== 'all' && tx.status !== status) return false
          if (type && tx.type !== type) return false
          if (accountId && tx.accountId !== accountId && tx.toAccountId !== accountId) return false
          if (categoryId && tx.categoryId !== categoryId) return false
          if (memberId && tx.createdBy !== memberId) return false
          return true
        })
      if (rows.length === 0) {
        toast({ title: 'Sin movimientos para exportar', variant: 'warning' })
        return
      }
      const table = buildTransactionExportTable(rows, { categories, accounts, cards, members }, ctx.baseCurrency)
      const filename = exportFilename('movimientos', range.from, range.to, format)
      if (format === 'csv') downloadCsv(filename, table)
      else await downloadXlsx(filename, table)
      toast({ title: 'Exportación lista', description: `${rows.length} movimiento(s) en ${format.toUpperCase()}.`, variant: 'success' })
    } catch (exportError) {
      toast({ title: 'No se pudo exportar', description: errorMessage(exportError), variant: 'error' })
    } finally {
      setExporting(false)
    }
  }

  const categoryById = React.useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories])
  const accountById = React.useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts])
  const cardById = React.useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Informes"
        description="Analizá cualquier período y exportá los movimientos."
        actions={
          <>
            <Button variant="outline" loading={exporting} onClick={() => void exportData('csv')}>
              <Download />
              CSV
            </Button>
            <Button variant="outline" loading={exporting} onClick={() => void exportData('xlsx')}>
              <FileSpreadsheet />
              Excel
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="report-from">Desde</Label>
              <Input
                id="report-from"
                type="date"
                value={fromInput}
                onChange={(event) => setFromInput(event.target.value)}
                className="h-9 w-40"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="report-to">Hasta</Label>
              <Input
                id="report-to"
                type="date"
                value={toInput}
                onChange={(event) => setToInput(event.target.value)}
                className="h-9 w-40"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button variant="secondary" size="sm" onClick={() => applyQuickRange('this-month')}>
                Este mes
              </Button>
              <Button variant="secondary" size="sm" onClick={() => applyQuickRange('last-month')}>
                Mes pasado
              </Button>
              <Button variant="secondary" size="sm" onClick={() => applyQuickRange('last-3')}>
                Últimos 3 meses
              </Button>
              <Button variant="secondary" size="sm" onClick={() => applyQuickRange('this-year')}>
                Este año
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Select aria-label="Tipo" value={type} onChange={(event) => setType(event.target.value)}>
              <option value="">Todos los tipos</option>
              {Object.entries(TRANSACTION_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select aria-label="Estado" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
              <option value="all">Todos los estados</option>
              <option value="confirmed">Confirmados</option>
              <option value="pending">Pendientes</option>
            </Select>
            <Select aria-label="Cuenta" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              <option value="">Todas las cuentas</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
            <Select aria-label="Categoría" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Todas las categorías</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.parentId ? '— ' : ''}
                  {category.name}
                </option>
              ))}
            </Select>
            <Select aria-label="Integrante" value={memberId} onChange={(event) => setMemberId(event.target.value)}>
              <option value="">Todo el hogar</option>
              {members.map((member) => (
                <option key={member.uid} value={member.uid}>
                  {member.displayName}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {formatDate(range.from)} – {formatDate(range.to)} · {filtered.length} de {items.length} movimiento(s) cargados
            </p>
            {hasFilters ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <FilterX />
                Limpiar filtros
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <StatCard label="Ingresos" value={formatMoney(summary.incomeMinor, ctx.baseCurrency)} tone="positive" />
        <StatCard label="Gastos" value={formatMoney(summary.expenseMinor, ctx.baseCurrency)} tone="negative" />
        <StatCard
          label="Balance"
          value={formatMoney(summary.balanceMinor, ctx.baseCurrency)}
          tone={summary.balanceMinor >= 0 ? 'positive' : 'negative'}
        />
        <StatCard
          label="Ahorro neto"
          value={formatMoney(summary.savingsMinor, ctx.baseCurrency)}
          tone="muted"
          hint={`${summary.debtPaymentsMinor > 0 ? 'Incluye pagos de deuda' : 'Aportes menos retiros'}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gastos por categoría</CardTitle>
            <CardDescription>Período seleccionado.</CardDescription>
          </CardHeader>
          <CardContent>
            {breakdown.length === 0 ? (
              <EmptyState icon={<Search />} title="Sin gastos en el período" />
            ) : (
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                <div className="h-52 w-full sm:w-1/2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={breakdown} dataKey="amountMinor" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2} strokeWidth={0}>
                        {breakdown.map((item) => (
                          <Cell key={item.categoryId ?? item.name} fill={item.fill} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatMoney(Number(value ?? 0), ctx.baseCurrency)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="w-full space-y-1.5 sm:w-1/2">
                  {breakdown.map((item) => (
                    <li key={item.categoryId ?? item.name} className="flex items-center gap-2 text-sm">
                      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.fill }} />
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      <span className="text-xs text-muted-foreground">{formatPercent(item.share)}</span>
                      <span className="tabular-nums">{formatMoney(item.amountMinor, ctx.baseCurrency, { compact: true })}</span>
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
            <CardDescription>Ingresos y gastos del período.</CardDescription>
          </CardHeader>
          <CardContent>
            {series.length === 0 ? (
              <EmptyState title="Sin datos" />
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis width={48} tickLine={false} axisLine={false} tickFormatter={(value) => formatMoney(Number(value), ctx.baseCurrency, { compact: true })} />
                    <Tooltip formatter={(value) => formatMoney(Number(value ?? 0), ctx.baseCurrency)} />
                    <Legend />
                    <Bar dataKey="incomeMinor" name="Ingresos" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenseMinor" name="Gastos" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Movimientos del período</CardTitle>
          <CardDescription>Los filtros no cambian los importes exportados.</CardDescription>
        </CardHeader>
        <CardContent className="p-2 sm:p-3">
          {loading ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Search />}
              title="Sin movimientos en el período"
              description="Probá ampliar el rango de fechas o limpiar los filtros."
            />
          ) : (
            <div className="divide-y divide-border">
              {filtered.slice(0, 200).map((tx) => (
                <TransactionRow
                  key={tx.id}
                  transaction={tx}
                  baseCurrency={ctx.baseCurrency}
                  showDate
                  category={tx.categoryId ? categoryById.get(tx.categoryId) ?? null : null}
                  account={tx.accountId ? accountById.get(tx.accountId) ?? null : null}
                  toAccount={tx.toAccountId ? accountById.get(tx.toAccountId) ?? null : null}
                  card={tx.cardId ? cardById.get(tx.cardId) ?? null : null}
                  memberName={members.find((member) => member.uid === tx.createdBy)?.displayName}
                />
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {filtered.length > 200
                ? `Mostrando 200 de ${filtered.length}. Exportá para ver todos.`
                : `${filtered.length} movimiento(s).`}
            </p>
            {hasMore ? (
              <Button variant="outline" size="sm" loading={loadingMore} onClick={() => void loadMore()}>
                Cargar más
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <p className={cn('text-center text-[11px] text-muted-foreground')}>
        {actor ? `Sesión de ${actor.displayName} · ` : ''}
        Los informes usan movimientos confirmados para los totales. Exportación en {ctx.baseCurrency}.
      </p>
    </div>
  )
}
