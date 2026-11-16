import * as React from 'react'
import { Save } from 'lucide-react'
import type { RecurrenceFrequency, RecurringRule, TransactionType } from '@/domain/models'
import { CURRENCY_CODES, formatMoney, parseAmountToMinor, type CurrencyCode } from '@/domain/money'
import type { RecurringInput } from '@/data/schemas'
import { createRecurring, updateRecurring } from '@/data/recurring'
import { fromDateInput, toDateInput } from '@/lib/date'
import { FREQUENCY_LABELS } from '@/lib/labels'
import { errorMessage } from '@/lib/errors'
import { useHousehold } from '@/providers/household-provider'
import { useToast } from '@/components/ui/toast'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Label, FieldError, FieldHint } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { SwitchField } from '@/components/ui/switch'

const RECURRING_TYPES: TransactionType[] = [
  'expense',
  'income',
  'transfer',
  'savings_contribution',
  'card_payment',
  'loan_payment',
]

const TYPE_HINTS: Record<string, string> = {
  expense: 'Gasto periódico: servicios, colegio, suscripciones.',
  income: 'Ingreso periódico: sueldo, alquiler cobrado.',
  transfer: 'Movimiento entre cuentas propias (no es gasto).',
  savings_contribution: 'Aporte mensual a una cuenta de ahorro.',
  card_payment: 'Pago del resumen de una tarjeta.',
  loan_payment: 'Cuota de un préstamo o compromiso.',
}

interface FormState {
  name: string
  type: TransactionType
  amount: string
  currency: CurrencyCode
  frequency: RecurrenceFrequency
  intervalDays: string
  nextRunAt: string
  accountId: string
  cardId: string
  toAccountId: string
  categoryId: string
  loanId: string
  autoGenerate: boolean
  isActive: boolean
  notes: string
}

function initialState(rule: RecurringRule | null, baseCurrency: CurrencyCode): FormState {
  return {
    name: rule?.name ?? '',
    type: rule?.type ?? 'expense',
    amount: rule ? formatMoney(rule.amountMinor, rule.currency, { withSymbol: false }) : '',
    currency: rule?.currency ?? baseCurrency,
    frequency: rule?.frequency ?? 'monthly',
    intervalDays: rule?.intervalDays ? String(rule.intervalDays) : '30',
    nextRunAt: toDateInput(rule?.nextRunAt ?? new Date()),
    accountId: rule?.accountId ?? '',
    cardId: rule?.cardId ?? '',
    toAccountId: rule?.toAccountId ?? '',
    categoryId: rule?.categoryId ?? '',
    loanId: rule?.loanId ?? '',
    autoGenerate: rule?.autoGenerate ?? true,
    isActive: rule?.isActive ?? true,
    notes: rule?.notes ?? '',
  }
}

export function RecurringFormDialog({
  open,
  onOpenChange,
  rule,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rule: RecurringRule | null
  onSaved?: () => void
}) {
  const { householdId, accounts, cards, categories, loans, ctx, actor } = useHousehold()
  const { toast } = useToast()
  const [form, setForm] = React.useState<FormState>(() => initialState(rule, ctx.baseCurrency))
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setForm(initialState(rule, ctx.baseCurrency))
    setError(null)
  }, [ctx.baseCurrency, open, rule])

  const patch = (values: Partial<FormState>) => setForm((current) => ({ ...current, ...values }))

  const needsAccount = ['expense', 'income'].includes(form.type) && Boolean(form.cardId) === false
  const showToAccount = ['transfer', 'savings_contribution'].includes(form.type)
  const showCard = ['expense', 'card_payment'].includes(form.type) || form.type === 'income'

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!householdId || !actor) return
    setError(null)

    const amountMinor = parseAmountToMinor(form.amount, form.currency)
    if (amountMinor == null || amountMinor <= 0) {
      setError('El importe debe ser mayor a 0.')
      return
    }
    const nextRunAt = fromDateInput(form.nextRunAt)
    if (!nextRunAt) {
      setError('La próxima fecha no es válida.')
      return
    }
    if (!form.name.trim()) {
      setError('El nombre es obligatorio.')
      return
    }
    if (form.type === 'expense' || form.type === 'income') {
      if (!form.accountId && !form.cardId) {
        setError('Elegí una cuenta o una tarjeta.')
        return
      }
    }
    if (form.type === 'card_payment') {
      if (!form.cardId || !form.accountId) {
        setError('Elegí la tarjeta y la cuenta de pago.')
        return
      }
    }
    if (form.type === 'transfer' || form.type === 'savings_contribution') {
      if (!form.accountId || !form.toAccountId) {
        setError('Elegí la cuenta de origen y la de destino.')
        return
      }
      if (form.accountId === form.toAccountId) {
        setError('La cuenta de origen y destino deben ser distintas.')
        return
      }
    }
    if (form.type === 'loan_payment') {
      if (!form.loanId || !form.accountId) {
        setError('Elegí el préstamo/compromiso y la cuenta de pago.')
        return
      }
    }
    if (form.frequency === 'custom') {
      const intervalDays = Number(form.intervalDays)
      if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365) {
        setError('El intervalo debe estar entre 1 y 365 días.')
        return
      }
    }

    const input: RecurringInput = {
      name: form.name.trim(),
      type: form.type as RecurringInput['type'],
      amountMinor,
      currency: form.currency,
      frequency: form.frequency,
      intervalDays: form.frequency === 'custom' ? Number(form.intervalDays) : null,
      dayOfMonth: form.frequency === 'monthly' ? nextRunAt.getDate() : null,
      nextRunAt,
      accountId: form.accountId || null,
      cardId: form.cardId || null,
      toAccountId: form.toAccountId || null,
      categoryId: form.categoryId || null,
      loanId: form.loanId || null,
      autoGenerate: form.autoGenerate,
      isActive: form.isActive,
      notes: form.notes.trim() || null,
    }

    setSaving(true)
    try {
      if (rule) {
        await updateRecurring(householdId, rule.id, actor.uid, input)
        toast({ title: 'Recurrente actualizado', variant: 'success' })
      } else {
        await createRecurring(householdId, actor.uid, input)
        toast({ title: 'Recurrente creado', variant: 'success' })
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
      title={rule ? 'Editar recurrente' : 'Nuevo recurrente'}
      description="Genera borradores pendientes. Nunca registra un pago automáticamente."
      footer={
        <>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="recurring-form" loading={saving}>
            <Save />
            Guardar
          </Button>
        </>
      }
    >
      <form id="recurring-form" className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="recurring-name">Nombre</Label>
            <Input
              id="recurring-name"
              value={form.name}
              onChange={(event) => patch({ name: event.target.value })}
              placeholder="Alquiler, internet, sueldo…"
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recurring-type">Tipo</Label>
            <Select
              id="recurring-type"
              value={form.type}
              onChange={(event) => patch({ type: event.target.value as TransactionType })}
            >
              {RECURRING_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type === 'expense'
                    ? 'Gasto'
                    : type === 'income'
                      ? 'Ingreso'
                      : type === 'transfer'
                        ? 'Transferencia'
                        : type === 'savings_contribution'
                          ? 'Aporte a ahorro'
                          : type === 'card_payment'
                            ? 'Pago de tarjeta'
                            : 'Pago de préstamo'}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recurring-currency">Moneda</Label>
            <Select
              id="recurring-currency"
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

        <FieldHint>{TYPE_HINTS[form.type]}</FieldHint>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="recurring-amount">Importe</Label>
            <MoneyInput
              id="recurring-amount"
              value={form.amount}
              onValueChange={(value) => patch({ amount: value })}
              currency={form.currency}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recurring-frequency">Frecuencia</Label>
            <Select
              id="recurring-frequency"
              value={form.frequency}
              onChange={(event) => patch({ frequency: event.target.value as RecurrenceFrequency })}
            >
              {(Object.keys(FREQUENCY_LABELS) as RecurrenceFrequency[]).map((frequency) => (
                <option key={frequency} value={frequency}>
                  {FREQUENCY_LABELS[frequency]}
                </option>
              ))}
            </Select>
          </div>
          {form.frequency === 'custom' ? (
            <div className="space-y-1.5">
              <Label htmlFor="recurring-interval">Cada (días)</Label>
              <Input
                id="recurring-interval"
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                value={form.intervalDays}
                onChange={(event) => patch({ intervalDays: event.target.value })}
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="recurring-next">Próxima vez</Label>
            <Input
              id="recurring-next"
              type="date"
              value={form.nextRunAt}
              onChange={(event) => patch({ nextRunAt: event.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="recurring-account">{needsAccount ? 'Cuenta' : 'Cuenta de pago'}</Label>
            <Select
              id="recurring-account"
              value={form.accountId}
              onChange={(event) => patch({ accountId: event.target.value })}
            >
              <option value="">Sin cuenta</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </div>
          {showCard ? (
            <div className="space-y-1.5">
              <Label htmlFor="recurring-card">Tarjeta</Label>
              <Select
                id="recurring-card"
                value={form.cardId}
                onChange={(event) => patch({ cardId: event.target.value })}
              >
                <option value="">Sin tarjeta</option>
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          {showToAccount ? (
            <div className="space-y-1.5">
              <Label htmlFor="recurring-to">Cuenta destino</Label>
              <Select
                id="recurring-to"
                value={form.toAccountId}
                onChange={(event) => patch({ toAccountId: event.target.value })}
              >
                <option value="">Elegí destino</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          {form.type === 'loan_payment' ? (
            <div className="space-y-1.5">
              <Label htmlFor="recurring-loan">Préstamo o compromiso</Label>
              <Select
                id="recurring-loan"
                value={form.loanId}
                onChange={(event) => patch({ loanId: event.target.value })}
              >
                <option value="">Elegí</option>
                {loans.map((loan) => (
                  <option key={loan.id} value={loan.id}>
                    {loan.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="recurring-category">Categoría</Label>
            <Select
              id="recurring-category"
              value={form.categoryId}
              onChange={(event) => patch({ categoryId: event.target.value })}
            >
              <option value="">Sin categoría</option>
              {categories
                .filter((category) => !category.isArchived)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.parentId ? '— ' : ''}
                    {category.name}
                  </option>
                ))}
            </Select>
          </div>
        </div>

        <SwitchField
          checked={form.autoGenerate}
          onCheckedChange={(checked) => patch({ autoGenerate: checked })}
          label="Generar borrador al vencer"
          description="El borrador queda pendiente hasta que lo confirmes en Movimientos."
        />
        <SwitchField
          checked={form.isActive}
          onCheckedChange={(checked) => patch({ isActive: checked })}
          label="Recurrente activo"
          description="Los inactivos no generan borradores ni aparecen en vencimientos."
        />

        <div className="space-y-1.5">
          <Label htmlFor="recurring-notes">Notas</Label>
          <Textarea
            id="recurring-notes"
            value={form.notes}
            onChange={(event) => patch({ notes: event.target.value })}
            maxLength={300}
            rows={2}
          />
        </div>

        <FieldError>{error}</FieldError>
      </form>
    </Dialog>
  )
}
