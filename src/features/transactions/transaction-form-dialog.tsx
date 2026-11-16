import * as React from 'react'
import { Info, Save } from 'lucide-react'
import type {
  Account,
  Category,
  EntryMethod,
  Transaction,
  TransactionStatus,
  TransactionType,
} from '@/domain/models'
import { CURRENCY_CODES, formatMoney, parseAmountToMinor, type CurrencyCode } from '@/domain/money'
import { fromDateInput, toDateInput } from '@/lib/date'
import { errorMessage } from '@/lib/errors'
import { TRANSACTION_TYPE_DESCRIPTIONS, TRANSACTION_TYPE_LABELS } from '@/lib/labels'
import { createTransaction, updateTransaction } from '@/data/transactions'
import { transactionInputSchema, type TransactionInput } from '@/data/schemas'
import { useHousehold } from '@/providers/household-provider'
import { useToast } from '@/components/ui/toast'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Label, FieldError, FieldHint } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { Alert } from '@/components/ui/alert'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

export interface TransactionFormInitial {
  type?: TransactionType
  date?: Date
  description?: string
  amountMinor?: number | null
  currency?: CurrencyCode
  categoryId?: string | null
  accountId?: string | null
  toAccountId?: string | null
  cardId?: string | null
  loanId?: string | null
  notes?: string | null
  entryMethod?: EntryMethod
  rawTranscript?: string | null
  status?: TransactionStatus
  installmentCount?: number
}

interface FormState {
  type: TransactionType
  date: string
  description: string
  amount: string
  currency: CurrencyCode
  categoryId: string
  accountId: string
  toAccountId: string
  toAmount: string
  cardId: string
  loanId: string
  principal: string
  fee: string
  notes: string
  status: TransactionStatus
  installments: string
}

const TYPE_GROUPS: Array<{ label: string; types: TransactionType[] }> = [
  { label: 'Gastos e ingresos', types: ['expense', 'income'] },
  {
    label: 'Movimientos entre cuentas',
    types: ['transfer', 'savings_contribution', 'savings_withdrawal'],
  },
  {
    label: 'Tarjetas y préstamos',
    types: ['card_payment', 'withdrawal', 'loan_payment', 'adjustment'],
  },
]

function amountToInput(minor: number, currency: CurrencyCode): string {
  return formatMoney(minor, currency, { withSymbol: false })
}

function initialState(
  transaction: Transaction | null | undefined,
  initial: TransactionFormInitial | null | undefined,
  baseCurrency: CurrencyCode,
  accounts: Account[],
): FormState {
  if (transaction) {
    const toCurrency =
      accounts.find((account) => account.id === transaction.toAccountId)?.currency ??
      transaction.currency
    return {
      type: transaction.type,
      date: toDateInput(transaction.date),
      description: transaction.description,
      amount: amountToInput(transaction.amountMinor, transaction.currency),
      currency: transaction.currency,
      categoryId: transaction.categoryId ?? '',
      accountId: transaction.accountId ?? '',
      toAccountId: transaction.toAccountId ?? '',
      toAmount: transaction.toAmountMinor
        ? amountToInput(transaction.toAmountMinor, toCurrency)
        : '',
      cardId: transaction.cardId ?? '',
      loanId: transaction.loanId ?? '',
      principal:
        transaction.principalMinor != null
          ? amountToInput(transaction.principalMinor, transaction.currency)
          : '',
      fee:
        transaction.feeMinor != null
          ? amountToInput(transaction.feeMinor, transaction.currency)
          : '',
      notes: transaction.notes ?? '',
      status: transaction.status,
      installments: transaction.installmentCount ? String(transaction.installmentCount) : '',
    }
  }

  return {
    type: initial?.type ?? 'expense',
    date: toDateInput(initial?.date ?? new Date()),
    description: initial?.description ?? '',
    amount:
      initial?.amountMinor != null
        ? amountToInput(initial.amountMinor, initial.currency ?? baseCurrency)
        : '',
    currency: initial?.currency ?? baseCurrency,
    categoryId: initial?.categoryId ?? '',
    accountId: initial?.accountId ?? '',
    toAccountId: initial?.toAccountId ?? '',
    toAmount: '',
    cardId: initial?.cardId ?? '',
    loanId: initial?.loanId ?? '',
    principal: '',
    fee: '',
    notes: initial?.notes ?? '',
    status: initial?.status ?? 'confirmed',
    installments: initial?.installmentCount ? String(initial.installmentCount) : '',
  }
}

function groupCategories(categories: Category[]): Array<{ category: Category; depth: number }> {
  const parents = categories.filter((category) => !category.parentId)
  const result: Array<{ category: Category; depth: number }> = []
  for (const parent of parents) {
    result.push({ category: parent, depth: 0 })
    for (const child of categories.filter((category) => category.parentId === parent.id)) {
      result.push({ category: child, depth: 1 })
    }
  }
  for (const category of categories) {
    if (category.parentId && !parents.some((parent) => parent.id === category.parentId)) {
      result.push({ category, depth: 1 })
    }
  }
  return result
}

export function TransactionFormDialog({
  open,
  onOpenChange,
  transaction,
  initial,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction?: Transaction | null
  initial?: TransactionFormInitial | null
  onSaved?: () => void
}) {
  const { householdId, accounts, cards, categories, loans, ctx, actor } = useHousehold()
  const { toast } = useToast()
  const isEdit = Boolean(transaction)

  const initialRef = React.useRef(initial)
  initialRef.current = initial

  const [form, setForm] = React.useState<FormState>(() =>
    initialState(transaction, initial, ctx.baseCurrency, accounts),
  )
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [expenseSource, setExpenseSource] = React.useState<'account' | 'card'>(
    transaction?.cardId ? 'card' : 'account',
  )

  React.useEffect(() => {
    if (!open) return
    setForm(initialState(transaction, initialRef.current, ctx.baseCurrency, accounts))
    setExpenseSource(
      transaction?.cardId || initialRef.current?.cardId ? 'card' : 'account',
    )
    setError(null)
    // transaction se refresca en cada snapshot; solo importa su identidad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction?.id, ctx.baseCurrency])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const changeType = (type: TransactionType) => {
    setForm((current) => ({
      ...current,
      type,
      categoryId: '',
      toAccountId:
        type === 'transfer' || type === 'savings_contribution' || type === 'savings_withdrawal'
          ? current.toAccountId
          : '',
      loanId: type === 'loan_payment' ? current.loanId : '',
      principal: type === 'loan_payment' ? current.principal : '',
      fee: type === 'withdrawal' ? current.fee : '',
      installments: '',
      toAmount: '',
    }))
    if (type === 'expense') setExpenseSource('account')
  }

  const activeAccounts = accounts.filter((account) => account.isActive)
  const activeCards = cards.filter((card) => card.isActive)
  const activeLoans = loans.filter((loan) => loan.isActive)

  const categoryKind: 'expense' | 'income' =
    form.type === 'income' ? 'income' : 'expense'
  const categoryOptions = groupCategories(
    categories.filter(
      (category) => !category.isArchived && category.kind === categoryKind,
    ),
  )

  const selectedAccount = activeAccounts.find((account) => account.id === form.accountId)
  const selectedToAccount = activeAccounts.find((account) => account.id === form.toAccountId)
  const selectedLoan = activeLoans.find((loan) => loan.id === form.loanId)
  const crossCurrency =
    Boolean(selectedAccount && selectedToAccount) &&
    selectedAccount?.currency !== selectedToAccount?.currency

  const amountMinor = parseAmountToMinor(form.amount, form.currency)
  const principalMinor = form.principal ? parseAmountToMinor(form.principal, form.currency) : null
  const feeMinor = form.fee ? parseAmountToMinor(form.fee, form.currency) : null
  const interestMinor =
    form.type === 'loan_payment' && amountMinor != null && principalMinor != null
      ? amountMinor - principalMinor
      : null

  const showCategory =
    form.type === 'expense' || form.type === 'income' || form.type === 'loan_payment'
  const showAccountPaid =
    form.type === 'income' ||
    form.type === 'card_payment' ||
    form.type === 'loan_payment' ||
    (form.type === 'expense' && expenseSource === 'account') ||
    form.type === 'adjustment'
  const showCard =
    form.type === 'card_payment' ||
    form.type === 'withdrawal' ||
    (form.type === 'expense' && expenseSource === 'card') ||
    form.type === 'adjustment'
  const showDestination =
    form.type === 'transfer' ||
    form.type === 'savings_contribution' ||
    form.type === 'savings_withdrawal' ||
    form.type === 'withdrawal'
  const showLoan = form.type === 'loan_payment'
  const showInstallments = form.type === 'expense' && expenseSource === 'card'
  const showFee = form.type === 'withdrawal'

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!householdId || !actor) return
    setError(null)

    const date = fromDateInput(form.date)
    if (!date) {
      setError('La fecha no es válida.')
      return
    }

    if (amountMinor == null) {
      setError('Ingresá un importe válido.')
      return
    }
    if (form.type !== 'adjustment' && amountMinor <= 0) {
      setError('El importe debe ser mayor a 0.')
      return
    }

    if (isEdit && transaction) {
      setSaving(true)
      try {
        await updateTransaction({
          householdId,
          transactionId: transaction.id,
          actor,
          ctx,
          update: {
            description: form.description.trim() || TRANSACTION_TYPE_LABELS[form.type],
            date,
            amountMinor: form.type === 'adjustment' ? amountMinor : Math.abs(amountMinor),
            categoryId: form.categoryId || null,
            notes: form.notes.trim() || null,
            status: form.status,
          },
        })
        toast({ title: 'Movimiento actualizado', variant: 'success' })
        onOpenChange(false)
        onSaved?.()
      } catch (updateError) {
        setError(errorMessage(updateError))
      } finally {
        setSaving(false)
      }
      return
    }

    const loan = form.loanId ? loans.find((item) => item.id === form.loanId) : null
    let principal: number | null = null
    let interest: number | null = null
    if (form.type === 'loan_payment' && loan) {
      principal = principalMinor ?? Math.abs(amountMinor)
      interest = Math.abs(amountMinor) - principal
      if (principal < 0 || interest < 0) {
        setError('El capital no puede ser mayor al importe pagado.')
        return
      }
    }

    const payload: TransactionInput = {
      type: form.type,
      date,
      description: form.description.trim() || TRANSACTION_TYPE_LABELS[form.type],
      amountMinor: form.type === 'adjustment' ? amountMinor : Math.abs(amountMinor),
      currency: form.currency,
      categoryId: form.categoryId || null,
      accountId: showAccountPaid || form.type === 'adjustment' ? form.accountId || null : null,
      toAccountId: showDestination ? form.toAccountId || null : null,
      toAmountMinor:
        crossCurrency && form.toAmount
          ? parseAmountToMinor(form.toAmount, selectedToAccount?.currency ?? form.currency)
          : null,
      cardId:
        form.type !== 'adjustment'
          ? showCard
            ? form.cardId || null
            : null
          : form.cardId || null,
      loanId: form.type === 'loan_payment' ? form.loanId || null : null,
      commitmentId:
        form.type === 'loan_payment' && loan?.kind === 'commitment' ? loan.id : null,
      principalMinor: principal,
      interestMinor: interest,
      feeMinor: showFee ? feeMinor ?? null : null,
      notes: form.notes.trim() || null,
      status: form.status,
      entryMethod: initialRef.current?.entryMethod ?? 'manual',
      rawTranscript: initialRef.current?.rawTranscript ?? null,
      confidence: null,
      recurringId: null,
      installmentCount:
        showInstallments && Number(form.installments) > 1 ? Number(form.installments) : 1,
    }

    if (form.type === 'expense' && expenseSource === 'card' && !form.cardId) {
      setError('Elegí la tarjeta del gasto.')
      return
    }
    if (form.type === 'expense' && expenseSource === 'account' && !form.accountId) {
      setError('Elegí la cuenta del gasto.')
      return
    }
    if (form.type === 'adjustment' && !form.accountId && !form.cardId) {
      setError('Elegí la cuenta o tarjeta a ajustar.')
      return
    }
    if (crossCurrency && showDestination && !form.toAmount) {
      setError(`Indicá cuánto se acredita en ${selectedToAccount?.currency}.`)
      return
    }

    const parsed = transactionInputSchema.safeParse(payload)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisá los datos del movimiento.')
      return
    }

    setSaving(true)
    try {
      await createTransaction({ householdId, actor, ctx, input: parsed.data })
      toast({
        title: 'Movimiento guardado',
        description: `${TRANSACTION_TYPE_LABELS[form.type]} · ${formatMoney(
          parsed.data.amountMinor,
          parsed.data.currency,
        )}`,
        variant: 'success',
      })
      onOpenChange(false)
      onSaved?.()
    } catch (createError) {
      setError(errorMessage(createError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      variant="sheet"
      title={isEdit ? 'Editar movimiento' : 'Nuevo movimiento'}
      description={
        isEdit
          ? 'Podés corregir fecha, importe, categoría, descripción y estado.'
          : TRANSACTION_TYPE_DESCRIPTIONS[form.type]
      }
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="transaction-form" loading={saving}>
            <Save />
            {isEdit ? 'Guardar cambios' : 'Guardar movimiento'}
          </Button>
        </>
      }
    >
      <form id="transaction-form" className="space-y-4" onSubmit={handleSubmit}>
        {isEdit && transaction ? (
          <Alert variant="info">
            <p className="font-medium">
              {TRANSACTION_TYPE_LABELS[transaction.type]} ·{' '}
              {formatMoney(transaction.amountMinor, transaction.currency)}
            </p>
            <p className="mt-1">
              El tipo, la moneda y las cuentas asociadas no se pueden cambiar. Si necesitás
              corregirlos, eliminá el movimiento y creá uno nuevo.
            </p>
          </Alert>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="tx-type">Tipo de movimiento</Label>
            <Select
              id="tx-type"
              value={form.type}
              onChange={(event) => changeType(event.target.value as TransactionType)}
            >
              {TYPE_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.types.map((type) => (
                    <option key={type} value={type}>
                      {TRANSACTION_TYPE_LABELS[type]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="tx-amount">Importe</Label>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <MoneyInput
                id="tx-amount"
                value={form.amount}
                onValueChange={(value) => set('amount', value)}
                currency={form.currency}
                error={amountMinor == null && form.amount.length > 0}
              />
            </div>
            <Select
              aria-label="Moneda"
              className="w-24 shrink-0"
              value={form.currency}
              onChange={(event) => set('currency', event.target.value as CurrencyCode)}
              disabled={isEdit}
            >
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </div>
          <FieldError>
            {form.amount.length > 0 && amountMinor == null ? 'El importe no es válido.' : null}
          </FieldError>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tx-date">Fecha</Label>
            <Input
              id="tx-date"
              type="date"
              value={form.date}
              max="2100-12-31"
              onChange={(event) => set('date', event.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tx-status">Estado</Label>
            <Select
              id="tx-status"
              value={form.status}
              onChange={(event) => set('status', event.target.value as TransactionStatus)}
            >
              <option value="confirmed">Confirmado (afecta saldos)</option>
              <option value="pending">Pendiente (borrador)</option>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tx-description">Descripción</Label>
          <Input
            id="tx-description"
            value={form.description}
            maxLength={240}
            placeholder={
              form.type === 'card_payment'
                ? 'Pago del resumen de la tarjeta'
                : form.type === 'expense'
                  ? 'Ej. Supermercado del mes'
                  : 'Detalle del movimiento'
            }
            onChange={(event) => set('description', event.target.value)}
          />
        </div>

        {!isEdit && showInstallments ? (
          <div className="space-y-1.5">
            <Label htmlFor="tx-installments">Cuotas</Label>
            <div className="flex items-center gap-3">
              <Input
                id="tx-installments"
                type="number"
                min={1}
                max={48}
                className="w-24"
                value={form.installments}
                onChange={(event) => set('installments', event.target.value)}
              />
              <FieldHint>
                Si es mayor a 1, se genera un movimiento por cuota, mes a mes.
              </FieldHint>
            </div>
          </div>
        ) : null}

        {!isEdit && form.type === 'expense' ? (
          <div className="space-y-1.5">
            <Label>Medio de pago</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['account', 'card'] as const).map((source) => (
                <button
                  key={source}
                  type="button"
                  onClick={() => {
                    setExpenseSource(source)
                    if (source === 'account') set('cardId', '')
                    else set('accountId', '')
                  }}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                    expenseSource === source
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground',
                  )}
                >
                  {source === 'account' ? 'Cuenta / efectivo' : 'Tarjeta de crédito'}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {!isEdit && showAccountPaid ? (
          <div className="space-y-1.5">
            <Label htmlFor="tx-account">
              {form.type === 'card_payment'
                ? 'Cuenta desde la que pagás'
                : form.type === 'loan_payment'
                  ? 'Cuenta de pago'
                  : form.type === 'adjustment'
                    ? 'Cuenta a ajustar'
                    : 'Cuenta'}
            </Label>
            <Select
              id="tx-account"
              value={form.accountId}
              onChange={(event) => set('accountId', event.target.value)}
            >
              <option value="">Elegí una cuenta</option>
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {account.currency}
                </option>
              ))}
            </Select>
            {activeAccounts.length === 0 ? (
              <FieldHint>Creá una cuenta desde la sección Cuentas.</FieldHint>
            ) : null}
          </div>
        ) : null}

        {!isEdit && showCard ? (
          <div className="space-y-1.5">
            <Label htmlFor="tx-card">
              {form.type === 'withdrawal' ? 'Tarjeta desde la que retirás' : 'Tarjeta'}
            </Label>
            <Select
              id="tx-card"
              value={form.cardId}
              onChange={(event) => {
                set('cardId', event.target.value)
                if (form.type === 'adjustment') set('accountId', '')
              }}
            >
              <option value="">Elegí una tarjeta</option>
              {activeCards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name} · {card.currency}
                </option>
              ))}
            </Select>
            {activeCards.length === 0 ? (
              <FieldHint>Creá una tarjeta desde la sección Tarjetas.</FieldHint>
            ) : null}
          </div>
        ) : null}

        {!isEdit && showDestination ? (
          <div className="space-y-1.5">
            <Label htmlFor="tx-to-account">
              {form.type === 'withdrawal' ? 'Cuenta que recibe el efectivo' : 'Cuenta de destino'}
            </Label>
            <Select
              id="tx-to-account"
              value={form.toAccountId}
              onChange={(event) => set('toAccountId', event.target.value)}
            >
              <option value="">Elegí la cuenta destino</option>
              {activeAccounts
                .filter((account) => account.id !== form.accountId)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.currency}
                  </option>
                ))}
            </Select>
          </div>
        ) : null}

        {!isEdit && crossCurrency && showDestination ? (
          <div className="space-y-1.5">
            <Label htmlFor="tx-to-amount">
              Importe acreditado en {selectedToAccount?.currency}
            </Label>
            <Input
              id="tx-to-amount"
              value={form.toAmount}
              inputMode="decimal"
              placeholder="0"
              onChange={(event) => set('toAmount', event.target.value)}
            />
            <FieldHint>
              Al cambiar de moneda, indicá cuánto entra realmente en la cuenta destino.
            </FieldHint>
          </div>
        ) : null}

        {!isEdit && showLoan ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="tx-loan">Préstamo o compromiso</Label>
              <Select
                id="tx-loan"
                value={form.loanId}
                onChange={(event) => {
                  const loan = loans.find((item) => item.id === event.target.value)
                  set('loanId', event.target.value)
                  if (loan) {
                    set('currency', loan.currency)
                    if (loan.categoryId) set('categoryId', loan.categoryId)
                    if (loan.accountId) set('accountId', loan.accountId)
                  }
                }}
              >
                <option value="">Elegí el préstamo</option>
                {activeLoans.map((loan) => (
                  <option key={loan.id} value={loan.id}>
                    {loan.name} · {loan.kind === 'loan' ? 'Préstamo' : 'Compromiso'}
                  </option>
                ))}
              </Select>
            </div>
            {selectedLoan ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="tx-principal">Capital que amortiza</Label>
                  <Input
                    id="tx-principal"
                    value={form.principal}
                    inputMode="decimal"
                    placeholder={form.amount || '0'}
                    onChange={(event) => set('principal', event.target.value)}
                  />
                  <FieldHint>
                    {principalMinor == null
                      ? 'Si lo dejás vacío, todo el pago se toma como capital.'
                      : `Interés: ${formatMoney(
                          Math.max(0, (amountMinor ?? 0) - principalMinor),
                          form.currency,
                        )}`}
                  </FieldHint>
                </div>
                <div className="space-y-1.5">
                  <Label>Interés calculado</Label>
                  <div className="flex h-10 items-center rounded-lg border border-border bg-muted/50 px-3 text-sm tabular-nums">
                    {interestMinor == null
                      ? '—'
                      : formatMoney(Math.max(0, interestMinor), form.currency)}
                  </div>
                  <FieldHint>El interés es gasto real del mes.</FieldHint>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {!isEdit && showFee ? (
          <div className="space-y-1.5">
            <Label htmlFor="tx-fee">Comisión del retiro (opcional)</Label>
            <Input
              id="tx-fee"
              value={form.fee}
              inputMode="decimal"
              placeholder="0"
              onChange={(event) => set('fee', event.target.value)}
            />
            <FieldHint>
              El retiro aumenta la deuda de la tarjeta y el efectivo disponible. No es un gasto.
            </FieldHint>
          </div>
        ) : null}

        {showCategory ? (
          <div className="space-y-1.5">
            <Label htmlFor="tx-category">
              Categoría {form.type === 'loan_payment' ? 'del interés' : ''}
            </Label>
            <Select
              id="tx-category"
              value={form.categoryId}
              onChange={(event) => set('categoryId', event.target.value)}
            >
              <option value="">Sin categoría</option>
              {categoryOptions.map(({ category, depth }) => (
                <option key={category.id} value={category.id}>
                  {depth > 0 ? '— ' : ''}
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {!isEdit && form.type === 'adjustment' ? (
          <Alert variant="warning">
            <p>
              Usá los ajustes solo para corregir un saldo. Un importe negativo reduce el saldo y
              uno positivo lo aumenta; no cuenta como gasto ni ingreso.
            </p>
          </Alert>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="tx-notes">Notas (opcional)</Label>
          <Textarea
            id="tx-notes"
            value={form.notes}
            maxLength={1000}
            placeholder="Detalle adicional, número de comprobante…"
            onChange={(event) => set('notes', event.target.value)}
          />
        </div>

        {!isEdit ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Confirmar al guardar</p>
              <p className="text-xs text-muted-foreground">
                Si lo desactivás, queda como borrador y no afecta saldos.
              </p>
            </div>
            <Switch
              checked={form.status === 'confirmed'}
              onCheckedChange={(checked) => set('status', checked ? 'confirmed' : 'pending')}
              label="Confirmar al guardar"
            />
          </div>
        ) : null}

        {initialRef.current?.rawTranscript && !isEdit ? (
          <Alert variant="info">
            <p className="font-medium">Transcripción de voz</p>
            <p className="mt-1 italic text-muted-foreground">
              “{initialRef.current.rawTranscript}”
            </p>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="danger" title="No se pudo guardar">
            {error}
          </Alert>
        ) : null}

        {!isEdit && (!householdId || !actor) ? (
          <Alert variant="warning">
            <Info className="size-4" />
            Falta cargar el hogar para guardar movimientos.
          </Alert>
        ) : null}
      </form>
    </Dialog>
  )
}
