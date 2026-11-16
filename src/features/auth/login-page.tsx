import * as React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ArrowRight, Lock, ShieldCheck, Users } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { FullScreenLoading } from '@/components/layout/guards'
import { errorMessage } from '@/lib/errors'

export function LoginPage() {
  const { user, profile, initializing, profileLoading, signIn, error } = useAuth()
  const location = useLocation()
  const [busy, setBusy] = React.useState(false)
  const [localError, setLocalError] = React.useState<string | null>(null)

  const from = (location.state as { from?: string } | null)?.from

  if (initializing || (user && profileLoading)) {
    return <FullScreenLoading label="Verificando sesión…" />
  }

  if (user && profile) {
    if (from && from.startsWith('/')) return <Navigate to={from} replace />
    return <Navigate to={profile.activeHouseholdId ? '/app' : '/onboarding'} replace />
  }

  const handleSignIn = async () => {
    setBusy(true)
    setLocalError(null)
    try {
      await signIn()
    } catch (signInError) {
      setLocalError(errorMessage(signInError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background lg:flex-row">
      <div className="hidden flex-1 flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="size-6" />
          Finanzas del Hogar
        </div>
        <div className="max-w-md space-y-4">
          <h1 className="text-3xl font-semibold leading-tight">
            Las cuentas de la casa, claras y en un solo lugar.
          </h1>
          <p className="text-primary-foreground/80">
            Registrá gastos por voz, controlá tarjetas y préstamos, armá presupuestos y compartí el
            hogar con tu pareja sin planillas sueltas.
          </p>
          <ul className="space-y-2 text-sm text-primary-foreground/80">
            <li className="flex items-center gap-2">
              <Users className="size-4" /> Un hogar, dos personas, los mismos números.
            </li>
            <li className="flex items-center gap-2">
              <Lock className="size-4" /> Datos aislados por hogar con reglas de Firestore.
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="size-4" /> Guaraníes y dólares con cotización registrada.
            </li>
          </ul>
        </div>
        <p className="text-xs text-primary-foreground/60">
          Hecho para familias de Paraguay. Funciona como app instalable (PWA).
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md space-y-5">
          <div className="text-center lg:hidden">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <ShieldCheck className="size-6" />
            </span>
            <h1 className="mt-3 text-xl font-semibold">Finanzas del Hogar</h1>
            <p className="text-sm text-muted-foreground">
              Gastos, ingresos, tarjetas y presupuestos de tu familia.
            </p>
          </div>

          <Card>
            <CardContent className="space-y-4 p-6">
              <div>
                <h2 className="text-lg font-semibold">Ingresá a tu hogar</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Usamos tu cuenta de Google para que no tengas que recordar otra contraseña.
                </p>
              </div>

              {error || localError ? (
                <Alert variant="danger" title="No se pudo iniciar sesión">
                  {localError ?? error}
                </Alert>
              ) : null}

              <Button className="w-full" size="lg" loading={busy} onClick={() => void handleSignIn()}>
                <svg viewBox="0 0 24 24" aria-hidden className="size-4">
                  <path
                    fill="currentColor"
                    d="M12 11v2.4h5.6c-.24 1.44-1.68 4.2-5.6 4.2a6.2 6.2 0 0 1 0-12.4c1.92 0 3.2.8 3.92 1.52l2-1.92C16.36 3.6 14.4 2.8 12 2.8a9.2 9.2 0 1 0 0 18.4c5.32 0 8.8-3.72 8.8-8.96 0-.6-.08-1.04-.16-1.24H12Z"
                  />
                </svg>
                Continuar con Google
                <ArrowRight />
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                ¿Te invitaron? Abrí el link de invitación que te compartió el owner del hogar.
              </p>
            </CardContent>
          </Card>

          <p className="px-4 text-center text-xs text-muted-foreground">
            Al ingresar aceptás que tus movimientos se guarden en el proyecto Firebase de la app,
            accesibles solo para los integrantes de tu hogar.
          </p>
        </div>
      </div>
    </div>
  )
}
