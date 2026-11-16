import * as React from 'react'
import {
  CheckCircle2,
  FilterX,
  History,
  Mic,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react'
import type { Transaction, TransactionAudit, TransactionDraft } from '@/domain/models'
import { formatMoney } from '@/domain/money'
import { computeMonthSummary } from '@/domain/ledger'
import {
  formatDate,
  formatDateTime,
  monthKeyOf,
  monthLabel,
  monthRange,
  relativeDayLabel,
  toDateInput,
} from '@/lib/date'
import { TRANSACTION_TYPE_LABELS } from '@/lib/labels'
import { errorMessage } from '@/lib/errors'
import {
  fetchTransactionAudit,
  markTransactionConfirmed,
  restoreTransaction,
  softDeleteTransaction,
} from '@/data/transactions'
import { useHousehold } from '@/providers/household-provider'
import { useQuickAdd } from '@/providers/quick-add-provider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { MonthNav } from '@/components/common/month-nav'
import { Input, Select } from '@/components/ui/input'
import { SwitchField } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert } from '@/components/ui/alert'
import { TransactionTypeIcon } from '@/components/common/transaction-type-icon'
import { TransactionRow } from './transaction-row'
import { VoiceDialog } from './voice-dialog'

type StatusFilter = 'all' | 'confirmed' | 'pending'

const AUDIT_LABELS: Record<TransactionAudit['action'], string> = {
  created: 'Creado',
  updated: 'Actualizado',
  deleted: 'Eliminado',
  restored: 'Restaurado',
}

export function TransactionsPage() {
  const {
    householdId,
    members,
    accounts,
    cards,
    categories,
    transactions,
    ctx,
    actor,
    memberName,
  } = useHousehold()
  const { openQuickAdd } = useQuickAdd()
  const { toast } = useToast()

  const [month, setMonth] = React.useState(() => monthKeyOf(new Date()))
  const [search, setSearch] = React.useState('')
  const [type, setType] = React.useState('')
  const [accountId, setAccountId] = React.useState('')
  const [categoryId, setCategoryId] = React.useState('')
  const [memberId, setMemberId] = React.useState('')
  const [status, setStatus] = React.useState<StatusFilter>('all')
  const [includeDeleted, setIncludeDeleted] = React.useState(false)
  const [voiceOpen, setVoiceOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<Transaction | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Transaction | null>(null)
  const [audit, setAudit] = React.useState<TransactionAudit[]>([])
  const [auditLoading, setAuditLoading] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const range = React.useMemo(() => monthRange(month), [month])

  const categoryById = React.useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  )
  const accountById = React.useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  )
  const cardById = React.useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards])

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    return transactions
      .filter((tx) => {
        if (tx.date < range.from || tx.date > range.to) return false
        if (!includeDeleted && tx.deletedAt) return false
        if (status !== 'all' && tx.status !== status) return false
        if (type && tx.type !== type) return false
        if (accountId && tx.accountId !== accountId && tx.toAccountId !== accountId) return false
        if (categoryId && tx.categoryId !== categoryId) return false
        if (memberId && tx.createdBy !== memberId) return false
        if (term) {
          const category = tx.categoryId ? categoryById.get(tx.categoryId) : null
          const account = tx.accountId ? accountById.get(tx.accountId) : null
          const card = tx.cardId ? cardById.get(tx.cardId) : null
          const haystack = [
            tx.description,
            tx.notes ?? '',
            category?.name ?? '',
            account?.name ?? '',
            card?.name ?? '',
            tx.createdByName,
          ]
            .join(' ')
            .toLowerCase()
          if (!haystack.includes(term)) return false
        }
        return true
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime())
  }, [
    accountById,
    accountId,
    cardById,
    categoryById,
    categoryId,
    includeDeleted,
    memberId,
    range.from,
    range.to,
    search,
    status,
    transactions,
    type,
  ])

  const summary = React.useMemo(() => computeMonthSummary(filtered), [filtered])

  const grouped = React.useMemo(() => {
    const groups = new Map<string, Transaction[]>()
    for (const tx of filtered) {
      const key = toDateInput(tx.date)
      const bucket = groups.get(key)
      if (bucket) bucket.push(tx)
      else groups.set(key, [tx])
    }
    return [...groups.entries()]
  }, [filtered])

  React.useEffect(() => {
    if (!selected || !householdId) {
      setAudit([])
      return
    }
    let cancelled = false
    setAuditLoading(true)
    void fetchTransactionAudit(householdId, selected.id)
      .then((entries) => {
        if (!cancelled) setAudit(entries)
      })
      .catch((auditError: unknown) => {
        if (!cancelled) toast({ title: 'No se pudo cargar el historial', description: errorMessage(auditError), variant: 'error' })
      })
      .finally(() => {
        if (!cancelled) setAuditLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [householdId, selected, toast])

  const selectedCategory = selected?.categoryId ? categoryById.get(selected.categoryId) : null
  const selectedAccount = selected?.accountId ? accountById.get(selected.accountId) : null
  const selectedCard = selected?.cardId ? cardById.get(selected.cardId) : null

  const handleConfirmPending = async () => {
    if (!householdId || !actor || !selected) return
    setBusy(true)
    try {
      await markTransactionConfirmed({
        householdId,
        transactionId: selected.id,
        actor,
      })
      toast({ title: 'Movimiento confirmado', description: 'Ya afecta los saldos.', variant: 'success' })
      setSelected(null)
    } catch (confirmError) {
      toast({ title: 'No se pudo confirmar', description: errorMessage(confirmError), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!householdId || !actor || !deleteTarget) return
    setBusy(true)
    try {
      await softDeleteTransaction({
        householdId,
        transactionId: deleteTarget.id,
        actor,
      })
      toast({ title: 'Movimiento eliminado', description: 'Se puede restaurar desde el historial.', variant: 'success' })
      setDeleteTarget(null)
      setSelected(null)
    } catch (deleteError) {
      toast({ title: 'No se pudo eliminar', description: errorMessage(deleteError), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const handleRestore = async () => {
    if (!householdId || !actor || !selected) return
    setBusy(true)
    try {
      await restoreTransaction({ householdId, transactionId: selected.id, actor })
      toast({ title: 'Movimiento restaurado', variant: 'success' })
      setSelected(null)
    } catch (restoreError) {
      toast({ title: 'No se pudo restaurar', description: errorMessage(restoreError), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

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

  const clearFilters = () => {
    setSearch('')
    setType('')
    setAccountId('')
    setCategoryId('')
    setMemberId('')
    setStatus('all')
    setIncludeDeleted(false)
  }

  const hasFilters =
    Boolean(search || type || accountId || categoryId || memberId) ||
    status !== 'all' ||
    includeDeleted

  return (
    <div className="space-y-4">
      <PageHeader
        title="Movimientos"
        description="Gastos, ingresos, transferencias, tarjetas y préstamos del hogar."
        actions={
          <>
            <Button variant="outline" onClick={() => setVoiceOpen(true)}>
              <Mic />
              <span className="hidden sm:inline">Por voz</span>
            </Button>
            <Button onClick={() => openQuickAdd()}>Nuevo movimiento</Button>
          </>
        }
      />

      <Card>
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <MonthNav value={month} onChange={setMonth} />
            <div className="grid grid-cols-3 gap-2 text-center sm:flex sm:gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Ingresos</p>
                <p className="text-sm font-semibold tabular-nums text-success">
                  {formatMoney(summary.incomeMinor, ctx.baseCurrency, { compact: true })}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Gastos</p>
                <p className="text-sm font-semibold tabular-nums text-destructive">
                  {formatMoney(summary.expenseMinor, ctx.baseCurrency, { compact: true })}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Balance</p>
                <p className="text-sm font-semibold tabular-nums">
                  {formatMoney(summary.balanceMinor, ctx.baseCurrency, { compact: true })}
                </p>
              </div>
            </div>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por descripción, nota, categoría, cuenta…"
              className="pl-9"
              aria-label="Buscar movimientos"
            />
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
            <Select
              aria-label="Estado"
              value={status}
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
            >
              <option value="all">Todos los estados</option>
              <option value="confirmed">Confirmados</option>
              <option value="pending">Pendientes</option>
            </Select>
            <Select
              aria-label="Cuenta"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              <option value="">Todas las cuentas</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Categoría"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">Todas las categorías</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.parentId ? '— ' : ''}
                  {category.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Integrante"
              value={memberId}
              onChange={(event) => setMemberId(event.target.value)}
            >
              <option value="">Todo el hogar</option>
              {members.map((member) => (
                <option key={member.uid} value={member.uid}>
                  {member.displayName}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="w-full sm:max-w-xs">
              <SwitchField
                checked={includeDeleted}
                onCheckedChange={setIncludeDeleted}
                label="Mostrar eliminados"
                description="Los eliminados no afectan saldos."
              />
            </div>
            {hasFilters ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <FilterX />
                Limpiar
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {filtered.length} movimiento(s) · {monthLabel(month)}
        </span>
        {summary.pendingCount > 0 ? (
          <Badge variant="warning">{summary.pendingCount} pendiente(s)</Badge>
        ) : null}
      </div>

      {grouped.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="No hay movimientos para mostrar"
          description={
            hasFilters
              ? 'Probá cambiar los filtros o el mes seleccionado.'
              : 'Registrá el primer movimiento del mes para empezar.'
          }
          action={
            hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                <FilterX />
                Limpiar filtros
              </Button>
            ) : (
              <Button onClick={() => openQuickAdd()}>Nuevo movimiento</Button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {grouped.map(([day, items]) => (
            <Card key={day}>
              <div className="flex items-center justify-between border-b border-border px-3 py-2 sm:px-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {relativeDayLabel(new Date(`${day}T00:00:00`))}
                </p>
                <p className="text-[11px] text-muted-foreground">{formatDate(new Date(`${day}T00:00:00`))}</p>
              </div>
              <CardContent className="divide-y divide-border p-2 sm:p-2.5">
                {items.map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    transaction={tx}
                    baseCurrency={ctx.baseCurrency}
                    category={tx.categoryId ? categoryById.get(tx.categoryId) ?? null : null}
                    account={tx.accountId ? accountById.get(tx.accountId) ?? null : null}
                    toAccount={tx.toAccountId ? accountById.get(tx.toAccountId) ?? null : null}
                    card={tx.cardId ? cardById.get(tx.cardId) ?? null : null}
                    memberName={memberName(tx.createdBy)}
                    onClick={() => setSelected(tx)}
                  />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        variant="sheet"
        title={selected?.description ?? 'Detalle del movimiento'}
        description={selected ? TRANSACTION_TYPE_LABELS[selected.type] : undefined}
        footer={
          selected ? (
            <>
              {selected.deletedAt ? (
                <Button variant="outline" loading={busy} onClick={() => void handleRestore()}>
                  <RotateCcw />
                  Restaurar
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  onClick={() => setDeleteTarget(selected)}
                  disabled={busy}
                >
                  <Trash2 />
                  Eliminar
                </Button>
              )}
              {selected.status === 'pending' && !selected.deletedAt ? (
                <Button variant="success" loading={busy} onClick={() => void handleConfirmPending()}>
                  <CheckCircle2 />
                  Confirmar
                </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={() => {
                  if (!selected) return
                  setSelected(null)
                  openQuickAdd({ transaction: selected })
                }}
                disabled={Boolean(selected.deletedAt)}
              >
                <Pencil />
                Editar
              </Button>
            </>
          ) : null
        }
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <TransactionTypeIcon type={selected.type} />
              <div className="min-w-0 flex-1">
                <p className="text-2xl font-semibold tabular-nums">
                  {formatMoney(selected.amountMinor, selected.currency, { explicitSign: selected.type === 'adjustment' })}
                </p>
                {selected.currency !== ctx.baseCurrency ? (
                  <p className="text-xs text-muted-foreground">
                    Equivale a {formatMoney(selected.baseAmountMinor, ctx.baseCurrency)} (tasa{' '}
                    {selected.fxRate.toLocaleString('es-PY')})
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant={selected.status === 'confirmed' ? 'success' : 'warning'}>
                  {selected.status === 'confirmed' ? 'Confirmado' : 'Pendiente'}
                </Badge>
                {selected.entryMethod === 'voice' ? (
                  <Badge variant="outline">
                    <Mic className="size-3" /> Voz
                  </Badge>
                ) : null}
                {selected.recurringId ? <Badge variant="outline">Recurrente</Badge> : null}
              </div>
            </div>

            {selected.deletedAt ? (
              <Alert variant="warning" title="Movimiento eliminado">
                Eliminado el {formatDateTime(selected.deletedAt)}. No afecta los saldos. Podés
                restaurarlo si fue un error.
              </Alert>
            ) : null}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Fecha</dt>
                <dd className="font-medium">{formatDate(selected.date, 'long')}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Categoría</dt>
                <dd className="font-medium">{selectedCategory?.name ?? 'Sin categoría'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Cuenta</dt>
                <dd className="font-medium">{selectedAccount?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Tarjeta</dt>
                <dd className="font-medium">{selectedCard?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Registrado por</dt>
                <dd className="font-medium">{memberName(selected.createdBy)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Cuotas</dt>
                <dd className="font-medium">
                  {selected.installmentCount && selected.installmentIndex
                    ? `${selected.installmentIndex} de ${selected.installmentCount}`
                    : '—'}
                </dd>
              </div>
              {selected.type === 'loan_payment' ? (
                <>
                  <div>
                    <dt className="text-xs text-muted-foreground">Capital</dt>
                    <dd className="font-medium tabular-nums">
                      {selected.principalMinor != null
                        ? formatMoney(selected.principalMinor, selected.currency)
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Interés</dt>
                    <dd className="font-medium tabular-nums">
                      {selected.interestMinor != null
                        ? formatMoney(selected.interestMinor, selected.currency)
                        : '—'}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>

            {selected.notes ? (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notas</p>
                <p className="mt-1 whitespace-pre-line">{selected.notes}</p>
              </div>
            ) : null}

            {selected.rawTranscript ? (
              <div className="rounded-lg border border-border p-3 text-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Transcripción de voz
                </p>
                <p className="mt-1 italic text-muted-foreground">“{selected.rawTranscript}”</p>
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <History className="size-4" />
                Historial de cambios
              </p>
              {auditLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : audit.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin eventos registrados.</p>
              ) : (
                <ol className="space-y-2.5">
                  {audit.map((entry) => (
                    <li key={entry.id} className="flex gap-2.5">
                      <span className="mt-1 size-2 shrink-0 rounded-full bg-primary/60" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium">
                          {AUDIT_LABELS[entry.action]} · {entry.byName}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{formatDateTime(entry.at)}</p>
                        {entry.summary ? (
                          <p className="text-xs text-muted-foreground">{entry.summary}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="¿Eliminar el movimiento?"
        description={
          deleteTarget
            ? `${deleteTarget.description} · ${formatMoney(deleteTarget.amountMinor, deleteTarget.currency)}. Se hace un borrado lógico: deja de afectar los saldos y queda en el historial.`
            : undefined
        }
        confirmLabel="Eliminar"
        loading={busy}
        onConfirm={handleDelete}
      />

      <VoiceDialog open={voiceOpen} onOpenChange={setVoiceOpen} onConfirm={handleVoiceConfirm} />
    </div>
  )
}
