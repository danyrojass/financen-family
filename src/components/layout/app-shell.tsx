import * as React from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  BarChart3,
  CreditCard,
  Home,
  Landmark,
  LayoutDashboard,
  LogOut,
  Moon,
  PiggyBank,
  Plus,
  Repeat,
  Settings,
  Sun,
  Wallet,
} from 'lucide-react'
import { cn, firstName } from '@/lib/utils'
import { useAuth } from '@/providers/auth-provider'
import { useHousehold } from '@/providers/household-provider'
import { useQuickAdd } from '@/providers/quick-add-provider'
import { useTheme } from '@/providers/theme-provider'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { Select } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { PageSkeleton } from '@/components/ui/skeleton'

const NAV_ITEMS = [
  { to: '/app', label: 'Panel', icon: LayoutDashboard, end: true },
  { to: '/app/movimientos', label: 'Movimientos', icon: ArrowLeftRight },
  { to: '/app/cuentas', label: 'Cuentas', icon: Wallet },
  { to: '/app/tarjetas', label: 'Tarjetas', icon: CreditCard },
  { to: '/app/prestamos', label: 'Préstamos', icon: Landmark },
  { to: '/app/presupuestos', label: 'Presupuestos', icon: PiggyBank },
  { to: '/app/recurrentes', label: 'Recurrentes', icon: Repeat },
  { to: '/app/informes', label: 'Informes', icon: BarChart3 },
  { to: '/app/ajustes', label: 'Ajustes', icon: Settings },
]

const MOBILE_ITEMS = [
  { to: '/app', label: 'Panel', icon: Home, end: true },
  { to: '/app/movimientos', label: 'Movimientos', icon: ArrowLeftRight },
  { to: '/app/presupuestos', label: 'Presupuesto', icon: PiggyBank },
  { to: '/app/ajustes', label: 'Ajustes', icon: Settings },
]

export function AppShell() {
  const { profile, signOut } = useAuth()
  const { household, householdId, transactions, loading, error, switchHousehold } = useHousehold()
  const { openQuickAdd } = useQuickAdd()
  const { resolved, setTheme } = useTheme()
  const navigate = useNavigate()

  const householdOptions = profile?.householdIds ?? []
  const pendingCount = React.useMemo(
    () =>
      transactions.filter((tx) => !tx.deletedAt && tx.status === 'pending').length,
    [transactions],
  )

  const toggleTheme = () => setTheme(resolved === 'dark' ? 'light' : 'dark')

  return (
    <div className="min-h-dvh bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-card lg:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <PiggyBank className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Finanzas del Hogar</p>
            <p className="truncate text-xs text-muted-foreground">{household?.name ?? 'Mi hogar'}</p>
          </div>
        </div>

        {householdOptions.length > 1 ? (
          <div className="px-3 pb-3">
            <Select
              aria-label="Cambiar de hogar"
              value={householdId ?? ''}
              onChange={(event) => void switchHousehold(event.target.value)}
            >
              {householdOptions.map((id) => (
                <option key={id} value={id}>
                  Hogar {id.slice(0, 6)}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        <div className="px-3">
          <Button className="w-full" onClick={() => openQuickAdd()}>
            <Plus />
            Nuevo movimiento
          </Button>
        </div>

        <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )
              }
            >
              <item.icon className="size-4" />
              <span className="flex-1">{item.label}</span>
              {item.to === '/app/movimientos' && pendingCount > 0 ? (
                <Badge variant="warning">{pendingCount}</Badge>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2">
            <Avatar name={profile?.displayName ?? 'Usuario'} src={profile?.photoURL} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {firstName(profile?.displayName ?? 'Usuario')}
              </p>
              <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Cambiar tema" onClick={toggleTheme}>
              {resolved === 'dark' ? <Sun /> : <Moon />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Cerrar sesión"
              onClick={() => void signOut()}
            >
              <LogOut />
            </Button>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 text-left"
          onClick={() => navigate('/app')}
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <PiggyBank className="size-4" />
          </span>
          <span className="truncate text-sm font-semibold">{household?.name ?? 'Mi hogar'}</span>
        </button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Cambiar tema" onClick={toggleTheme}>
            {resolved === 'dark' ? <Sun /> : <Moon />}
          </Button>
          <button
            type="button"
            aria-label="Ir a ajustes"
            onClick={() => navigate('/app/ajustes')}
            className="rounded-full"
          >
            <Avatar
              name={profile?.displayName ?? 'Usuario'}
              src={profile?.photoURL}
              className="size-8"
            />
          </button>
        </div>
      </header>

      <main className="px-3 pb-24 pt-3 sm:px-5 lg:ml-60 lg:pb-8 lg:pt-6">
        <div className="mx-auto w-full max-w-6xl space-y-4">
          {error ? (
            <Alert variant="danger" title="Problema de conexión">
              {error}
            </Alert>
          ) : null}
          {loading ? <PageSkeleton /> : <Outlet />}
        </div>
      </main>

      <Button
        aria-label="Nuevo movimiento"
        className="fixed bottom-20 right-4 z-30 size-14 rounded-full shadow-lg lg:hidden"
        onClick={() => openQuickAdd()}
      >
        <Plus className="size-6" />
      </Button>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-card/95 pt-1 backdrop-blur lg:hidden">
        {MOBILE_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'relative flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] font-medium',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )
            }
          >
            <item.icon className="size-5" />
            {item.label}
            {item.to === '/app/movimientos' && pendingCount > 0 ? (
              <span className="absolute right-2 top-0.5 flex size-4 items-center justify-center rounded-full bg-warning text-[9px] font-bold text-warning-foreground">
                {pendingCount}
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
