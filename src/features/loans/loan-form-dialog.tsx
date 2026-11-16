import * as React from 'react'
import { Save } from 'lucide-react'
import type { Loan, LoanKind } from '@/domain/models'
import { CURRENCY_CODES, formatMoney, parseAmountToMinor, type CurrencyCode } from '@/domain/money'
import type { LoanInput } from '@/data/schemas'
import { createLoan, updateLoan } from '@/data/loans'
import { fromDateInput, toDateInput } from '@/lib/date'
import { LOAN_KIND_LABELS } from '@/lib/labels'
import { errorMessage } from '@/lib/errors'
import { useHousehold } from '@/providers/household-provider'
import { useToast } from '@/components/ui/toast'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Label, FieldError, FieldHint } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { SwitchField } from '@/components/ui/switch'

interface FormState {
  kind: LoanKind
  name: string
  institution: string
  principal: string
  interestRate: string
  installmentAmount: string
  installmentsTotal: string
  firstDueDate: string
  currency: CurrencyCode
  accountId: string
  categoryId: string
  isActive: boolean
  notes: string
}

function initialState(loan: Loan | null, baseCurrency: CurrencyCode): FormState {
  return {
    kind: loan?.kind ?? 'loan',
    name: loan?.name ?? '',
    institution: loan?.institution ?? '',
    principal: loan ? formatMoney(loan.originalPrincipalMinor, loan.currency, { withSymbol: false }) : '',
    interestRate: loan ? String(loan.interestRate) : '0',
    installmentAmount: loan
      ? formatMoney(loan.installmentAmountMinor, loan.currency, { withSymbol: false })
      : '',
    installmentsTotal: String(loan?.installmentsTotal ?? 12),
    firstDueDate: toDateInput(loan?.firstDueDate ?? new Date()),
    currency: loan?.currency ?? baseCurrency,
    accountId: loan?.accountId ?? '',
    categoryId: loan?.categoryId ?? '',
    isActive: loan?.isActive ?? true,
    notes: loan?.notes ?? '',
  }
}

export function LoanFormDialog({
  open,
  onOpenChange,
  loan,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  loan: Loan | null
  onSaved?: () => void
}) {
  const { householdId, accounts, categories, ctx, actor } = useHousehold()
  const { toast } = useToast()
  const [form, setForm] = React.useState<FormState>(() => initialState(loan, ctx.baseCurrency))
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setForm(initialState(loan, ctx.baseCurrency))
    setError(null)
  }, [ctx.baseCurrency, loan, open])

  const patch = (values: Partial<FormState>) => setForm((current) => ({ ...current, ...values }))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!householdId || !actor) return
    setError(null)

    const principalMinor = parseAmountToMinor(form.principal, form.currency)
    const installmentAmountMinor = parseAmountToMinor(form.installmentAmount, form.currency)
    const installmentsTotal = Number(form.installmentsTotal)
    const interestRate = Number(form.interestRate.replace(',', '.'))
    const firstDueDate = fromDateInput(form.firstDueDate)

    if (!form.name.trim()) {
      setError('El nombre es obligatorio.')
      return
    }
    if (principalMinor == null || principalMinor <= 0) {
      setError('El capital original debe ser mayor a 0.')
      return
    }
    if (installmentAmountMinor == null || installmentAmountMinor <= 0) {
      setError('La cuota debe ser un importe mayor a 0.')
      return
    }
    if (!Number.isInteger(installmentsTotal) || installmentsTotal < 1 || installmentsTotal > 600) {
      setError('La cantidad de cuotas debe estar entre 1 y 600.')
      return
    }
    if (!Number.isFinite(interestRate) || interestRate < 0 || interestRate > 100) {
      setError('La tasa debe estar entre 0 y 100.')
      return
    }
    if (!firstDueDate) {
      setError('La primera fecha de vencimiento no es válida.')
      return
    }

    const input: LoanInput = {
      kind: form.kind,
      name: form.name.trim(),
      institution: form.institution.trim() || null,
      originalPrincipalMinor: principalMinor,
      interestRate,
      installmentAmountMinor,
      installmentsTotal,
      firstDueDate,
      currency: form.currency,
      accountId: form.accountId || null,
      categoryId: form.categoryId || null,
      isActive: form.isActive,
      notes: form.notes.trim() || null,
    }

    setSaving(true)
    try {
      if (loan) {
        await updateLoan(householdId, loan.id, actor.uid, input)
        toast({ title: 'Registro actualizado', variant: 'success' })
      } else {
        await createLoan(householdId, actor.uid, input)
        toast({ title: 'Registro creado', variant: 'success' })
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
      title={loan ? 'Editar préstamo o compromiso' : 'Nuevo préstamo o compromiso'}
      description="El capital pendiente se calcula con los pagos confirmados."
      footer={
        <>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="loan-form" loading={saving}>
            <Save />
            Guardar
          </Button>
        </>
      }
    >
      <form id="loan-form" className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="loan-kind">Tipo</Label>
            <Select
              id="loan-kind"
              value={form.kind}
              onChange={(event) => patch({ kind: event.target.value as LoanKind })}
            >
              {(Object.keys(LOAN_KIND_LABELS) as LoanKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {LOAN_KIND_LABELS[kind]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loan-currency">Moneda</Label>
            <Select
              id="loan-currency"
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
            <Label htmlFor="loan-name">Nombre</Label>
            <Input
              id="loan-name"
              value={form.name}
              onChange={(event) => patch({ name: event.target.value })}
              placeholder="Préstamo auto, cuota colegio…"
              maxLength={120}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="loan-institution">Institución</Label>
            <Input
              id="loan-institution"
              value={form.institution}
              onChange={(event) => patch({ institution: event.target.value })}
              maxLength={120}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="loan-principal">Capital original</Label>
            <MoneyInput
              id="loan-principal"
              value={form.principal}
              onValueChange={(value) => patch({ principal: value })}
              currency={form.currency}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loan-installment">Cuota</Label>
            <MoneyInput
              id="loan-installment"
              value={form.installmentAmount}
              onValueChange={(value) => patch({ installmentAmount: value })}
              currency={form.currency}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loan-rate">Tasa anual (%)</Label>
            <Input
              id="loan-rate"
              inputMode="decimal"
              value={form.interestRate}
              onChange={(event) => patch({ interestRate: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loan-total">Cantidad de cuotas</Label>
            <Input
              id="loan-total"
              type="number"
              inputMode="numeric"
              min={1}
              max={600}
              value={form.installmentsTotal}
              onChange={(event) => patch({ installmentsTotal: event.target.value })}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="loan-first-due">Primer vencimiento</Label>
            <Input
              id="loan-first-due"
              type="date"
              value={form.firstDueDate}
              onChange={(event) => patch({ firstDueDate: event.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="loan-account">Cuenta de pago</Label>
            <Select
              id="loan-account"
              value={form.accountId}
              onChange={(event) => patch({ accountId: event.target.value })}
            >
              <option value="">Sin cuenta fija</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loan-category">Categoría del interés</Label>
            <Select
              id="loan-category"
              value={form.categoryId}
              onChange={(event) => patch({ categoryId: event.target.value })}
            >
              <option value="">Sin categoría</option>
              {categories
                .filter((category) => category.kind === 'expense' && !category.isArchived)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.parentId ? '— ' : ''}
                    {category.name}
                  </option>
                ))}
            </Select>
          </div>
        </div>

        {form.kind === 'commitment' ? (
          <FieldHint>
            Los compromisos (colegio, alquiler, servicios) se registran como pago con la cuenta
            elegida y el interés es 0.
          </FieldHint>
        ) : null}

        <SwitchField
          checked={form.isActive}
          onCheckedChange={(checked) => patch({ isActive: checked })}
          label="Registro activo"
          description="Los inactivos no aparecen en vencimientos ni en el panel."
        />

        <div className="space-y-1.5">
          <Label htmlFor="loan-notes">Notas</Label>
          <Textarea
            id="loan-notes"
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
