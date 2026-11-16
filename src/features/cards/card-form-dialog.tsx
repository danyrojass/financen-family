import * as React from 'react'
import { Save } from 'lucide-react'
import type { Card } from '@/domain/models'
import { CURRENCY_CODES, formatMoney, parseAmountToMinor, type CurrencyCode } from '@/domain/money'
import type { CardInput } from '@/data/schemas'
import { createCard, updateCard } from '@/data/cards'
import { useHousehold } from '@/providers/household-provider'
import { useToast } from '@/components/ui/toast'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Label, FieldError } from '@/components/ui/label'
import { MoneyInput } from '@/components/ui/money-input'
import { SwitchField } from '@/components/ui/switch'
import { errorMessage } from '@/lib/errors'

interface FormState {
  name: string
  issuer: string
  holderId: string
  limit: string
  currency: CurrencyCode
  closingDay: string
  dueDay: string
  isActive: boolean
  notes: string
}

function initialState(card: Card | null, baseCurrency: CurrencyCode): FormState {
  return {
    name: card?.name ?? '',
    issuer: card?.issuer ?? '',
    holderId: card?.holderId ?? '',
    limit: card ? formatMoney(card.limitMinor, card.currency, { withSymbol: false }) : '',
    currency: card?.currency ?? baseCurrency,
    closingDay: String(card?.closingDay ?? 25),
    dueDay: String(card?.dueDay ?? 5),
    isActive: card?.isActive ?? true,
    notes: card?.notes ?? '',
  }
}

export function CardFormDialog({
  open,
  onOpenChange,
  card,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  card: Card | null
  onSaved?: () => void
}) {
  const { householdId, members, ctx, actor } = useHousehold()
  const { toast } = useToast()
  const [form, setForm] = React.useState<FormState>(() => initialState(card, ctx.baseCurrency))
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setForm(initialState(card, ctx.baseCurrency))
    setError(null)
  }, [card, ctx.baseCurrency, open])

  const patch = (values: Partial<FormState>) => setForm((current) => ({ ...current, ...values }))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!householdId || !actor) return
    setError(null)

    const limitMinor = parseAmountToMinor(form.limit, form.currency)
    if (limitMinor == null || limitMinor <= 0) {
      setError('El límite debe ser un importe mayor a 0.')
      return
    }
    const closingDay = Number(form.closingDay)
    const dueDay = Number(form.dueDay)
    if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31) {
      setError('El día de cierre debe estar entre 1 y 31.')
      return
    }
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
      setError('El día de vencimiento debe estar entre 1 y 31.')
      return
    }

    const input: CardInput = {
      name: form.name.trim(),
      issuer: form.issuer.trim(),
      holderId: form.holderId || null,
      limitMinor,
      currency: form.currency,
      closingDay,
      dueDay,
      isActive: form.isActive,
      notes: form.notes.trim() || null,
    }

    setSaving(true)
    try {
      if (card) {
        await updateCard(householdId, card.id, actor.uid, input)
        toast({ title: 'Tarjeta actualizada', variant: 'success' })
      } else {
        await createCard(householdId, actor.uid, input)
        toast({ title: 'Tarjeta creada', variant: 'success' })
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
      title={card ? 'Editar tarjeta' : 'Nueva tarjeta'}
      description="La deuda se calcula con los consumos, avances y pagos confirmados."
      footer={
        <>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="card-form" loading={saving}>
            <Save />
            Guardar
          </Button>
        </>
      }
    >
      <form id="card-form" className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="card-name">Nombre</Label>
            <Input
              id="card-name"
              value={form.name}
              onChange={(event) => patch({ name: event.target.value })}
              placeholder="Visa Itaú"
              maxLength={120}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="card-issuer">Institución</Label>
            <Input
              id="card-issuer"
              value={form.issuer}
              onChange={(event) => patch({ issuer: event.target.value })}
              placeholder="Itaú, Ueno, Continental…"
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-currency">Moneda</Label>
            <Select
              id="card-currency"
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
          <div className="space-y-1.5">
            <Label htmlFor="card-holder">Titular</Label>
            <Select
              id="card-holder"
              value={form.holderId}
              onChange={(event) => patch({ holderId: event.target.value })}
            >
              <option value="">Del hogar</option>
              {members.map((member) => (
                <option key={member.uid} value={member.uid}>
                  {member.displayName}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="card-limit">Límite</Label>
          <MoneyInput
            id="card-limit"
            value={form.limit}
            onValueChange={(value) => patch({ limit: value })}
            currency={form.currency}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="card-closing">Día de cierre</Label>
            <Input
              id="card-closing"
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              value={form.closingDay}
              onChange={(event) => patch({ closingDay: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="card-due">Día de vencimiento</Label>
            <Input
              id="card-due"
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              value={form.dueDay}
              onChange={(event) => patch({ dueDay: event.target.value })}
            />
          </div>
        </div>

        <SwitchField
          checked={form.isActive}
          onCheckedChange={(checked) => patch({ isActive: checked })}
          label="Tarjeta activa"
          description="Las inactivas no aparecen al registrar movimientos."
        />

        <div className="space-y-1.5">
          <Label htmlFor="card-notes">Notas</Label>
          <Textarea
            id="card-notes"
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
