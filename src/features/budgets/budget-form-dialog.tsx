import * as React from 'react'
import { Save } from 'lucide-react'
import type { Budget, Category } from '@/domain/models'
import { CURRENCY_CODES, formatMoney, parseAmountToMinor, type CurrencyCode } from '@/domain/money'
import type { BudgetInput } from '@/data/schemas'
import { createBudget, updateBudget } from '@/data/budgets'
import { errorMessage } from '@/lib/errors'
import { useHousehold } from '@/providers/household-provider'
import { useToast } from '@/components/ui/toast'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Label, FieldError } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'

interface FormState {
  period: string
  categoryId: string
  amount: string
  currency: CurrencyCode
  notes: string
}

function initialState(
  budget: Budget | null,
  defaultPeriod: string,
  baseCurrency: CurrencyCode,
  categories: Category[],
): FormState {
  const firstCategory = categories.find((category) => category.kind === 'expense' && !category.isArchived)
  return {
    period: budget?.period ?? defaultPeriod,
    categoryId: budget?.categoryId ?? firstCategory?.id ?? '',
    amount: budget ? formatMoney(budget.amountMinor, budget.currency, { withSymbol: false }) : '',
    currency: budget?.currency ?? baseCurrency,
    notes: budget?.notes ?? '',
  }
}

export function BudgetFormDialog({
  open,
  onOpenChange,
  budget,
  defaultPeriod,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  budget: Budget | null
  defaultPeriod: string
  onSaved?: () => void
}) {
  const { householdId, categories, ctx, actor } = useHousehold()
  const { toast } = useToast()
  const expenseCategories = categories.filter(
    (category) => category.kind === 'expense' && !category.isArchived,
  )
  const [form, setForm] = React.useState<FormState>(() =>
    initialState(budget, defaultPeriod, ctx.baseCurrency, categories),
  )
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setForm(initialState(budget, defaultPeriod, ctx.baseCurrency, categories))
    setError(null)
  }, [budget, categories, ctx.baseCurrency, defaultPeriod, open])

  const patch = (values: Partial<FormState>) => setForm((current) => ({ ...current, ...values }))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!householdId || !actor) return
    setError(null)

    const amountMinor = parseAmountToMinor(form.amount, form.currency)
    if (amountMinor == null || amountMinor <= 0) {
      setError('El presupuesto debe ser un importe mayor a 0.')
      return
    }
    if (!form.categoryId) {
      setError('Elegí una categoría.')
      return
    }
    if (!/^\d{4}-\d{2}$/.test(form.period)) {
      setError('Elegí el mes del presupuesto.')
      return
    }

    const input: BudgetInput = {
      period: form.period,
      categoryId: form.categoryId,
      amountMinor,
      currency: form.currency,
      notes: form.notes.trim() || null,
    }

    setSaving(true)
    try {
      if (budget) {
        await updateBudget(householdId, budget.id, actor.uid, input)
        toast({ title: 'Presupuesto actualizado', variant: 'success' })
      } else {
        await createBudget(householdId, actor.uid, input)
        toast({ title: 'Presupuesto creado', variant: 'success' })
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
      title={budget ? 'Editar presupuesto' : 'Nuevo presupuesto'}
      description="El gasto real incluye las subcategorías de la categoría elegida."
      footer={
        <>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="budget-form" loading={saving}>
            <Save />
            Guardar
          </Button>
        </>
      }
    >
      <form id="budget-form" className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="budget-period">Mes</Label>
            <Input
              id="budget-period"
              type="month"
              value={form.period}
              onChange={(event) => patch({ period: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="budget-currency">Moneda</Label>
            <Select
              id="budget-currency"
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
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="budget-category">Categoría</Label>
            <Select
              id="budget-category"
              value={form.categoryId}
              onChange={(event) => patch({ categoryId: event.target.value })}
            >
              <option value="">Elegí una categoría</option>
              {expenseCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.parentId ? '— ' : ''}
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="budget-amount">Monto mensual</Label>
          <MoneyInput
            id="budget-amount"
            value={form.amount}
            onValueChange={(value) => patch({ amount: value })}
            currency={form.currency}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="budget-notes">Notas</Label>
          <Textarea
            id="budget-notes"
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
