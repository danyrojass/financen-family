import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { getMissingFirebaseKeys } from '@/lib/env'
import { AuthProvider } from '@/providers/auth-provider'
import { HouseholdProvider } from '@/providers/household-provider'
import { QuickAddProvider } from '@/providers/quick-add-provider'
import { ErrorBoundary } from '@/components/common/error-boundary'
import { ConfigErrorScreen } from '@/components/common/config-error'
import {
  FullScreenLoading,
  RequireAuth,
  RequireHousehold,
  RootRedirect,
} from '@/components/layout/guards'
import { PageSkeleton } from '@/components/ui/skeleton'

const LoginPage = lazy(() =>
  import('@/features/auth/login-page').then((module) => ({ default: module.LoginPage })),
)
const OnboardingPage = lazy(() =>
  import('@/features/onboarding/onboarding-page').then((module) => ({
    default: module.OnboardingPage,
  })),
)
const JoinPage = lazy(() =>
  import('@/features/join/join-page').then((module) => ({ default: module.JoinPage })),
)
const DashboardPage = lazy(() =>
  import('@/features/dashboard/dashboard-page').then((module) => ({
    default: module.DashboardPage,
  })),
)
const TransactionsPage = lazy(() =>
  import('@/features/transactions/transactions-page').then((module) => ({
    default: module.TransactionsPage,
  })),
)
const AccountsPage = lazy(() =>
  import('@/features/accounts/accounts-page').then((module) => ({
    default: module.AccountsPage,
  })),
)
const CardsPage = lazy(() =>
  import('@/features/cards/cards-page').then((module) => ({ default: module.CardsPage })),
)
const LoansPage = lazy(() =>
  import('@/features/loans/loans-page').then((module) => ({ default: module.LoansPage })),
)
const BudgetsPage = lazy(() =>
  import('@/features/budgets/budgets-page').then((module) => ({ default: module.BudgetsPage })),
)
const RecurringPage = lazy(() =>
  import('@/features/recurring/recurring-page').then((module) => ({
    default: module.RecurringPage,
  })),
)
const ReportsPage = lazy(() =>
  import('@/features/reports/reports-page').then((module) => ({ default: module.ReportsPage })),
)
const SettingsPage = lazy(() =>
  import('@/features/settings/settings-page').then((module) => ({
    default: module.SettingsPage,
  })),
)

function PageFallback() {
  return (
    <div className="p-3 sm:p-5">
      <PageSkeleton />
    </div>
  )
}

export default function App() {
  if (getMissingFirebaseKeys().length > 0) {
    return <ConfigErrorScreen />
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <HouseholdProvider>
          <QuickAddProvider>
            <Suspense fallback={<FullScreenLoading />}>
              <Routes>
                <Route path="/" element={<RootRedirect />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/join/:householdId/:invitationId" element={<JoinPage />} />
                <Route element={<RequireAuth />}>
                  <Route path="/onboarding" element={<OnboardingPage />} />
                  <Route path="/app" element={<RequireHousehold />}>
                    <Route
                      index
                      element={
                        <Suspense fallback={<PageFallback />}>
                          <DashboardPage />
                        </Suspense>
                      }
                    />
                    <Route
                      path="movimientos"
                      element={
                        <Suspense fallback={<PageFallback />}>
                          <TransactionsPage />
                        </Suspense>
                      }
                    />
                    <Route
                      path="cuentas"
                      element={
                        <Suspense fallback={<PageFallback />}>
                          <AccountsPage />
                        </Suspense>
                      }
                    />
                    <Route
                      path="tarjetas"
                      element={
                        <Suspense fallback={<PageFallback />}>
                          <CardsPage />
                        </Suspense>
                      }
                    />
                    <Route
                      path="prestamos"
                      element={
                        <Suspense fallback={<PageFallback />}>
                          <LoansPage />
                        </Suspense>
                      }
                    />
                    <Route
                      path="presupuestos"
                      element={
                        <Suspense fallback={<PageFallback />}>
                          <BudgetsPage />
                        </Suspense>
                      }
                    />
                    <Route
                      path="recurrentes"
                      element={
                        <Suspense fallback={<PageFallback />}>
                          <RecurringPage />
                        </Suspense>
                      }
                    />
                    <Route
                      path="informes"
                      element={
                        <Suspense fallback={<PageFallback />}>
                          <ReportsPage />
                        </Suspense>
                      }
                    />
                    <Route
                      path="ajustes"
                      element={
                        <Suspense fallback={<PageFallback />}>
                          <SettingsPage />
                        </Suspense>
                      }
                    />
                  </Route>
                </Route>
                <Route
                  path="*"
                  element={
                    <div className="flex min-h-dvh flex-col items-center justify-center gap-2 p-4 text-center">
                      <p className="text-lg font-semibold">Página no encontrada</p>
                      <a href="/" className="text-sm text-primary underline">
                        Volver al inicio
                      </a>
                    </div>
                  }
                />
              </Routes>
            </Suspense>
            <Analytics />
          </QuickAddProvider>
        </HouseholdProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}
