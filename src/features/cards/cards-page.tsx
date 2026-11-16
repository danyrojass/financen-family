import * as React from 'react'
import { Banknote, CreditCard, Pencil, Plus, Power, Receipt, Trash2 } from 'lucide-react'
import type { Card } from '@/domain/models'
import { formatMoney, formatPercent } from '@/domain/money'
import {
  cardStatementRange,
  computeCardStates,
  computeTotalCardDebtBase,
} from '@/domain/ledger'
import { formatDate, monthLabel, monthKeyOf } from '@/lib/date'
import { errorMessage } from '@/lib/errors'
import { deleteCard, updateCard } from '@/data/cards'
import { useHousehold } from '@/providers/household-provider'
import { useQuickAdd } from '@/providers/quick-add-provider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card as CardShell, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { CardFormDialog } from './card-form-dialog'

function statementLabel(card: Card): string {
  const range = cardStatementRange(card)
  return `${formatDate(range.start, 'day-month')} – ${formatDate(range.end, 'day-month')} · vence ${formatDate(
    range.dueDate,
    'day-month',
  )}`
}

export function CardsPage() {
  const { householdId, cards, transactions, accounts, ctx, actor } = useHousehold()
  const { openQuickAdd } = useQuickAdd()
  const { toast } = useToast()

  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Card | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Card | null>(null)
  const [busy, setBusy] = React.useState(false)

  const states = React.useMemo(() => computeCardStates(cards, transactions), [cards, transactions])
  const totalDebtBase = React.useMemo(
    () => computeTotalCardDebtBase(states, ctx),
    [ctx, states],
  )
  const activeCards = cards.filter((card) => card.isActive)
  const paymentAccounts = accounts.filter((account) => account.isActive && account.type !== 'savings')

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (card: Card) => {
    setEditing(card)
    setFormOpen(true)
  }

  const txCount = (card: Card) => transactions.filter((tx) => tx.cardId === card.id).length

  const toggleActive = async (card: Card) => {
    if (!householdId || !actor) return
    setBusy(true)
    try {
      await updateCard(householdId, card.id, actor.uid, {
        name: card.name,
        issuer: card.issuer,
        holderId: card.holderId,
        limitMinor: card.limitMinor,
        currency: card.currency,
        closingDay: card.closingDay,
        dueDay: card.dueDay,
        isActive: !card.isActive,
        notes: card.notes,
      })
      toast({ title: card.isActive ? 'Tarjeta desactivada' : 'Tarjeta activada', variant: 'success' })
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
      await deleteCard(householdId, deleteTarget.id)
      toast({ title: 'Tarjeta eliminada', variant: 'success' })
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
        title="Tarjetas de crédito"
        description="Consumos, avances y pagos del mes en curso."
        actions={
          <Button onClick={openCreate}>
            <Plus />
            Nueva tarjeta
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
        <StatCard
          label="Deuda total"
          value={formatMoney(totalDebtBase, ctx.baseCurrency)}
          icon={<CreditCard />}
          tone={totalDebtBase > 0 ? 'warning' : 'muted'}
          hint="Consumos menos pagos"
        />
        <StatCard
          label="Tarjetas activas"
          value={String(activeCards.length)}
          tone="muted"
          hint={`${cards.length} en total`}
        />
        <StatCard
          label="Período en curso"
          value={monthLabel(monthKeyOf(new Date()), { withYear: false })}
          tone="muted"
          hint="Según el cierre de cada tarjeta"
          className="col-span-2 lg:col-span-1"
        />
      </div>

      {cards.length === 0 ? (
        <EmptyState
          icon={<CreditCard />}
          title="Todavía no cargaste tarjetas"
          description="Agregá tus tarjetas para seguir la deuda, los cierres y los vencimientos."
          action={
            <Button onClick={openCreate}>
              <Plus />
              Nueva tarjeta
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {states.map((state) => {
            const card = state.card
            return (
              <CardShell key={card.id} className={cn(!card.isActive && 'opacity-70')}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-semibold">{card.name}</p>
                        {!card.isActive ? <Badge variant="outline">Inactiva</Badge> : null}
                        {state.utilization >= 0.8 && state.debtMinor > 0 ? (
                          <Badge variant="warning">Uso alto</Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {card.issuer} · cierre {card.closingDay} · vence {card.dueDay}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-semibold tabular-nums">
                        {formatMoney(state.debtMinor, card.currency)}
                      </p>
                      {card.currency !== ctx.baseCurrency ? (
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          {formatMoney(state.debtBaseMinor, ctx.baseCurrency)}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Uso del límite</span>
                      <span className="tabular-nums">
                        {formatPercent(Math.min(1, state.utilization), 1)}
                      </span>
                    </div>
                    <Progress value={state.utilization * 100} label={`Uso de ${card.name}`} />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        Disponible {formatMoney(state.availableMinor, card.currency, { compact: true })}
                      </span>
                      <span className="tabular-nums">
                        Límite {formatMoney(card.limitMinor, card.currency, { compact: true })}
                      </span>
                    </div>
                  </div>

                  <p className="mt-2 text-[11px] text-muted-foreground">{statementLabel(card)}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Consumos {formatMoney(state.chargedMinor, card.currency, { compact: true })} · Pagos{' '}
                    {formatMoney(state.paidMinor, card.currency, { compact: true })} · {txCount(card)}{' '}
                    movimiento(s)
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        openQuickAdd({
                          initial: {
                            type: 'expense',
                            cardId: card.id,
                            currency: card.currency,
                            description: `Consumo ${card.name}`,
                          },
                        })
                      }
                    >
                      <Receipt />
                      Gasto
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        openQuickAdd({
                          initial: {
                            type: 'card_payment',
                            cardId: card.id,
                            accountId: paymentAccounts[0]?.id ?? null,
                            currency: card.currency,
                            amountMinor: state.debtMinor > 0 ? state.debtMinor : null,
                            description: `Pago ${card.name}`,
                          },
                        })
                      }
                    >
                      <Banknote />
                      Pagar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        openQuickAdd({
                          initial: {
                            type: 'withdrawal',
                            cardId: card.id,
                            accountId: accounts.find((account) => account.isActive)?.id ?? null,
                            currency: card.currency,
                            description: `Avance ${card.name}`,
                          },
                        })
                      }
                    >
                      Avance
                    </Button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(card)}>
                      <Pencil />
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void toggleActive(card)}>
                      <Power />
                      {card.isActive ? 'Desactivar' : 'Activar'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setDeleteTarget(card)}
                    >
                      <Trash2 />
                      Eliminar
                    </Button>
                  </div>
                </CardContent>
              </CardShell>
            )
          })}
        </div>
      )}

      <CardFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        card={editing}
        onSaved={() => setEditing(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="¿Eliminar la tarjeta?"
        description={
          deleteTarget && txCount(deleteTarget) > 0
            ? `Tiene ${txCount(deleteTarget)} movimiento(s) asociados. Desactivala para conservar el historial.`
            : 'La tarjeta se borra definitivamente.'
        }
        confirmLabel="Eliminar"
        loading={busy}
        onConfirm={async () => {
          if (deleteTarget && txCount(deleteTarget) > 0) {
            toast({
              title: 'No se puede eliminar',
              description: 'Desactivá la tarjeta para conservar sus movimientos.',
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
