import * as React from 'react'
import {
  Archive,
  ArchiveRestore,
  Copy,
  LogOut,
  Mail,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Sun,
  Monitor,
  Trash2,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react'
import type { Category, CategoryKind, HouseholdMember, Invitation } from '@/domain/models'
import { CURRENCY_CODES, formatMoney, formatPercent, type CurrencyCode } from '@/domain/money'
import {
  countHouseholdMembers,
  createInvitation,
  deleteHousehold,
  leaveHousehold,
  listInvitations,
  removeMember,
  revokeInvitation,
  updateHousehold,
} from '@/data/households'
import { archiveCategory, deleteCategory } from '@/data/categories'
import { removeHouseholdFromUser } from '@/data/users'
import { formatDate, formatDateTime } from '@/lib/date'
import { ROLE_LABELS } from '@/lib/labels'
import { errorMessage } from '@/lib/errors'
import { useAuth } from '@/providers/auth-provider'
import { useHousehold } from '@/providers/household-provider'
import { useTheme, type ThemeMode } from '@/providers/theme-provider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Input, Select } from '@/components/ui/input'
import { Label, FieldError, FieldHint } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Alert } from '@/components/ui/alert'
import { cn, initials } from '@/lib/utils'
import { CategoryFormDialog } from './category-form-dialog'

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; icon: React.ReactNode }> = [
  { value: 'light', label: 'Claro', icon: <Sun className="size-4" /> },
  { value: 'dark', label: 'Oscuro', icon: <Moon className="size-4" /> },
  { value: 'system', label: 'Sistema', icon: <Monitor className="size-4" /> },
]

export function SettingsPage() {
  const { user, profile, signOut } = useAuth()
  const {
    householdId,
    household,
    members,
    isOwner,
    categories,
    budgets,
    transactions,
    ctx,
    actor,
  } = useHousehold()
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()

  const [name, setName] = React.useState('')
  const [baseCurrency, setBaseCurrency] = React.useState<CurrencyCode>(ctx.baseCurrency)
  const [rates, setRates] = React.useState<Record<string, string>>({})
  const [savingHousehold, setSavingHousehold] = React.useState(false)
  const [householdError, setHouseholdError] = React.useState<string | null>(null)

  const [invitations, setInvitations] = React.useState<Invitation[]>([])
  const [invitationsLoading, setInvitationsLoading] = React.useState(false)
  const [inviteEmail, setInviteEmail] = React.useState('')
  const [inviteLink, setInviteLink] = React.useState<string | null>(null)
  const [inviting, setInviting] = React.useState(false)

  const [categoryKind, setCategoryKind] = React.useState<CategoryKind>('expense')
  const [categoryFormOpen, setCategoryFormOpen] = React.useState(false)
  const [editingCategory, setEditingCategory] = React.useState<Category | null>(null)
  const [deleteCategoryTarget, setDeleteCategoryTarget] = React.useState<Category | null>(null)

  const [removeMemberTarget, setRemoveMemberTarget] = React.useState<HouseholdMember | null>(null)
  const [leaveOpen, setLeaveOpen] = React.useState(false)
  const [deleteHouseholdOpen, setDeleteHouseholdOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!household) return
    setName(household.name)
    setBaseCurrency(household.baseCurrency)
    const next: Record<string, string> = {}
    for (const code of CURRENCY_CODES) {
      if (code === household.baseCurrency) continue
      next[code] = household.fxRates[code] ? String(household.fxRates[code]) : ''
    }
    setRates(next)
  }, [household])

  const loadInvitations = React.useCallback(async () => {
    if (!householdId || !isOwner) return
    setInvitationsLoading(true)
    try {
      setInvitations(await listInvitations(householdId))
    } catch (listError) {
      toast({
        title: 'No se pudieron cargar las invitaciones',
        description: errorMessage(listError),
        variant: 'error',
      })
    } finally {
      setInvitationsLoading(false)
    }
  }, [householdId, isOwner, toast])

  React.useEffect(() => {
    void loadInvitations()
  }, [loadInvitations])

  const otherCurrencies = CURRENCY_CODES.filter((code) => code !== baseCurrency)

  const handleSaveHousehold = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!householdId || !isOwner) return
    setHouseholdError(null)
    if (!name.trim()) {
      setHouseholdError('El nombre del hogar es obligatorio.')
      return
    }

    const fxRates: Record<string, number> = {}
    for (const code of CURRENCY_CODES) {
      if (code === baseCurrency) {
        fxRates[code] = 1
        continue
      }
      const raw = Number((rates[code] ?? '').replace(',', '.'))
      if (!Number.isFinite(raw) || raw <= 0) {
        setHouseholdError(
          `Ingresá una cotización válida para ${code} (unidades de ${baseCurrency} por 1 ${code}).`,
        )
        return
      }
      fxRates[code] = raw
    }

    setSavingHousehold(true)
    try {
      await updateHousehold(householdId, { name: name.trim(), baseCurrency, fxRates })
      toast({ title: 'Hogar actualizado', variant: 'success' })
    } catch (saveError) {
      setHouseholdError(errorMessage(saveError))
    } finally {
      setSavingHousehold(false)
    }
  }

  const handleCreateInvitation = async () => {
    if (!householdId || !household || !actor) return
    setInviting(true)
    setInviteLink(null)
    try {
      const result = await createInvitation({
        householdId,
        householdName: household.name,
        createdBy: actor.uid,
        email: inviteEmail.trim() || undefined,
      })
      const link = `${window.location.origin}/join/${householdId}/${result.invitationId}`
      setInviteLink(link)
      setInviteEmail('')
      toast({
        title: 'Invitación creada',
        description: `Vence el ${formatDate(result.expiresAt)}. Compartí el link con la otra persona.`,
        variant: 'success',
      })
      await loadInvitations()
    } catch (inviteError) {
      toast({ title: 'No se pudo crear la invitación', description: errorMessage(inviteError), variant: 'error' })
    } finally {
      setInviting(false)
    }
  }

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link)
      toast({ title: 'Link copiado', variant: 'success' })
    } catch {
      toast({
        title: 'No se pudo copiar',
        description: 'Copiá el link manualmente desde el campo.',
        variant: 'warning',
      })
    }
  }

  const handleRevoke = async (invitation: Invitation) => {
    if (!householdId) return
    setBusy(true)
    try {
      await revokeInvitation(householdId, invitation.id)
      toast({ title: 'Invitación revocada', variant: 'success' })
      await loadInvitations()
    } catch (revokeError) {
      toast({ title: 'No se pudo revocar', description: errorMessage(revokeError), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const handleRemoveMember = async () => {
    if (!householdId || !removeMemberTarget) return
    setBusy(true)
    try {
      await removeMember(householdId, removeMemberTarget.uid)
      toast({ title: `${removeMemberTarget.displayName} ya no pertenece al hogar`, variant: 'success' })
      setRemoveMemberTarget(null)
    } catch (removeError) {
      toast({ title: 'No se pudo quitar al integrante', description: errorMessage(removeError), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const handleToggleArchive = async (category: Category) => {
    if (!householdId || !actor) return
    setBusy(true)
    try {
      await archiveCategory(householdId, category.id, actor.uid, !category.isArchived)
      toast({
        title: category.isArchived ? 'Categoría restaurada' : 'Categoría archivada',
        variant: 'success',
      })
    } catch (archiveError) {
      toast({ title: 'No se pudo actualizar', description: errorMessage(archiveError), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const categoryReferences = (category: Category) => {
    const children = categories.filter((item) => item.parentId === category.id).length
    const budgetCount = budgets.filter((budget) => budget.categoryId === category.id).length
    const txCount = transactions.filter((tx) => tx.categoryId === category.id).length
    return { children, budgetCount, txCount }
  }

  const handleDeleteCategory = async () => {
    if (!householdId || !deleteCategoryTarget) return
    const refs = categoryReferences(deleteCategoryTarget)
    if (refs.children > 0 || refs.budgetCount > 0 || refs.txCount > 0) {
      toast({
        title: 'No se puede eliminar',
        description: 'Tiene subcategorías, presupuestos o movimientos. Archivala en su lugar.',
        variant: 'error',
      })
      return
    }
    setBusy(true)
    try {
      await deleteCategory(householdId, deleteCategoryTarget.id)
      toast({ title: 'Categoría eliminada', variant: 'success' })
      setDeleteCategoryTarget(null)
    } catch (deleteError) {
      toast({ title: 'No se pudo eliminar', description: errorMessage(deleteError), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const handleLeave = async () => {
    if (!householdId || !user || !profile) return
    const remaining = profile.householdIds.filter((id) => id !== householdId)
    setBusy(true)
    try {
      await leaveHousehold({ householdId, user, remainingHouseholdIds: remaining })
      toast({ title: 'Saliste del hogar', variant: 'success' })
      setLeaveOpen(false)
    } catch (leaveError) {
      toast({ title: 'No se pudo salir', description: errorMessage(leaveError), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteHousehold = async () => {
    if (!householdId || !user || !profile) return
    setBusy(true)
    try {
      const total = await countHouseholdMembers(householdId)
      if (total > 1) {
        toast({
          title: 'El hogar todavía tiene integrantes',
          description: 'Quitá a los demás integrantes antes de eliminar el hogar.',
          variant: 'error',
        })
        return
      }
      await deleteHousehold(householdId)
      const remaining = profile.householdIds.filter((id) => id !== householdId)
      await removeHouseholdFromUser(user.uid, remaining)
      toast({ title: 'Hogar eliminado', variant: 'success' })
      setDeleteHouseholdOpen(false)
    } catch (deleteError) {
      toast({ title: 'No se pudo eliminar el hogar', description: errorMessage(deleteError), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const parents = categories.filter((category) => !category.parentId)
  const categoriesByKind = categories
    .filter((category) => category.kind === categoryKind)
    .sort((a, b) => {
      if (Boolean(a.parentId) !== Boolean(b.parentId)) return a.parentId ? 1 : -1
      return a.name.localeCompare(b.name)
    })

  const totalCategorySpend = transactions.filter(
    (tx) => tx.status === 'confirmed' && !tx.deletedAt && tx.type === 'expense',
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ajustes"
        description="Hogar, integrantes, invitaciones, categorías y apariencia."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Hogar</CardTitle>
            <CardDescription>Nombre, moneda base y cotizaciones.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSaveHousehold}>
              <div className="space-y-1.5">
                <Label htmlFor="household-name">Nombre del hogar</Label>
                <Input
                  id="household-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={!isOwner}
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="household-base">Moneda base</Label>
                <Select
                  id="household-base"
                  value={baseCurrency}
                  onChange={(event) => {
                    const next = event.target.value as CurrencyCode
                    setBaseCurrency(next)
                    setRates((current) => {
                      const nextRates: Record<string, string> = {}
                      for (const code of CURRENCY_CODES) {
                        if (code === next) continue
                        nextRates[code] = current[code] ?? ''
                      }
                      return nextRates
                    })
                  }}
                  disabled={!isOwner}
                >
                  {CURRENCY_CODES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
                <FieldHint>
                  Los movimientos históricos conservan el importe base con el que se registraron.
                </FieldHint>
              </div>

              {otherCurrencies.map((code) => (
                <div key={code} className="space-y-1.5">
                  <Label htmlFor={`rate-${code}`}>
                    Cotización de {code} (1 {code} = ? {baseCurrency})
                  </Label>
                  <Input
                    id={`rate-${code}`}
                    inputMode="decimal"
                    value={rates[code] ?? ''}
                    onChange={(event) =>
                      setRates((current) => ({ ...current, [code]: event.target.value }))
                    }
                    placeholder={baseCurrency === 'PYG' ? '7300' : '0,000137'}
                    disabled={!isOwner}
                  />
                </div>
              ))}

              <FieldError>{householdError}</FieldError>

              {isOwner ? (
                <Button type="submit" loading={savingHousehold}>
                  <Save />
                  Guardar hogar
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Solo el owner puede modificar los datos del hogar.
                </p>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle>Integrantes</CardTitle>
                <CardDescription>{members.length} persona(s) en el hogar.</CardDescription>
              </div>
              <Badge variant="outline">{ROLE_LABELS[isOwner ? 'OWNER' : 'MEMBER']}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {members.map((member) => (
              <div
                key={member.uid}
                className="flex items-center gap-3 rounded-lg border border-border p-2.5"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {initials(member.displayName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{member.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                </div>
                <Badge variant={member.role === 'OWNER' ? 'default' : 'outline'}>
                  {ROLE_LABELS[member.role]}
                </Badge>
                {isOwner && member.role === 'MEMBER' ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive"
                    aria-label={`Quitar a ${member.displayName}`}
                    onClick={() => setRemoveMemberTarget(member)}
                  >
                    <UserMinus />
                  </Button>
                ) : null}
              </div>
            ))}

            <div className="flex flex-wrap gap-2 pt-1">
              {!isOwner ? (
                <Button variant="outline" onClick={() => setLeaveOpen(true)}>
                  <LogOut />
                  Salir del hogar
                </Button>
              ) : (
                <Button variant="outline" className="text-destructive" onClick={() => setDeleteHouseholdOpen(true)}>
                  <Trash2 />
                  Eliminar hogar
                </Button>
              )}
              <Button variant="ghost" onClick={() => void signOut()}>
                <LogOut />
                Cerrar sesión
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {isOwner ? (
        <Card>
          <CardHeader>
            <CardTitle>Invitaciones</CardTitle>
            <CardDescription>
              Generá un link seguro para sumar a tu pareja. Vence en 7 días y es de un solo uso.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="invite-email">Email (opcional)</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="pareja@correo.com"
                />
                <FieldHint>Si lo completás, la invitación solo sirve para esa cuenta de Google.</FieldHint>
              </div>
              <Button type="button" loading={inviting} onClick={() => void handleCreateInvitation()}>
                <UserPlus />
                Generar invitación
              </Button>
            </div>

            {inviteLink ? (
              <div className="space-y-1.5 rounded-lg border border-success/40 bg-success/5 p-3">
                <p className="text-xs font-medium">Link de invitación</p>
                <div className="flex gap-2">
                  <Input readOnly value={inviteLink} className="h-9" />
                  <Button type="button" variant="outline" size="sm" onClick={() => void copyLink(inviteLink)}>
                    <Copy />
                    Copiar
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Historial</p>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={invitationsLoading}
                  onClick={() => void loadInvitations()}
                >
                  <RefreshCw />
                  Actualizar
                </Button>
              </div>
              {invitations.length === 0 ? (
                <p className="text-xs text-muted-foreground">Todavía no creaste invitaciones.</p>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {invitations.map((invitation) => (
                    <div key={invitation.id} className="flex items-center gap-2 p-2.5">
                      <Mail className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                          {invitation.email || 'Link abierto'}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatDateTime(invitation.createdAt)} · vence{' '}
                          {formatDate(invitation.expiresAt)}
                        </p>
                      </div>
                      <Badge
                        variant={
                          invitation.status === 'pending'
                            ? 'warning'
                            : invitation.status === 'accepted'
                              ? 'success'
                              : 'outline'
                        }
                      >
                        {invitation.status === 'pending'
                          ? 'Pendiente'
                          : invitation.status === 'accepted'
                            ? 'Aceptada'
                            : invitation.status === 'revoked'
                              ? 'Revocada'
                              : 'Vencida'}
                      </Badge>
                      {invitation.status === 'pending' ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Revocar invitación"
                          disabled={busy}
                          onClick={() => void handleRevoke(invitation)}
                        >
                          <X />
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Categorías</CardTitle>
              <CardDescription>
                {parents.length} principal(es) · {categories.length} en total
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setEditingCategory(null)
                setCategoryFormOpen(true)
              }}
            >
              <Plus />
              Nueva
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs
            value={categoryKind}
            onValueChange={(value) => setCategoryKind(value as CategoryKind)}
            items={[
              { value: 'expense', label: 'Gastos' },
              { value: 'income', label: 'Ingresos' },
            ]}
            className="max-w-xs"
          />
          {categoriesByKind.length === 0 ? (
            <p className="text-xs text-muted-foreground">No hay categorías de este tipo.</p>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {categoriesByKind.map((category) => {
                const refs = categoryReferences(category)
                return (
                  <div key={category.id} className="flex items-center gap-2 p-2.5">
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: category.color ?? '#94a3b8' }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate text-sm', category.parentId && 'pl-3')}>
                        {category.parentId ? '— ' : ''}
                        {category.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {refs.txCount} movimiento(s) · {refs.budgetCount} presupuesto(s)
                        {category.isArchived ? ' · archivada' : ''}
                      </p>
                    </div>
                    {category.isArchived ? <Badge variant="outline">Archivada</Badge> : null}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Editar ${category.name}`}
                      onClick={() => {
                        setEditingCategory(category)
                        setCategoryFormOpen(true)
                      }}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={category.isArchived ? 'Restaurar' : 'Archivar'}
                      disabled={busy}
                      onClick={() => void handleToggleArchive(category)}
                    >
                      {category.isArchived ? <ArchiveRestore /> : <Archive />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive"
                      aria-label={`Eliminar ${category.name}`}
                      onClick={() => setDeleteCategoryTarget(category)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Apariencia</CardTitle>
            <CardDescription>El modo sistema sigue la configuración del dispositivo.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              {THEME_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={theme === option.value ? 'default' : 'outline'}
                  onClick={() => setTheme(option.value)}
                >
                  {option.icon}
                  {option.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resumen del hogar</CardTitle>
            <CardDescription>Datos calculados con movimientos confirmados.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Moneda base</span>
              <span className="font-medium">{household?.baseCurrency ?? ctx.baseCurrency}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Movimientos cargados</span>
              <span className="font-medium tabular-nums">{transactions.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Gastos confirmados</span>
              <span className="font-medium tabular-nums">
                {formatMoney(
                  totalCategorySpend.reduce((total, tx) => total + tx.baseAmountMinor, 0),
                  ctx.baseCurrency,
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tasa USD</span>
              <span className="font-medium tabular-nums">
                {household?.fxRates.USD ? formatPercent(household.fxRates.USD, 2) : 'Sin configurar'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Alert variant="info" title="Privacidad y respaldo">
        Los datos viven en Firestore bajo reglas por hogar. Solo los integrantes pueden leer y
        escribir. Podés exportar tus movimientos desde Informes.
      </Alert>

      <CategoryFormDialog
        open={categoryFormOpen}
        onOpenChange={setCategoryFormOpen}
        category={editingCategory}
        defaultKind={categoryKind}
        onSaved={() => setEditingCategory(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteCategoryTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteCategoryTarget(null)
        }}
        title="¿Eliminar la categoría?"
        description={
          deleteCategoryTarget
            ? (() => {
                const refs = categoryReferences(deleteCategoryTarget)
                return refs.children + refs.budgetCount + refs.txCount > 0
                  ? `Tiene ${refs.children} subcategoría(s), ${refs.budgetCount} presupuesto(s) y ${refs.txCount} movimiento(s). Archivala para conservar el historial.`
                  : 'La categoría se borra definitivamente.'
              })()
            : undefined
        }
        confirmLabel="Eliminar"
        loading={busy}
        onConfirm={handleDeleteCategory}
      />

      <ConfirmDialog
        open={Boolean(removeMemberTarget)}
        onOpenChange={(open) => {
          if (!open) setRemoveMemberTarget(null)
        }}
        title="¿Quitar al integrante?"
        description={
          removeMemberTarget
            ? `${removeMemberTarget.displayName} perderá el acceso al hogar. Sus movimientos se conservan.`
            : undefined
        }
        confirmLabel="Quitar"
        loading={busy}
        onConfirm={handleRemoveMember}
      />

      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="¿Salir del hogar?"
        description="Dejarás de ver los movimientos y cuentas de este hogar. El owner puede volver a invitarte."
        confirmLabel="Salir"
        loading={busy}
        onConfirm={handleLeave}
      />

      <ConfirmDialog
        open={deleteHouseholdOpen}
        onOpenChange={setDeleteHouseholdOpen}
        title="¿Eliminar el hogar?"
        description="Se borra el hogar y su configuración. Los movimientos y cuentas deben quedar sin acceso. Asegurate de haber exportado lo que necesites."
        confirmLabel="Eliminar hogar"
        loading={busy}
        onConfirm={handleDeleteHousehold}
      />
    </div>
  )
}
