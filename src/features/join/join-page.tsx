import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, CheckCircle2, LogIn, Mail, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { acceptInvitation, getInvitation } from '@/data/households'
import type { Invitation } from '@/domain/models'
import { formatDate } from '@/lib/date'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert } from '@/components/ui/alert'
import { FullScreenLoading } from '@/components/layout/guards'

export function JoinPage() {
  const { householdId = '', invitationId = '' } = useParams()
  const { user, profile, signIn, initializing, profileLoading } = useAuth()
  const navigate = useNavigate()

  const [invitation, setInvitation] = React.useState<Invitation | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [accepting, setAccepting] = React.useState(false)
  const [signingIn, setSigningIn] = React.useState(false)

  const alreadyMember = Boolean(profile?.householdIds.includes(householdId))

  React.useEffect(() => {
    if (!user || !householdId || !invitationId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void getInvitation(householdId, invitationId)
      .then((result) => {
        if (cancelled) return
        if (!result) {
          setError(
            'La invitación no existe, ya fue utilizada o venció. Pedile al owner que genere una nueva.',
          )
        } else {
          setInvitation(result)
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorMessage(loadError))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [householdId, invitationId, user])

  const handleSignIn = async () => {
    setSigningIn(true)
    setError(null)
    try {
      await signIn()
    } catch (signInError) {
      setError(errorMessage(signInError))
    } finally {
      setSigningIn(false)
    }
  }

  const handleAccept = async () => {
    if (!user) return
    setAccepting(true)
    setError(null)
    try {
      await acceptInvitation({ user, householdId, invitationId })
      navigate('/app', { replace: true })
    } catch (acceptError) {
      setError(errorMessage(acceptError))
    } finally {
      setAccepting(false)
    }
  }

  if (initializing || (user && profileLoading)) {
    return <FullScreenLoading label="Verificando invitación…" />
  }

  const emailMismatch = Boolean(
    invitation?.email &&
      user?.email &&
      invitation.email.toLowerCase() !== user.email.toLowerCase(),
  )

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="size-4" />
            </span>
            <CardTitle>Invitación a un hogar</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!user ? (
            <>
              <p className="text-sm text-muted-foreground">
                Para aceptar la invitación necesitás ingresar con tu cuenta de Google. Después
                volvés automáticamente a esta pantalla.
              </p>
              {error ? (
                <Alert variant="danger" title="No se pudo ingresar">
                  {error}
                </Alert>
              ) : null}
              <Button className="w-full" loading={signingIn} onClick={() => void handleSignIn()}>
                <LogIn />
                Ingresar con Google
              </Button>
              <Link to="/login" className="block text-center text-xs text-muted-foreground underline">
                Volver al inicio
              </Link>
            </>
          ) : alreadyMember ? (
            <>
              <Alert variant="success" title="Ya formás parte de este hogar">
                Podés entrar directamente al panel.
              </Alert>
              <Button className="w-full" onClick={() => navigate('/app')}>
                Ir al panel
                <ArrowRight />
              </Button>
            </>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Cargando la invitación…</p>
          ) : error ? (
            <>
              <Alert variant="danger" title="Invitación no disponible">
                {error}
              </Alert>
              <Button variant="outline" className="w-full" onClick={() => navigate('/onboarding')}>
                Crear mi propio hogar
              </Button>
            </>
          ) : invitation ? (
            <>
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Hogar</p>
                <p className="text-lg font-semibold">{invitation.householdName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Invitación válida hasta {formatDate(invitation.expiresAt, 'long')}
                </p>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <Mail className="size-4 text-muted-foreground" />
                <span>
                  Ingresaste como <strong>{user.email}</strong>
                </span>
              </div>

              {emailMismatch ? (
                <Alert variant="warning" title="La invitación es para otra cuenta">
                  Fue creada para <strong>{invitation.email}</strong>. Cerrá sesión e ingresá con esa
                  cuenta de Google.
                </Alert>
              ) : null}

              {invitation.email ? (
                <Alert variant="info">
                  Esta invitación está reservada para <strong>{invitation.email}</strong>.
                </Alert>
              ) : null}

              <Button
                className="w-full"
                loading={accepting}
                disabled={emailMismatch}
                onClick={() => void handleAccept()}
              >
                <CheckCircle2 />
                Aceptar invitación
              </Button>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                Al aceptar vas a poder ver y editar todos los movimientos, cuentas y presupuestos del
                hogar.
              </p>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
