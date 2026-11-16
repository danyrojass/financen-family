import * as React from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Home, LogOut, PiggyBank, Plus } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { createHousehold } from '@/data/households'
import { setActiveHousehold } from '@/data/users'
import { defaultUsdRate } from '@/lib/env'
import { errorMessage } from '@/lib/errors'
import type { CurrencyCode } from '@/domain/money'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { Label, FieldHint, FieldError } from '@/components/ui/label'
import { Alert } from '@/components/ui/alert'
import { PageHeader } from '@/components/ui/page-header'

export function OnboardingPage() {
  const { user, profile, signOut, profileLoading } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = React.useState('')
  const [baseCurrency, setBaseCurrency] = React.useState<CurrencyCode>('PYG')
  const [usdRate, setUsdRate] = React.useState(String(defaultUsdRate))
  const [creating, setCreating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [created, setCreated] = React.useState(false)
  const [switching, setSwitching] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!name) setName(profile ? `Hogar de ${profile.displayName.split(' ')[0]}` : 'Mi hogar')
  }, [name, profile])

  if (profileLoading) return null
  if (profile?.activeHouseholdId) return <Navigate to="/app" replace />
  if (!user) return <Navigate to="/login" replace />

  const parsedRate = Number(usdRate.replace(/\./g, '').replace(',', '.'))
  const rateValid = Number.isFinite(parsedRate) && parsedRate > 0

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Poné un nombre para tu hogar.')
      return
    }
    if (!rateValid) {
      setError('Ingresá una cotización válida del dólar.')
      return
    }

    const fxRates: Record<string, number> =
      baseCurrency === 'PYG' ? { USD: parsedRate } : { PYG: 1 / parsedRate }

    setCreating(true)
    try {
      await createHousehold({
        user,
        name: name.trim(),
        baseCurrency,
        fxRates,
      })
      setCreated(true)
    } catch (createError) {
      setError(errorMessage(createError))
    } finally {
      setCreating(false)
    }
  }

  const handleSwitch = async (householdId: string) => {
    if (!user) return
    setSwitching(householdId)
    try {
      await setActiveHousehold(user.uid, householdId)
      navigate('/app')
    } catch (switchError) {
      setError(errorMessage(switchError))
    } finally {
      setSwitching(null)
    }
  }

  return (
    <div className="min-h-dvh bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <PageHeader
          title="Creá tu hogar"
          description="El hogar es el espacio compartido donde viven tus cuentas, movimientos y presupuestos."
          actions={
            <Button variant="ghost" onClick={() => void signOut()}>
              <LogOut />
              Cerrar sesión
            </Button>
          }
        />

        {created ? (
          <Alert variant="success" title="Hogar creado">
            Estamos preparando tus categorías iniciales y entrando al panel…
          </Alert>
        ) : null}

        {(profile?.householdIds.length ?? 0) > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Hogares existentes</CardTitle>
              <CardDescription>
                Ya formás parte de estos hogares. Podés entrar a uno en lugar de crear otro.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {profile?.householdIds.map((id) => (
                <Button
                  key={id}
                  variant="outline"
                  className="w-full justify-between"
                  loading={switching === id}
                  onClick={() => void handleSwitch(id)}
                >
                  <span className="font-mono text-xs">{id}</span>
                  <span className="flex items-center gap-1 text-xs">
                    <Home className="size-3.5" /> Entrar
                  </span>
                </Button>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <PiggyBank className="size-4" />
              </span>
              <div>
                <CardTitle>Nuevo hogar</CardTitle>
                <CardDescription>Configuración inicial, se puede cambiar después.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleCreate}>
              <div className="space-y-1.5">
                <Label htmlFor="household-name">Nombre del hogar</Label>
                <Input
                  id="household-name"
                  value={name}
                  maxLength={80}
                  placeholder="Ej. Casa Rodríguez"
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="base-currency">Moneda base</Label>
                  <Select
                    id="base-currency"
                    value={baseCurrency}
                    onChange={(event) => setBaseCurrency(event.target.value as CurrencyCode)}
                  >
                    <option value="PYG">Guaraní (PYG)</option>
                    <option value="USD">Dólar (USD)</option>
                  </Select>
                  <FieldHint>
                    Los resúmenes se muestran en esta moneda. Los movimientos conservan la suya.
                  </FieldHint>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="usd-rate">Cotización del dólar (PYG)</Label>
                  <Input
                    id="usd-rate"
                    value={usdRate}
                    inputMode="decimal"
                    onChange={(event) => setUsdRate(event.target.value)}
                  />
                  <FieldHint>1 USD = {rateValid ? parsedRate.toLocaleString('es-PY') : '—'} PYG</FieldHint>
                  <FieldError>{!rateValid ? 'Ingresá un número mayor a 0.' : null}</FieldError>
                </div>
              </div>

              <Alert variant="info">
                La cotización se usa para convertir movimientos en USD a la moneda base. Cada
                movimiento guarda la tasa aplicada, así los informes históricos no cambian.
              </Alert>

              {error ? (
                <Alert variant="danger" title="No se pudo crear el hogar">
                  {error}
                </Alert>
              ) : null}

              <Button type="submit" className="w-full" loading={creating || created}>
                <Plus />
                Crear hogar y entrar
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          ¿Te invitaron a otro hogar? Abrí el link de invitación que te compartieron.
        </p>
      </div>
    </div>
  )
}
