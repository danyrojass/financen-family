import * as React from 'react'
import { CalendarClock, Landmark, Pencil, Plus, Power, Trash2, Wallet } from 'lucide-react'
import type { Loan, LoanKind } from '@/domain/models'
import { convertMinor, formatMoney, formatPercent } from '@/domain/money'
import { computeLoanStates } from '@/domain/ledger'
import { formatDate, relativeDayLabel } from '@/lib/date'
import { LOAN_KIND_LABELS } from '@/lib/labels'
import { errorMessage } from '@/lib/errors'
import { deleteLoan, updateLoan } from '@/data/loans'
import { useHousehold } from '@/providers/household-provider'
import { useQuickAdd } from '@/providers/quick-add-provider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs } from '@/components/ui/tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { LoanFormDialog } from './loan-form-dialog'

function toBase(amountMinor: number, currency: Loan['currency'], base: Loan['currency'], ctx: { fxRates: Record<string, number> }): number {
  if (currency === base) return amountMinor
  return (
    convertMinor(amountMinor, currency, base, ctx.fxRates, base) ?? 0
  )
}

export function LoansPage() {
  const { householdId, loans, transactions, accounts, ctx, actor } = useHousehold()
  const { openQuickAdd } = useQuickAdd()
  const { toast } = useToast()

  const [tab, setTab] = React.useState<LoanKind>('loan')
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Loan | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Loan | null>(null)
  const [busy, setBusy] = React.useState(false)

  const states = React.useMemo(() => computeLoanStates(loans, transactions), [loans, transactions])
  const filtered = states.filter((state) => state.loan.kind === tab)

  const outstandingBase = React.useMemo(
    () =>
      states.reduce((total, state) => {
        if (state.loan.kind !== 'loan') return total
        return total + toBase(state.outstandingMinor, state.loan.currency, ctx.baseCurrency, ctx)
      }, 0),
    [ctx, states],
  )
  const monthlyBase = React.useMemo(
    () =>
      states.reduce((total, state) => {
        if (!state.loan.isActive || state.installmentsRemaining === 0) return total
        return total + toBase(state.loan.installmentAmountMinor, state.loan.currency, ctx.baseCurrency, ctx)
      }, 0),
    [ctx, states],
  )
  const overdueCount = states.filter((state) => state.loan.isActive && state.isOverdue).length

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (loan: Loan) => {
    setEditing(loan)
    setFormOpen(true)
  }

  const paymentCount = (loan: Loan) =>
    transactions.filter(
      (tx) => tx.loanId === loan.id || tx.commitmentId === loan.id,
    ).length

  const toggleActive = async (loan: Loan) => {
    if (!householdId || !actor) return
    setBusy(true)
    try {
      await updateLoan(householdId, loan.id, actor.uid, {
        kind: loan.kind,
        name: loan.name,
        institution: loan.institution,
        originalPrincipalMinor: loan.originalPrincipalMinor,
        interestRate: loan.interestRate,
        installmentAmountMinor: loan.installmentAmountMinor,
        installmentsTotal: loan.installmentsTotal,
        firstDueDate: loan.firstDueDate,
        currency: loan.currency,
        accountId: loan.accountId,
        categoryId: loan.categoryId,
        isActive: !loan.isActive,
        notes: loan.notes,
      })
      toast({ title: loan.isActive ? 'Registro desactivado' : 'Registro activado', variant: 'success' })
    } catch (toggleError) {
      toast({ title: 'No se pudo actualizar', description: errorMessage(toggleError), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!householdId || !deleteTarget) return
    setBusy(true)
    try {
      await deleteLoan(householdId, deleteTarget.id)
      toast({ title: 'Registro eliminado', variant: 'success' })
      setDeleteTarget(null)
    } catch (deleteError) {
      toast({ title: 'No se pudo eliminar', description: errorMessage(deleteError), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Préstamos y compromisos"
        description="Cuotas, capital pendiente e intereses del hogar."
        actions={
          <Button onClick={openCreate}>
            <Plus />
            Nuevo registro
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
        <StatCard
          label="Capital pendiente"
          value={formatMoney(outstandingBase, ctx.baseCurrency)}
          icon={<Landmark />}
          tone={outstandingBase > 0 ? 'warning' : 'muted'}
          hint="Solo préstamos con capital"
        />
        <StatCard
          label="Cuotas activas / mes"
          value={formatMoney(monthlyBase, ctx.baseCurrency)}
          icon={<Wallet />}
          hint="Compromisos y préstamos vigentes"
        />
        <StatCard
          label="Vencidos"
          value={String(overdueCount)}
          icon={<CalendarClock />}
          tone={overdueCount > 0 ? 'negative' : 'muted'}
          hint={overdueCount > 0 ? 'Revisá los pagos pendientes' : 'Todo al día'}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as LoanKind)}
        items={[
          { value: 'loan', label: 'Préstamos' },
          { value: 'commitment', label: 'Compromisos' },
        ]}
        className="max-w-xs"
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Landmark />}
          title={tab === 'loan' ? 'Sin préstamos registrados' : 'Sin compromisos registrados'}
          description={
            tab === 'loan'
              ? 'Cargá un préstamo para seguir el capital, las cuotas y los intereses.'
              : 'Cargá alquiler, colegio o servicios como compromisos periódicos.'
          }
          action={
            <Button onClick={openCreate}>
              <Plus />
              Nuevo registro
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((state) => {
            const loan = state.loan
            return (
              <Card key={loan.id} className={cn(!loan.isActive && 'opacity-70')}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-semibold">{loan.name}</p>
                        <Badge variant={loan.kind === 'loan' ? 'default' : 'outline'}>
                          {LOAN_KIND_LABELS[loan.kind]}
                        </Badge>
                        {state.isOverdue && loan.isActive ? (
                          <Badge variant="destructive">Vencido</Badge>
                        ) : null}
                        {!loan.isActive ? <Badge variant="outline">Inactivo</Badge> : null}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {loan.institution ?? 'Sin institución'} · cuota{' '}
                        {formatMoney(loan.installmentAmountMinor, loan.currency, { compact: true })}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-semibold tabular-nums">
                        {loan.kind === 'loan'
                          ? formatMoney(state.outstandingMinor, loan.currency)
                          : formatMoney(loan.originalPrincipalMinor, loan.currency)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {loan.kind === 'loan' ? 'capital pendiente' : 'total comprometido'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {state.installmentsPaid} de {loan.installmentsTotal} cuota(s)
                      </span>
                      <span className="tabular-nums">{formatPercent(state.progress, 0)}</span>
                    </div>
                    <Progress value={state.progress * 100} label={`Avance de ${loan.name}`} />
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <dt>Próximo vencimiento</dt>
                      <dd className="font-medium text-foreground">
                        {state.nextDueDate
                          ? `${formatDate(state.nextDueDate)} · ${relativeDayLabel(state.nextDueDate)}`
                          : 'Completado'}
                      </dd>
                    </div>
                    <div>
                      <dt>Interés pagado</dt>
                      <dd className="font-medium tabular-nums text-foreground">
                        {formatMoney(state.paidInterestMinor, loan.currency, { compact: true })}
                      </dd>
                    </div>
                    <div>
                      <dt>Capital pagado</dt>
                      <dd className="font-medium tabular-nums text-foreground">
                        {formatMoney(state.paidPrincipalMinor, loan.currency, { compact: true })}
                      </dd>
                    </div>
                    <div>
                      <dt>Tasa</dt>
                      <dd className="font-medium text-foreground">{loan.interestRate}% anual</dd>
                    </div>
                  </dl>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!loan.isActive}
                      onClick={() =>
                        openQuickAdd({
                          initial: {
                            type: 'loan_payment',
                            loanId: loan.id,
                            accountId: loan.accountId ?? accounts.find((account) => account.isActive)?.id ?? null,
                            currency: loan.currency,
                            amountMinor: loan.installmentAmountMinor,
                            categoryId: loan.categoryId,
                            description: `Pago ${loan.name}`,
                          },
                        })
                      }
                    >
                      <Wallet />
                      Registrar pago
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(loan)}>
                      <Pencil />
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void toggleActive(loan)}>
                      <Power />
                      {loan.isActive ? 'Desactivar' : 'Activar'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setDeleteTarget(loan)}
                    >
                      <Trash2 />
                      Eliminar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <LoanFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        loan={editing}
        onSaved={() => setEditing(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="¿Eliminar el registro?"
        description={
          deleteTarget && paymentCount(deleteTarget) > 0
            ? `Tiene ${paymentCount(deleteTarget)} pago(s) asociados. Desactivalo para conservar el historial.`
            : 'El registro se borra definitivamente.'
        }
        confirmLabel="Eliminar"
        loading={busy}
        onConfirm={async () => {
          if (deleteTarget && paymentCount(deleteTarget) > 0) {
            toast({
              title: 'No se puede eliminar',
              description: 'Desactivá el registro para conservar sus pagos.',
              variant: 'error',
            })
            return
          }
          await handleDelete()
        }}
      />
    </div>
  )
}
