import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { getDb, getFirebaseFunctions } from '@/lib/firebase'
import { AppError, toAppError } from '@/lib/errors'
import { useCloudFunctions } from '@/lib/env'
import { generateId, generateInviteCode } from '@/lib/utils'
import { seedCategoryDocs } from '@/domain/defaults'
import type { CurrencyCode } from '@/domain/money'
import type { Household, HouseholdMember, Invitation } from '@/domain/models'
import { mapHousehold, mapInvitation, mapMember } from './mappers'

const MAX_INVITATION_DAYS = 7

export interface CreateHouseholdInput {
  user: User
  name: string
  baseCurrency: CurrencyCode
  fxRates: Record<string, number>
}

export async function createHousehold({ user, name, baseCurrency, fxRates }: CreateHouseholdInput): Promise<string> {
  const db = getDb()
  const householdId = generateId()
  const now = Timestamp.now()
  const email = (user.email ?? '').toLowerCase()

  await setDoc(doc(db, 'households', householdId), {
    name: name.trim(),
    baseCurrency,
    fxRates,
    ownerId: user.uid,
    createdBy: user.uid,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Asuncion',
    locale: 'es-PY',
    createdAt: now,
    updatedAt: now,
  })

  await setDoc(doc(db, 'households', householdId, 'members', user.uid), {
    uid: user.uid,
    role: 'OWNER',
    displayName: user.displayName || email.split('@')[0] || 'Usuario',
    email,
    photoURL: user.photoURL ?? null,
    joinedAt: now,
    invitationId: null,
  })

  const batch = writeBatch(db)
  for (const category of seedCategoryDocs(user.uid)) {
    const categoryRef = doc(collection(db, 'households', householdId, 'categories'))
    batch.set(categoryRef, {
      ...category,
      createdAt: Timestamp.fromDate(category.createdAt),
      updatedAt: Timestamp.fromDate(category.updatedAt),
    })
  }
  batch.update(doc(db, 'users', user.uid), {
    householdIds: arrayUnion(householdId),
    activeHouseholdId: householdId,
    onboardingCompleted: true,
    updatedAt: Timestamp.now(),
  })
  await batch.commit()

  return householdId
}

export function subscribeHousehold(
  householdId: string,
  onData: (household: Household | null) => void,
  onError: (error: unknown) => void,
): () => void {
  return onSnapshot(
    doc(getDb(), 'households', householdId),
    (snapshot) => onData(snapshot.exists() ? mapHousehold(snapshot.id, snapshot.data()) : null),
    (error) => onError(error),
  )
}

export function subscribeMembers(
  householdId: string,
  onData: (members: HouseholdMember[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return onSnapshot(
    collection(getDb(), 'households', householdId, 'members'),
    (snapshot) => {
      const members = snapshot.docs
        .map((item) => mapMember(item.id, item.data()))
        .sort((a, b) => (a.role === b.role ? a.displayName.localeCompare(b.displayName) : a.role === 'OWNER' ? -1 : 1))
      onData(members)
    },
    (error) => onError(error),
  )
}

export async function updateHousehold(
  householdId: string,
  values: { name: string; baseCurrency: CurrencyCode; fxRates: Record<string, number> },
): Promise<void> {
  await updateDoc(doc(getDb(), 'households', householdId), {
    ...values,
    updatedAt: Timestamp.now(),
  })
}

export async function countHouseholdMembers(householdId: string): Promise<number> {
  const snapshot = await getDocs(collection(getDb(), 'households', householdId, 'members'))
  return snapshot.size
}

export async function createInvitation(params: {
  householdId: string
  householdName: string
  createdBy: string
  email?: string
}): Promise<{ invitationId: string; expiresAt: Date }> {
  const { householdId, householdName, createdBy } = params
  const email = (params.email ?? '').trim().toLowerCase()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError('El email de la invitación no es válido.', 'invitation/invalid-email')
  }

  const invitationId = generateInviteCode()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + MAX_INVITATION_DAYS * 86_400_000)

  await setDoc(doc(getDb(), 'households', householdId, 'invitations', invitationId), {
    email,
    role: 'MEMBER',
    status: 'pending',
    createdBy,
    createdAt: Timestamp.fromDate(now),
    expiresAt: Timestamp.fromDate(expiresAt),
    householdName,
    acceptedBy: null,
    acceptedAt: null,
    revokedAt: null,
  })

  return { invitationId, expiresAt }
}

export async function getInvitation(
  householdId: string,
  invitationId: string,
): Promise<Invitation | null> {
  const snapshot = await getDoc(
    doc(getDb(), 'households', householdId, 'invitations', invitationId),
  )
  return snapshot.exists() ? mapInvitation(snapshot.id, snapshot.data()) : null
}

export async function listInvitations(householdId: string): Promise<Invitation[]> {
  const snapshot = await getDocs(
    query(
      collection(getDb(), 'households', householdId, 'invitations'),
      orderBy('createdAt', 'desc'),
    ),
  )
  return snapshot.docs.map((item) => mapInvitation(item.id, item.data()))
}

export async function revokeInvitation(householdId: string, invitationId: string): Promise<void> {
  await updateDoc(doc(getDb(), 'households', householdId, 'invitations', invitationId), {
    status: 'revoked',
    revokedAt: Timestamp.now(),
  })
}

export async function acceptInvitation(params: {
  user: User
  householdId: string
  invitationId: string
}): Promise<void> {
  const { user, householdId, invitationId } = params

  if (useCloudFunctions) {
    try {
      const callable = httpsCallable(getFirebaseFunctions(), 'acceptInvitation')
      await callable({ householdId, invitationId })
      return
    } catch (error) {
      throw toAppError(error)
    }
  }

  const db = getDb()
  const invitation = await getInvitation(householdId, invitationId)
  if (!invitation) {
    throw new AppError('La invitación no existe o ya fue utilizada.', 'invitation/not-found')
  }
  if (invitation.status !== 'pending') {
    throw new AppError('Esta invitación ya fue utilizada o revocada.', 'invitation/not-pending')
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    throw new AppError('La invitación venció. Pedile al owner que genere una nueva.', 'invitation/expired')
  }
  const email = (user.email ?? '').toLowerCase()
  if (invitation.email && invitation.email !== email) {
    throw new AppError(
      `La invitación fue creada para ${invitation.email}. Ingresá con esa cuenta de Google.`,
      'invitation/email-mismatch',
    )
  }

  const batch = writeBatch(db)
  batch.set(doc(db, 'households', householdId, 'members', user.uid), {
    uid: user.uid,
    role: 'MEMBER',
    displayName: user.displayName || email.split('@')[0] || 'Usuario',
    email,
    photoURL: user.photoURL ?? null,
    joinedAt: Timestamp.now(),
    invitationId,
  })
  batch.update(doc(db, 'households', householdId, 'invitations', invitationId), {
    status: 'accepted',
    acceptedBy: user.uid,
    acceptedAt: Timestamp.now(),
  })
  batch.update(doc(db, 'users', user.uid), {
    householdIds: arrayUnion(householdId),
    activeHouseholdId: householdId,
    onboardingCompleted: true,
    updatedAt: Timestamp.now(),
  })
  await batch.commit()
}

export async function leaveHousehold(params: {
  householdId: string
  user: User
  remainingHouseholdIds: string[]
}): Promise<void> {
  const { householdId, user, remainingHouseholdIds } = params
  const db = getDb()
  const batch = writeBatch(db)
  batch.delete(doc(db, 'households', householdId, 'members', user.uid))
  batch.update(doc(db, 'users', user.uid), {
    householdIds: arrayRemove(householdId),
    activeHouseholdId: remainingHouseholdIds[0] ?? null,
    updatedAt: Timestamp.now(),
  })
  await batch.commit()
}

export async function removeMember(householdId: string, memberUid: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'households', householdId, 'members', memberUid))
}

export async function deleteHousehold(householdId: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'households', householdId))
}
