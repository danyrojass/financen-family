import * as React from 'react'
import {
  onAuthStateChanged,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import { FirebaseError } from 'firebase/app'
import {
  createGoogleProvider,
  getFirebaseAuth,
} from '@/lib/firebase'
import { logError } from '@/lib/errors'
import { ensureUserProfile, subscribeUserProfile } from '@/data/users'
import type { UserProfile } from '@/domain/models'

interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  /** true mientras se resuelve la sesion inicial de Firebase Auth. */
  initializing: boolean
  /** true mientras se carga el perfil de Firestore. */
  profileLoading: boolean
  error: string | null
  clearError: () => void
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

function errorText(error: unknown): string {
  if (error instanceof FirebaseError) return error.message
  if (error instanceof Error) return error.message
  return 'No se pudo iniciar sesión.'
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null)
  const [profile, setProfile] = React.useState<UserProfile | null>(null)
  const [initializing, setInitializing] = React.useState(true)
  const [profileLoading, setProfileLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Suscripciones activas, se limpian al cerrar sesion.
  const profileUnsub = React.useRef<(() => void) | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const auth = getFirebaseAuth()

    void getRedirectResult(auth)
      .then((result) => {
        if (result?.user) setError(null)
      })
      .catch((redirectError: unknown) => {
        logError('getRedirectResult', redirectError)
        if (!cancelled) setError(errorText(redirectError))
      })

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      if (profileUnsub.current) {
        profileUnsub.current()
        profileUnsub.current = null
      }

      if (!nextUser) {
        setProfile(null)
        setProfileLoading(false)
        setInitializing(false)
        return
      }

      setProfileLoading(true)
      void (async () => {
        try {
          await ensureUserProfile(nextUser)
        } catch (profileError) {
          logError('ensureUserProfile', profileError)
          if (!cancelled) {
            setError(errorText(profileError))
            setProfileLoading(false)
            setInitializing(false)
          }
          return
        }
        if (cancelled) return

        profileUnsub.current = subscribeUserProfile(
          nextUser.uid,
          (nextProfile) => {
            setProfile(nextProfile)
            setProfileLoading(false)
            setInitializing(false)
          },
          (subscribeError) => {
            logError('subscribeUserProfile', subscribeError)
            setError(errorText(subscribeError))
            setProfileLoading(false)
            setInitializing(false)
          },
        )
      })()
    })

    return () => {
      cancelled = true
      unsubscribe()
      if (profileUnsub.current) {
        profileUnsub.current()
        profileUnsub.current = null
      }
    }
  }, [])

  const signIn = React.useCallback(async () => {
    setError(null)
    const auth = getFirebaseAuth()
    const provider = createGoogleProvider()
    try {
      await signInWithPopup(auth, provider)
    } catch (popupError) {
      const code = popupError instanceof FirebaseError ? popupError.code : ''
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, provider)
        return
      }
      if (code === 'auth/cancelled-popup-request') return
      logError('signIn', popupError)
      setError(errorText(popupError))
      throw popupError
    }
  }, [])

  const signOut = React.useCallback(async () => {
    await firebaseSignOut(getFirebaseAuth())
    setProfile(null)
  }, [])

  const refreshProfile = React.useCallback(async () => {
    const current = getFirebaseAuth().currentUser
    if (!current) return
    await ensureUserProfile(current)
  }, [])

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      initializing,
      profileLoading,
      error,
      clearError: () => setError(null),
      signIn,
      signOut,
      refreshProfile,
    }),
    [user, profile, initializing, profileLoading, error, signIn, signOut, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return context
}
