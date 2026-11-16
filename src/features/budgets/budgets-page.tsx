import * as React from 'react'
import { Copy, Pencil, PiggyBank, Plus, Trash2 } from 'lucide-react'
import type { Budget } from '@/domain/models'
import { formatMoney, formatPercent } from '@/domain/money'
import { computeBudgetProgress } from '@/domain/ledger'
import { monthKeyOf, monthLabel, shiftMonthKey } from '@/lib/date'
import { errorMessage } from '@/lib/errors'
import { createBudget, deleteBudget } from '@/data/budgets'
import { useHousehold } from '@/providers/household-provider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { MonthNav } from '@/components/common/month-nav'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { BudgetFormDialog } from './budget-form-dialog'

export function BudgetsPage() {
  const { householdId, budgets, categories, transactions, ctx, actor } = useHousehold()
  const { toast } = useToast()

  const [month, setMonth] = React.useState(() => monthKeyOf(new Date()))
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Budget | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Budget | null>(null)
  const [busy, setBusy] = React.useState(false)

  const monthBudgets = React.useMemo(
    () => budgets.filter((budget) => budget.period === month),
    [budgets, month],
  )
  const progress = React.useMemo(
    () => computeBudgetProgress(monthBudgets, transactions, categories, ctx),
    [categories, ctx, monthBudgets, transactions],
  )

  const totals = React.useMemo(() => {
    let budgeted = 0
    let spent = 0
    for (const item of progress) {
      budgeted += item.spentMinor + item.remainingMinor
      spent += item.spentMinor
    }
    return {
      budgeted,
      spent,
      remaining: budgeted - spent,
      ratio: budgeted > 0 ? spent / budgeted : 0,
      overCount: progress.filter((item) => item.isOverBudget).length,
    }
  }, [progress])

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (budget: Budget) => {
    setEditing(budget)
    setFormOpen(true)
  }

  const handleDelete = async () => {
    if (!householdId || !deleteTarget) return
    setBusy(true)
    try {
      await deleteBudget(householdId, deleteTarget.id)
      toast({ title: 'Presupuesto eliminado', variant: 'success' })
      setDeleteTarget(null)
    } catch (deleteError) {
      toast({ title: 'No se pudo eliminar', description: errorMessage(deleteError), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const copyPrevious = async () => {
    if (!householdId || !actor) return
    const previous = budgets.filter((budget) => budget.period === shiftMonthKey(month, -1))
    if (previous.length === 0) {
      toast({
        title: 'No hay presupuestos para copiar',
        description: `${monthLabel(shiftMonthKey(month, -1))} no tiene presupuestos.`,
        variant: 'warning',
      })
      return
    }
    const existing = new Set(monthBudgets.map((budget) => budget.categoryId))
    setBusy(true)
    let copied = 0
    try {
      for (const budget of previous) {
        if (existing.has(budget.categoryId)) continue
        await createBudget(householdId, actor.uid, {
          period: month,
          categoryId: budget.categoryId,
          amountMinor: budget.amountMinor,
          currency: budget.currency,
          notes: budget.notes,
        })
        copied += 1
      }
      toast({
        title: copied > 0 ? 'Presupuestos copiados' : 'Sin cambios',
        description:
          copied > 0
            ? `${copied} presupuesto(s) copiados desde ${monthLabel(shiftMonthKey(month, -1))}.`
            : 'Ya tenías esos presupuestos en este mes.',
        variant: copied > 0 ? 'success' : 'default',
      })
    } catch (copyError) {
      toast({ title: 'No se pudo copiar', description: errorMessage(copyError), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Presupuestos"
        description="Límites mensuales por categoría y comparación con el gasto real."
        actions={
          <>
            <Button variant="outline" onClick={() => void copyPrevious()} loading={busy}>
              <Copy />
              Copiar mes anterior
            </Button>
            <Button onClick={openCreate}>
              <Plus />
              Nuevo presupuesto
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <MonthNav value={month} onChange={setMonth} />
          <p className="text-xs text-muted-foreground">
            {monthBudgets.length} categoría(s) presupuestada(s) en {monthLabel(month)}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <StatCard
          label="Presupuestado"
          value={formatMoney(totals.budgeted, ctx.baseCurrency)}
          icon={<PiggyBank />}
          hint={monthLabel(month)}
        />
        <StatCard
          label="Gastado"
          value={formatMoney(totals.spent, ctx.baseCurrency)}
          tone="negative"
          hint={`${formatPercent(totals.ratio)} del total`}
        />
        <StatCard
          label="Disponible"
          value={formatMoney(totals.remaining, ctx.baseCurrency)}
          tone={totals.remaining < 0 ? 'negative' : 'positive'}
          hint="Presupuesto menos gasto"
        />
        <StatCard
          label="Excedidas"
          value={String(totals.overCount)}
          tone={totals.overCount > 0 ? 'warning' : 'muted'}
          hint={totals.overCount > 0 ? 'Categorías sobre el límite' : 'Todo dentro del límite'}
        />
      </div>

      {progress.length === 0 ? (
        <EmptyState
          icon={<PiggyBank />}
          title="Sin presupuestos en este mes"
          description="Creá un presupuesto por categoría para comparar contra tus gastos reales."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={openCreate}>
                <Plus />
                Nuevo presupuesto
              </Button>
              <Button variant="outline" onClick={() => void copyPrevious()} loading={busy}>
                <Copy />
                Copiar mes anterior
              </Button>
            </div>
          }
        />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {progress.map((item) => (
              <div key={item.budget.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-semibold">{item.categoryName}</p>
                      {item.isOverBudget ? <Badge variant="destructive">Excedido</Badge> : null}
                      {item.budget.currency !== ctx.baseCurrency ? (
                        <Badge variant="outline">{item.budget.currency}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatMoney(item.budget.amountMinor, item.budget.currency)} presupuestados ·{' '}
                      {formatPercent(item.ratio)} usado
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums">
                      {formatMoney(item.spentMinor, ctx.baseCurrency)}
                    </p>
                    <p
                      className={cn(
                        'text-[11px] tabular-nums',
                        item.remainingMinor < 0 ? 'text-destructive' : 'text-muted-foreground',
                      )}
                    >
                      {item.remainingMinor < 0
                        ? `${formatMoney(Math.abs(item.remainingMinor), ctx.baseCurrency)} de más`
                        : `${formatMoney(item.remainingMinor, ctx.baseCurrency)} disponible`}
                    </p>
                  </div>
                </div>

                <Progress
                  value={item.ratio * 100}
                  className="mt-2.5"
                  label={`Presupuesto de ${item.categoryName}`}
                />

                {item.budget.notes ? (
                  <p className="mt-2 text-xs text-muted-foreground">{item.budget.notes}</p>
                ) : null}

                <div className="mt-2 flex items-center gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(item.budget)}>
                    <Pencil />
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setDeleteTarget(item.budget)}
                  >
                    <Trash2 />
                    Eliminar
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <BudgetFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        budget={editing}
        defaultPeriod={month}
        onSaved={() => setEditing(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="¿Eliminar el presupuesto?"
        description="Se borra solo el límite de este mes. Los movimientos no se modifican."
        confirmLabel="Eliminar"
        loading={busy}
        onConfirm={handleDelete}
      />
    </div>
  )
}
