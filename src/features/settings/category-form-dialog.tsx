import * as React from 'react'
import { Save } from 'lucide-react'
import type { Category, CategoryKind } from '@/domain/models'
import type { CategoryInput } from '@/data/schemas'
import { createCategory, updateCategory } from '@/data/categories'
import { errorMessage } from '@/lib/errors'
import { useHousehold } from '@/providers/household-provider'
import { useToast } from '@/components/ui/toast'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Label, FieldError, FieldHint } from '@/components/ui/label'

interface FormState {
  name: string
  kind: CategoryKind
  parentId: string
  color: string
  isArchived: boolean
}

function initialState(category: Category | null, defaultKind: CategoryKind): FormState {
  return {
    name: category?.name ?? '',
    kind: category?.kind ?? defaultKind,
    parentId: category?.parentId ?? '',
    color: category?.color ?? '#0f766e',
    isArchived: category?.isArchived ?? false,
  }
}

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  defaultKind,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: Category | null
  defaultKind: CategoryKind
  onSaved?: () => void
}) {
  const { householdId, categories, actor } = useHousehold()
  const { toast } = useToast()
  const [form, setForm] = React.useState<FormState>(() => initialState(category, defaultKind))
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setForm(initialState(category, defaultKind))
    setError(null)
  }, [category, defaultKind, open])

  const patch = (values: Partial<FormState>) => setForm((current) => ({ ...current, ...values }))

  const parentOptions = categories.filter(
    (item) => !item.parentId && item.kind === form.kind && item.id !== category?.id,
  )

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!householdId || !actor) return
    setError(null)

    if (!form.name.trim()) {
      setError('El nombre es obligatorio.')
      return
    }

    const input: CategoryInput = {
      name: form.name.trim(),
      kind: form.kind,
      parentId: form.parentId || null,
      color: form.color || null,
      icon: category?.icon ?? null,
      isArchived: form.isArchived,
    }

    setSaving(true)
    try {
      if (category) {
        await updateCategory(householdId, category.id, actor.uid, input)
        toast({ title: 'Categoría actualizada', variant: 'success' })
      } else {
        await createCategory(householdId, actor.uid, input)
        toast({ title: 'Categoría creada', variant: 'success' })
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
      title={category ? 'Editar categoría' : 'Nueva categoría'}
      description="Las subcategorías heredan el presupuesto de la categoría padre."
      footer={
        <>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="category-form" loading={saving}>
            <Save />
            Guardar
          </Button>
        </>
      }
    >
      <form id="category-form" className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="category-kind">Tipo</Label>
            <Select
              id="category-kind"
              value={form.kind}
              onChange={(event) => patch({ kind: event.target.value as CategoryKind, parentId: '' })}
            >
              <option value="expense">Gasto</option>
              <option value="income">Ingreso</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="category-color">Color</Label>
            <div className="flex items-center gap-2">
              <input
                id="category-color"
                type="color"
                value={form.color}
                onChange={(event) => patch({ color: event.target.value })}
                className="h-10 w-14 cursor-pointer rounded-lg border border-input bg-card"
              />
              <Input
                aria-label="Código de color"
                value={form.color}
                onChange={(event) => patch({ color: event.target.value })}
                maxLength={32}
              />
            </div>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="category-name">Nombre</Label>
            <Input
              id="category-name"
              value={form.name}
              onChange={(event) => patch({ name: event.target.value })}
              maxLength={80}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="category-parent">Categoría padre</Label>
            <Select
              id="category-parent"
              value={form.parentId}
              onChange={(event) => patch({ parentId: event.target.value })}
            >
              <option value="">Sin padre (categoría principal)</option>
              {parentOptions.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name}
                </option>
              ))}
            </Select>
            <FieldHint>Si elegís un padre, esta categoría será una subcategoría.</FieldHint>
          </div>
        </div>

        <FieldError>{error}</FieldError>
      </form>
    </Dialog>
  )
}
