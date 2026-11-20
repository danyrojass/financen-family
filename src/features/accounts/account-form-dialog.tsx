import * as React from 'react'
import { Save } from 'lucide-react'
import type { Account, AccountType } from '@/domain/models'
import { CURRENCY_CODES, formatMoney, parseAmountToMinor, type CurrencyCode } from '@/domain/money'
import type { AccountInput } from '@/data/schemas'
import { createAccount, updateAccount } from '@/data/accounts'
import { useHousehold } from '@/providers/household-provider'
import { useToast } from '@/components/ui/toast'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Label, FieldError, FieldHint } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { SwitchField } from '@/components/ui/switch'
import { ACCOUNT_TYPE_LABELS } from '@/lib/labels'
import { endOfDay, fromDateInput, toDateInput } from '@/lib/date'
import { errorMessage } from '@/lib/errors'

const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]

interface FormState {
  name: string
  type: AccountType
  currency: CurrencyCode
  initialBalance: string
  balanceAsOf: string
  includeInAvailable: boolean
  ownerId: string
  isActive: boolean
  notes: string
}

function initialState(account: Account | null, baseCurrency: CurrencyCode): FormState {
  return {
    name: account?.name ?? '',
    type: account?.type ?? 'bank',
    currency: account?.currency ?? baseCurrency,
    initialBalance: account
      ? formatMoney(account.initialBalanceMinor, account.currency, { withSymbol: false })
      : '',
    balanceAsOf: account?.balanceAsOf ? toDateInput(account.balanceAsOf) : '',
    includeInAvailable: account?.includeInAvailable ?? true,
    ownerId: account?.ownerId ?? '',
    isActive: account?.isActive ?? true,
    notes: account?.notes ?? '',
  }
}

export function AccountFormDialog({
  open,
  onOpenChange,
  account,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: Account | null
  onSaved?: () => void
}) {
  const { householdId, members, ctx, actor } = useHousehold()
  const { toast } = useToast()
  const [form, setForm] = React.useState<FormState>(() => initialState(account, ctx.baseCurrency))
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setForm(initialState(account, ctx.baseCurrency))
    setError(null)
  }, [account, ctx.baseCurrency, open])

  const patch = (values: Partial<FormState>) => setForm((current) => ({ ...current, ...values }))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!householdId || !actor) return
    setError(null)

    const initialBalanceMinor = form.initialBalance.trim()
      ? parseAmountToMinor(form.initialBalance, form.currency)
      : 0
    if (initialBalanceMinor == null) {
      setError('El saldo inicial no es un importe válido.')
      return
    }
    if (!form.name.trim()) {
      setError('El nombre es obligatorio.')
      return
    }

    let balanceAsOf: Date | null = null
    if (form.balanceAsOf.trim()) {
      const parsedDate = fromDateInput(form.balanceAsOf)
      if (!parsedDate) {
        setError('La fecha de conciliación no es válida.')
        return
      }
      balanceAsOf = endOfDay(parsedDate)
    }

    const input: AccountInput = {
      name: form.name.trim(),
      type: form.type,
      currency: form.currency,
      initialBalanceMinor,
      balanceAsOf,
      includeInAvailable: form.includeInAvailable,
      ownerId: form.ownerId || null,
      isActive: form.isActive,
      notes: form.notes.trim() || null,
    }

    setSaving(true)
    try {
      if (account) {
        await updateAccount(householdId, account.id, actor.uid, input)
        toast({ title: 'Cuenta actualizada', variant: 'success' })
      } else {
        await createAccount(householdId, actor.uid, input)
        toast({ title: 'Cuenta creada', variant: 'success' })
      }
      onOpenChange(false)
      onSaved?.()
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      variant="sheet"
      title={account ? 'Editar cuenta' : 'Nueva cuenta'}
      description="El saldo actual se calcula con los movimientos confirmados."
      footer={
        <>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="account-form" loading={saving}>
            <Save />
            Guardar
          </Button>
        </>
      }
    >
      <form id="account-form" className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <Label htmlFor="account-name">Nombre</Label>
          <Input
            id="account-name"
            value={form.name}
            onChange={(event) => patch({ name: event.target.value })}
            placeholder="Cuenta Itaú, Efectivo, Billetera…"
            maxLength={120}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="account-type">Tipo</Label>
            <Select
              id="account-type"
              value={form.type}
              onChange={(event) => patch({ type: event.target.value as AccountType })}
            >
              {ACCOUNT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ACCOUNT_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="account-currency">Moneda</Label>
            <Select
              id="account-currency"
              value={form.currency}
              onChange={(event) => patch({ currency: event.target.value as CurrencyCode })}
            >
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="account-balance">Saldo inicial</Label>
          <MoneyInput
            id="account-balance"
            value={form.initialBalance}
            onValueChange={(value) => patch({ initialBalance: value })}
            currency={form.currency}
          />
          <FieldHint>Puede ser negativo si la cuenta ya venía con deuda.</FieldHint>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="account-balance-asof">Saldo conciliado al día</Label>
          <Input
            id="account-balance-asof"
            type="date"
            value={form.balanceAsOf}
            onChange={(event) => patch({ balanceAsOf: event.target.value })}
          />
          <FieldHint>
            Si indicás una fecha, el saldo de arriba es el saldo real a ese día (fin del día) y los
            movimientos anteriores ya están incluidos: no se vuelven a sumar.
          </FieldHint>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="account-owner">Integrante</Label>
          <Select
            id="account-owner"
            value={form.ownerId}
            onChange={(event) => patch({ ownerId: event.target.value })}
          >
            <option value="">Del hogar</option>
            {members.map((member) => (
              <option key={member.uid} value={member.uid}>
                {member.displayName}
              </option>
            ))}
          </Select>
        </div>

        <SwitchField
          checked={form.includeInAvailable}
          onCheckedChange={(checked) => patch({ includeInAvailable: checked })}
          label="Sumar al dinero disponible"
          description="Se excluye de las cuentas de ahorro y de las que no querés contar."
        />
        <SwitchField
          checked={form.isActive}
          onCheckedChange={(checked) => patch({ isActive: checked })}
          label="Cuenta activa"
          description="Las cuentas inactivas no aparecen en los selectores."
        />

        <div className="space-y-1.5">
          <Label htmlFor="account-notes">Notas</Label>
          <Textarea
            id="account-notes"
            value={form.notes}
            onChange={(event) => patch({ notes: event.target.value })}
            maxLength={500}
            rows={2}
          />
        </div>

        <FieldError>{error}</FieldError>
      </form>
    </Dialog>
  )
}
