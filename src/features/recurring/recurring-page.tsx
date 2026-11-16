import * as React from 'react'
import { CalendarClock, Pencil, Play, Plus, Power, Repeat, Trash2, Zap } from 'lucide-react'
import type { RecurringRule } from '@/domain/models'
import { formatMoney } from '@/domain/money'
import { isRecurringDue, nextOccurrence } from '@/domain/ledger'
import { formatDate, monthLabel, relativeDayLabel, toMonthInput } from '@/lib/date'
import { FREQUENCY_LABELS, TRANSACTION_TYPE_LABELS } from '@/lib/labels'
import { errorMessage } from '@/lib/errors'
import { deleteRecurring, generateDueRecurringDrafts, updateRecurring } from '@/data/recurring'
import { useHousehold } from '@/providers/household-provider'
import { useQuickAdd } from '@/providers/quick-add-provider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Alert } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { RecurringFormDialog } from './recurring-form-dialog'

export function RecurringPage() {
  const { householdId, recurring, accounts, cards, categories, ctx, actor } = useHousehold()
  const { openQuickAdd } = useQuickAdd()
  const { toast } = useToast()

  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<RecurringRule | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<RecurringRule | null>(null)
  const [busy, setBusy] = React.useState(false)

  const ordered = React.useMemo(
    () => [...recurring].sort((a, b) => a.nextRunAt.getTime() - b.nextRunAt.getTime()),
    [recurring],
  )
  const active = ordered.filter((rule) => rule.isActive)
  const dueRules = active.filter((rule) => rule.autoGenerate && isRecurringDue(rule))
  const nextRule = active[0] ?? null

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (rule: RecurringRule) => {
    setEditing(rule)
    setFormOpen(true)
  }

  const toggleActive = async (rule: RecurringRule) => {
    if (!householdId || !actor) return
    setBusy(true)
    try {
      await updateRecurring(householdId, rule.id, actor.uid, {
        name: rule.name,
        type: rule.type as Parameters<typeof updateRecurring>[3]['type'],
        amountMinor: rule.amountMinor,
        currency: rule.currency,
        frequency: rule.frequency,
        intervalDays: rule.intervalDays,
        dayOfMonth: rule.dayOfMonth,
        nextRunAt: rule.nextRunAt,
        accountId: rule.accountId,
        cardId: rule.cardId,
        toAccountId: rule.toAccountId,
        categoryId: rule.categoryId,
        loanId: rule.loanId,
        autoGenerate: rule.autoGenerate,
        isActive: !rule.isActive,
        notes: rule.notes,
      })
      toast({ title: rule.isActive ? 'Recurrente pausado' : 'Recurrente activado', variant: 'success' })
    } catch (toggleError) {
      toast({ title: 'No se pudo actualizar', description: errorMessage(toggleError), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const handleGenerate = async () => {
    if (!householdId || !actor) return
    if (dueRules.length === 0) {
      toast({
        title: 'No hay recurrentes vencidos',
        description: 'Los próximos vencimientos todavía no llegaron.',
        variant: 'warning',
      })
      return
    }
    setBusy(true)
    try {
      const created = await generateDueRecurringDrafts({
        householdId,
        actor,
        ctx,
        rules: dueRules,
      })
      toast({
        title: created > 0 ? 'Borradores generados' : 'Sin cambios',
        description:
          created > 0
            ? `${created} borrador(es) pendientes. Confirmalos en Movimientos.`
            : 'No se generaron borradores nuevos.',
        variant: created > 0 ? 'success' : 'default',
      })
    } catch (generateError) {
      toast({
        title: 'No se pudieron generar',
        description: errorMessage(generateError),
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!householdId || !deleteTarget) return
    setBusy(true)
    try {
      await deleteRecurring(householdId, deleteTarget.id)
      toast({ title: 'Recurrente eliminado', variant: 'success' })
      setDeleteTarget(null)
    } catch (deleteError) {
      toast({ title: 'No se pudo eliminar', description: errorMessage(deleteError), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const registerNow = (rule: RecurringRule) => {
    openQuickAdd({
      initial: {
        type: rule.type,
        date: new Date(),
        description: rule.name,
        amountMinor: rule.amountMinor,
        currency: rule.currency,
        categoryId: rule.categoryId,
        accountId: rule.accountId,
        toAccountId: rule.toAccountId,
        cardId: rule.cardId,
        loanId: rule.loanId,
        notes: rule.notes,
        status: 'confirmed',
      },
    })
  }

  const describeTarget = (rule: RecurringRule): string => {
    if (rule.cardId) {
      return cards.find((card) => card.id === rule.cardId)?.name ?? 'Tarjeta'
    }
    const account = accounts.find((item) => item.id === rule.accountId)
    const toAccount = accounts.find((item) => item.id === rule.toAccountId)
    if (toAccount) return `${account?.name ?? '—'} → ${toAccount.name}`
    return account?.name ?? 'Sin cuenta'
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Recurrentes"
        description="Reglas que generan borradores pendientes. Nunca pagan solas."
        actions={
          <>
            <Button variant="outline" onClick={() => void handleGenerate()} loading={busy}>
              <Zap />
              Generar vencidos
            </Button>
            <Button onClick={openCreate}>
              <Plus />
              Nuevo recurrente
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <StatCard label="Activos" value={String(active.length)} icon={<Repeat />} hint={`${recurring.length} en total`} />
        <StatCard
          label="Con borrador automático"
          value={String(active.filter((rule) => rule.autoGenerate).length)}
          icon={<Zap />}
          hint="Pendientes de confirmar"
        />
        <StatCard
          label="Vencidos"
          value={String(dueRules.length)}
          icon={<CalendarClock />}
          tone={dueRules.length > 0 ? 'warning' : 'muted'}
          hint={dueRules.length > 0 ? 'Generá los borradores' : 'Todo al día'}
        />
        <StatCard
          label="Próximo"
          value={nextRule ? relativeDayLabel(nextRule.nextRunAt) : '—'}
          tone="muted"
          hint={nextRule ? `${nextRule.name} · ${formatDate(nextRule.nextRunAt)}` : 'Sin reglas activas'}
        />
      </div>

      {dueRules.length > 0 ? (
        <Alert
          variant="warning"
          title={`${dueRules.length} recurrente(s) vencido(s)`}
          action={
            <Button size="sm" variant="outline" loading={busy} onClick={() => void handleGenerate()}>
              Generar
            </Button>
          }
        >
          Se crean movimientos pendientes. Los saldos solo cambian cuando los confirmás.
        </Alert>
      ) : null}

      {ordered.length === 0 ? (
        <EmptyState
          icon={<Repeat />}
          title="Sin movimientos recurrentes"
          description="Cargá alquiler, servicios o sueldos para que el sistema te recuerde cada vencimiento."
          action={
            <Button onClick={openCreate}>
              <Plus />
              Nuevo recurrente
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {ordered.map((rule) => {
            const due = isRecurringDue(rule)
            return (
              <Card key={rule.id} className={cn(!rule.isActive && 'opacity-70')}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-semibold">{rule.name}</p>
                        <Badge variant={rule.isActive ? 'default' : 'outline'}>
                          {TRANSACTION_TYPE_LABELS[rule.type]}
                        </Badge>
                        {due && rule.isActive ? <Badge variant="warning">Vencido</Badge> : null}
                        {!rule.autoGenerate ? <Badge variant="outline">Manual</Badge> : null}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {FREQUENCY_LABELS[rule.frequency]}
                        {rule.frequency === 'custom' ? ` (${rule.intervalDays} días)` : ''} ·{' '}
                        {describeTarget(rule)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-semibold tabular-nums">
                        {formatMoney(rule.amountMinor, rule.currency)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatMoney(rule.amountMinor, rule.currency, { compact: true })} /{' '}
                        {monthLabel(toMonthInput(rule.nextRunAt), { withYear: false })}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <p>Próximo</p>
                      <p className="font-medium text-foreground">
                        {formatDate(rule.nextRunAt)} · {relativeDayLabel(rule.nextRunAt)}
                      </p>
                    </div>
                    <div>
                      <p>Siguiente después</p>
                      <p className="font-medium text-foreground">
                        {formatDate(nextOccurrence(rule.nextRunAt, rule.frequency, rule.intervalDays))}
                      </p>
                    </div>
                    {rule.categoryId ? (
                      <div>
                        <p>Categoría</p>
                        <p className="font-medium text-foreground">
                          {categories.find((category) => category.id === rule.categoryId)?.name ?? '—'}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {rule.notes ? (
                    <p className="mt-2 text-xs text-muted-foreground">{rule.notes}</p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!rule.isActive}
                      onClick={() => registerNow(rule)}
                    >
                      <Play />
                      Registrar ahora
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(rule)}>
                      <Pencil />
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void toggleActive(rule)}>
                      <Power />
                      {rule.isActive ? 'Pausar' : 'Activar'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setDeleteTarget(rule)}
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

      <RecurringFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        rule={editing}
        onSaved={() => setEditing(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="¿Eliminar el recurrente?"
        description="Se borra la regla. Los movimientos ya generados se conservan."
        confirmLabel="Eliminar"
        loading={busy}
        onConfirm={handleDelete}
      />
    </div>
  )
}
