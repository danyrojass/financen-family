import * as React from 'react'
import { Link } from 'react-router-dom'
import { Banknote, Pencil, Plus, Power, Trash2, Wallet } from 'lucide-react'
import type { Account } from '@/domain/models'
import { formatMoney } from '@/domain/money'
import { availableMoneyBase, computeAccountBalances } from '@/domain/ledger'
import { ACCOUNT_TYPE_LABELS } from '@/lib/labels'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/date'
import { deleteAccount, updateAccount } from '@/data/accounts'
import { useHousehold } from '@/providers/household-provider'
import { useToast } from '@/components/ui/toast'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { AccountFormDialog } from './account-form-dialog'

export function AccountsPage() {
  const { householdId, accounts, transactions, recurring, loans, ctx, actor, memberName } =
    useHousehold()
  const { toast } = useToast()

  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Account | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Account | null>(null)
  const [busy, setBusy] = React.useState(false)

  const balances = React.useMemo(
    () => computeAccountBalances(accounts, transactions, ctx),
    [accounts, ctx, transactions],
  )
  const available = React.useMemo(() => availableMoneyBase(balances), [balances])

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (account: Account) => {
    setEditing(account)
    setFormOpen(true)
  }

  const references = (account: Account) => {
    const txCount = transactions.filter(
      (tx) => tx.accountId === account.id || tx.toAccountId === account.id,
    ).length
    const recurringCount = recurring.filter(
      (rule) => rule.accountId === account.id || rule.toAccountId === account.id,
    ).length
    const loanCount = loans.filter((loan) => loan.accountId === account.id).length
    return { txCount, recurringCount, loanCount }
  }

  const toggleActive = async (account: Account) => {
    if (!householdId || !actor) return
    setBusy(true)
    try {
      await updateAccount(householdId, account.id, actor.uid, {
        name: account.name,
        type: account.type,
        currency: account.currency,
        initialBalanceMinor: account.initialBalanceMinor,
        balanceAsOf: account.balanceAsOf,
        includeInAvailable: account.includeInAvailable,
        ownerId: account.ownerId,
        isActive: !account.isActive,
        notes: account.notes,
      })
      toast({
        title: account.isActive ? 'Cuenta desactivada' : 'Cuenta activada',
        variant: 'success',
      })
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
      await deleteAccount(householdId, deleteTarget.id)
      toast({ title: 'Cuenta eliminada', variant: 'success' })
      setDeleteTarget(null)
    } catch (deleteError) {
      toast({ title: 'No se pudo eliminar', description: errorMessage(deleteError), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const deleteRefs = deleteTarget ? references(deleteTarget) : null
  const deleteBlocked =
    Boolean(deleteRefs && (deleteRefs.txCount > 0 || deleteRefs.recurringCount > 0 || deleteRefs.loanCount > 0))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cuentas"
        description="Efectivo, banco, billeteras y ahorro del hogar."
        actions={
          <Button onClick={openCreate}>
            <Plus />
            Nueva cuenta
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
        <StatCard
          label="Liquidez total"
          value={formatMoney(available.availableMinor, ctx.baseCurrency)}
          icon={<Wallet />}
          hint="Bancos, efectivo y billeteras"
        />
        <StatCard
          label="Ahorros e inversiones"
          value={formatMoney(available.savingsMinor, ctx.baseCurrency)}
          icon={<Banknote />}
          tone="positive"
          hint="No disponible para gasto"
        />
        <StatCard
          label="Cuentas"
          value={String(accounts.length)}
          tone="muted"
          hint={`${accounts.filter((account) => account.isActive).length} activa(s)`}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      {available.rateMissing ? (
        <p className="text-xs text-warning">
          Falta la cotización de alguna moneda. Configurala en{' '}
          <Link to="/app/ajustes" className="underline">
            Ajustes
          </Link>
          .
        </p>
      ) : null}

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Wallet />}
          title="Todavía no tenés cuentas"
          description="Creá tu primera cuenta para registrar gastos, ingresos y transferencias."
          action={
            <Button onClick={openCreate}>
              <Plus />
              Nueva cuenta
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {balances.map((balance) => {
            const account = balance.account
            return (
              <Card key={account.id} className={cn(!account.isActive && 'opacity-70')}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-semibold">{account.name}</p>
                        <Badge variant={account.type === 'savings' ? 'success' : 'outline'}>
                          {ACCOUNT_TYPE_LABELS[account.type]}
                        </Badge>
                        {account.balanceAsOf ? (
                          <Badge variant="secondary">
                            Conciliada al {formatDate(account.balanceAsOf, 'short')}
                          </Badge>
                        ) : null}
                        {!account.isActive ? <Badge variant="outline">Inactiva</Badge> : null}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {account.currency} · {account.ownerId ? memberName(account.ownerId) : 'Hogar'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={cn(
                          'text-lg font-semibold tabular-nums',
                          balance.currentMinor < 0 && 'text-destructive',
                        )}
                      >
                        {formatMoney(balance.currentMinor, account.currency)}
                      </p>
                      {account.currency !== ctx.baseCurrency ? (
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          {formatMoney(balance.currentBaseMinor, ctx.baseCurrency)}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <span>
                      {account.balanceAsOf ? 'Saldo conciliado:' : 'Inicial:'}{' '}
                      <span className="tabular-nums">
                        {formatMoney(account.initialBalanceMinor, account.currency, {
                          compact: true,
                        })}
                      </span>
                    </span>
                    <span className="text-right">
                      Movimientos:{' '}
                      <span className="tabular-nums">
                        {formatMoney(balance.deltaMinor, account.currency, { compact: true })}
                      </span>
                    </span>
                  </div>

                  {balance.rateMissing ? (
                    <p className="mt-2 text-[11px] text-warning">
                      Falta la cotización de {account.currency} para calcular el total en{' '}
                      {ctx.baseCurrency}.
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => openEdit(account)}>
                      <Pencil />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void toggleActive(account)}
                    >
                      <Power />
                      {account.isActive ? 'Desactivar' : 'Activar'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setDeleteTarget(account)}
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

      <div className="flex flex-wrap gap-2">
        <Link to="/app/tarjetas" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Ver tarjetas
        </Link>
        <Link to="/app/movimientos" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Ver movimientos
        </Link>
      </div>

      <AccountFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        account={editing}
        onSaved={() => setEditing(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="¿Eliminar la cuenta?"
        description={
          deleteBlocked && deleteRefs
            ? `No se puede eliminar: tiene ${deleteRefs.txCount} movimiento(s), ${deleteRefs.recurringCount} recurrente(s) y ${deleteRefs.loanCount} préstamo(s) asociados. Desactivala para conservar el historial.`
            : 'La cuenta se borra definitivamente. Si tiene movimientos, conviene desactivarla.'
        }
        confirmLabel="Eliminar"
        loading={busy}
        onConfirm={async () => {
          if (deleteBlocked) {
            toast({
              title: 'No se puede eliminar',
              description: 'Primero desactivá la cuenta o reasigná sus movimientos.',
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
