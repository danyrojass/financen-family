import * as React from 'react'
import { addYears } from '@/lib/date'
import { errorMessage, logError, toAppError } from '@/lib/errors'
import type {
  Account,
  Budget,
  Card,
  Category,
  Household,
  HouseholdMember,
  HouseholdRole,
  Loan,
  ReconciliationItem,
  RecurringRule,
  Transaction,
} from '@/domain/models'
import type { LedgerContext } from '@/domain/ledger'
import type { Actor } from '@/data/transactions'
import { subscribeHousehold, subscribeMembers } from '@/data/households'
import { subscribeAccounts } from '@/data/accounts'
import { subscribeCards } from '@/data/cards'
import { subscribeCategories } from '@/data/categories'
import { subscribeBudgets } from '@/data/budgets'
import { subscribeLoans } from '@/data/loans'
import { subscribeReconciliationItems } from '@/data/reconciliation'
import { subscribeRecurring, generateDueRecurringDrafts } from '@/data/recurring'
import { subscribeTransactionsInRange } from '@/data/transactions'
import { removeHouseholdFromUser, setActiveHousehold } from '@/data/users'
import { useToast } from '@/components/ui/toast'
import { useAuth } from './auth-provider'

interface HouseholdContextValue {
  householdId: string | null
  household: Household | null
  members: HouseholdMember[]
  role: HouseholdRole | null
  isOwner: boolean
  accounts: Account[]
  cards: Card[]
  categories: Category[]
  budgets: Budget[]
  loans: Loan[]
  recurring: RecurringRule[]
  transactions: Transaction[]
  reconciliationItems: ReconciliationItem[]
  loading: boolean
  error: string | null
  ctx: LedgerContext
  actor: Actor | null
  memberName: (uid: string | null | undefined) => string
  switchHousehold: (householdId: string) => Promise<void>
}

const HouseholdContext = React.createContext<HouseholdContextValue | null>(null)

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth()
  const { toast } = useToast()

  const householdId = profile?.activeHouseholdId ?? null
  const uid = user?.uid ?? null

  const [household, setHousehold] = React.useState<Household | null>(null)
  const [members, setMembers] = React.useState<HouseholdMember[]>([])
  const [accounts, setAccounts] = React.useState<Account[]>([])
  const [cards, setCards] = React.useState<Card[]>([])
  const [categories, setCategories] = React.useState<Category[]>([])
  const [budgets, setBudgets] = React.useState<Budget[]>([])
  const [loans, setLoans] = React.useState<Loan[]>([])
  const [recurring, setRecurring] = React.useState<RecurringRule[]>([])
  const [transactions, setTransactions] = React.useState<Transaction[]>([])
  const [reconciliationItems, setReconciliationItems] = React.useState<ReconciliationItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const profileRef = React.useRef(profile)
  profileRef.current = profile
  const generatedRef = React.useRef<Set<string>>(new Set())

  // Si el usuario perdio el acceso (expulsion o borrado), se limpia el perfil.
  const handleAccessLost = React.useCallback(async () => {
    const currentProfile = profileRef.current
    if (!uid || !householdId || !currentProfile) return
    const remaining = currentProfile.householdIds.filter((id) => id !== householdId)
    try {
      await removeHouseholdFromUser(uid, remaining)
      toast({
        title: 'Perdiste el acceso al hogar',
        description: 'El owner te quitó del hogar o el hogar ya no existe.',
        variant: 'warning',
      })
    } catch (removeError) {
      logError('removeHouseholdFromUser', removeError)
      setError(errorMessage(removeError))
    }
  }, [householdId, toast, uid])

  React.useEffect(() => {
    if (!householdId || !uid) {
      setHousehold(null)
      setMembers([])
      setAccounts([])
      setCards([])
      setCategories([])
      setBudgets([])
      setLoans([])
      setRecurring([])
      setTransactions([])
      setReconciliationItems([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    setHousehold(null)
    const unsubscribers: Array<() => void> = []

    unsubscribers.push(
      subscribeHousehold(
        householdId,
        (nextHousehold) => {
          setHousehold(nextHousehold)
          setLoading(false)
          if (!nextHousehold) setError('El hogar ya no existe.')
        },
        (subscribeError) => {
          logError('subscribeHousehold', subscribeError)
          setLoading(false)
          if (toAppError(subscribeError).code === 'permission-denied') {
            void handleAccessLost()
          } else {
            setError(errorMessage(subscribeError))
          }
        },
      ),
    )

    const onSoftError = (context: string) => (subscribeError: unknown) => {
      logError(context, subscribeError)
      setError(errorMessage(subscribeError))
    }

    unsubscribers.push(subscribeMembers(householdId, setMembers, onSoftError('subscribeMembers')))
    unsubscribers.push(subscribeAccounts(householdId, setAccounts, onSoftError('subscribeAccounts')))
    unsubscribers.push(subscribeCards(householdId, setCards, onSoftError('subscribeCards')))
    unsubscribers.push(
      subscribeCategories(householdId, setCategories, onSoftError('subscribeCategories')),
    )
    unsubscribers.push(subscribeBudgets(householdId, setBudgets, onSoftError('subscribeBudgets')))
    unsubscribers.push(subscribeLoans(householdId, setLoans, onSoftError('subscribeLoans')))
    unsubscribers.push(
      subscribeRecurring(householdId, setRecurring, onSoftError('subscribeRecurring')),
    )
    unsubscribers.push(
      subscribeReconciliationItems(
        householdId,
        setReconciliationItems,
        onSoftError('subscribeReconciliationItems'),
      ),
    )

    const from = new Date(2000, 0, 1)
    const to = addYears(new Date(), 1)
    unsubscribers.push(
      subscribeTransactionsInRange({
        householdId,
        from,
        to,
        onData: setTransactions,
        onError: onSoftError('subscribeTransactions'),
      }),
    )

    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
  }, [handleAccessLost, householdId, uid])

  const actor = React.useMemo<Actor | null>(() => {
    if (!user || !profile) return null
    return {
      uid: user.uid,
      displayName: profile.displayName || user.displayName || 'Usuario',
    }
  }, [profile, user])

  const ctx = React.useMemo<LedgerContext>(
    () => ({
      baseCurrency: household?.baseCurrency ?? profile?.defaultCurrency ?? 'PYG',
      fxRates: household?.fxRates ?? {},
    }),
    [household, profile?.defaultCurrency],
  )

  // Genera borradores PENDIENTES de reglas vencidas una vez por dia y hogar.
  React.useEffect(() => {
    if (!householdId || !actor || !household || recurring.length === 0) return
    const dayKey = new Date().toISOString().slice(0, 10)
    const key = `${householdId}:${dayKey}`
    if (generatedRef.current.has(key)) return
    const dueRules = recurring.filter((rule) => rule.isActive && rule.autoGenerate)
    if (dueRules.length === 0) return

    generatedRef.current.add(key)
    void generateDueRecurringDrafts({
      householdId,
      actor,
      ctx,
      rules: dueRules,
    })
      .then((created) => {
        if (created > 0) {
          toast({
            title: 'Borradores pendientes generados',
            description: `${created} movimiento(s) recurrente(s) esperan tu confirmación en Movimientos.`,
          })
        }
      })
      .catch((generateError: unknown) => {
        logError('generateDueRecurringDrafts', generateError)
        toast({
          title: 'No se pudieron generar los borradores recurrentes',
          description: errorMessage(generateError),
          variant: 'error',
        })
      })
  }, [actor, ctx, household, householdId, recurring, toast])

  const role = React.useMemo<HouseholdRole | null>(() => {
    if (!uid || !household) return null
    return members.find((member) => member.uid === uid)?.role ?? null
  }, [household, members, uid])

  const memberName = React.useCallback(
    (memberUid: string | null | undefined) => {
      if (!memberUid) return 'Hogar'
      return (
        members.find((member) => member.uid === memberUid)?.displayName ??
        transactions.find((tx) => tx.createdBy === memberUid)?.createdByName ??
        'Integrante'
      )
    },
    [members, transactions],
  )

  const switchHousehold = React.useCallback(
    async (nextHouseholdId: string) => {
      if (!uid) return
      await setActiveHousehold(uid, nextHouseholdId)
      generatedRef.current.clear()
    },
    [uid],
  )

  const value = React.useMemo<HouseholdContextValue>(
    () => ({
      householdId,
      household,
      members,
      role,
      isOwner: role === 'OWNER',
      accounts,
      cards,
      categories,
      budgets,
      loans,
      recurring,
      transactions,
      reconciliationItems,
      loading,
      error,
      ctx,
      actor,
      memberName,
      switchHousehold,
    }),
    [
      householdId,
      household,
      members,
      role,
      accounts,
      cards,
      categories,
      budgets,
      loans,
      recurring,
      transactions,
      reconciliationItems,
      loading,
      error,
      ctx,
      actor,
      memberName,
      switchHousehold,
    ],
  )

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>
}

export function useHousehold(): HouseholdContextValue {
  const context = React.useContext(HouseholdContext)
  if (!context) throw new Error('useHousehold debe usarse dentro de HouseholdProvider')
  return context
}
