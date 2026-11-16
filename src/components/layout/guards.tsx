import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { PiggyBank } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { AppShell } from './app-shell'

export function FullScreenLoading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
        <PiggyBank className="size-6" />
      </span>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

export function RequireAuth() {
  const { user, initializing } = useAuth()
  const location = useLocation()

  if (initializing) return <FullScreenLoading label="Verificando sesión…" />
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    )
  }
  return <Outlet />
}

export function RequireHousehold() {
  const { profile, profileLoading } = useAuth()

  if (profileLoading) return <FullScreenLoading label="Cargando tu hogar…" />
  if (!profile?.activeHouseholdId) return <Navigate to="/onboarding" replace />
  return <AppShell />
}

export function RootRedirect() {
  const { user, profile, initializing, profileLoading } = useAuth()

  if (initializing || (user && profileLoading)) {
    return <FullScreenLoading />
  }
  if (!user) return <Navigate to="/login" replace />
  if (!profile?.activeHouseholdId) return <Navigate to="/onboarding" replace />
  return <Navigate to="/app" replace />
}
