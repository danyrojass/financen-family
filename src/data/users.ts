import { doc, getDoc, onSnapshot, setDoc, Timestamp, updateDoc } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { getDb } from '@/lib/firebase'
import { AppError, logError } from '@/lib/errors'
import type { UserProfile } from '@/domain/models'
import { mapUser } from './mappers'

export async function ensureUserProfile(user: User): Promise<void> {
  const email = user.email?.trim().toLowerCase()
  if (!email) {
    throw new AppError(
      'La cuenta de Google no expone un email verificado. Probá con otra cuenta.',
      'auth/email-missing',
    )
  }

  const db = getDb()
  const ref = doc(db, 'users', user.uid)
  const snapshot = await getDoc(ref)
  const now = Timestamp.now()

  if (!snapshot.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      displayName: user.displayName || email.split('@')[0],
      email,
      photoURL: user.photoURL ?? null,
      householdIds: [],
      activeHouseholdId: null,
      defaultCurrency: 'PYG',
      onboardingCompleted: false,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    })
    return
  }

  await updateDoc(ref, {
    displayName: user.displayName || email.split('@')[0],
    photoURL: user.photoURL ?? null,
    email,
    updatedAt: now,
    lastSeenAt: now,
  })
}

export function subscribeUserProfile(
  uid: string,
  onData: (profile: UserProfile | null) => void,
  onError: (error: unknown) => void,
): () => void {
  return onSnapshot(
    doc(getDb(), 'users', uid),
    (snapshot) => {
      onData(snapshot.exists() ? mapUser(snapshot.id, snapshot.data()) : null)
    },
    (error) => {
      logError('subscribeUserProfile', error)
      onError(error)
    },
  )
}

export async function setActiveHousehold(uid: string, householdId: string): Promise<void> {
  await updateDoc(doc(getDb(), 'users', uid), {
    activeHouseholdId: householdId,
    updatedAt: Timestamp.now(),
  })
}

export async function markOnboardingCompleted(uid: string): Promise<void> {
  await updateDoc(doc(getDb(), 'users', uid), {
    onboardingCompleted: true,
    updatedAt: Timestamp.now(),
  })
}

/**
 * Quita un hogar del perfil cuando el usuario perdio el acceso (por ejemplo, el
 * owner lo expulso) para evitar quedar apuntando a un hogar inaccesible.
 */
export async function removeHouseholdFromUser(
  uid: string,
  remainingHouseholdIds: string[],
): Promise<void> {
  await updateDoc(doc(getDb(), 'users', uid), {
    householdIds: remainingHouseholdIds,
    activeHouseholdId: remainingHouseholdIds[0] ?? null,
    updatedAt: Timestamp.now(),
  })
}
