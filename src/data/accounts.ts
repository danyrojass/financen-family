import { collection, deleteDoc, doc, orderBy, setDoc, Timestamp, updateDoc } from 'firebase/firestore'
import type { AccountInput } from './schemas'
import { getDb } from '@/lib/firebase'
import { mapAccount } from './mappers'
import { subscribeDocs } from './subscribe'
import { accountInputSchema } from './schemas'

/** Convierte la fecha de conciliacion al Timestamp de Firestore (o null). */
function serializedAccount(input: AccountInput) {
  const { balanceAsOf, ...rest } = input
  return {
    ...rest,
    balanceAsOf: balanceAsOf ? Timestamp.fromDate(balanceAsOf) : null,
  }
}

export function subscribeAccounts(
  householdId: string,
  onData: (accounts: ReturnType<typeof mapAccount>[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return subscribeDocs(
    `households/${householdId}/accounts`,
    mapAccount,
    onData,
    onError,
    [orderBy('sortOrder', 'asc')],
  )
}

export async function createAccount(
  householdId: string,
  uid: string,
  input: AccountInput,
): Promise<string> {
  const parsed = accountInputSchema.parse(input)
  const ref = doc(collection(getDb(), 'households', householdId, 'accounts'))
  const now = Timestamp.now()
  await setDoc(ref, {
    ...serializedAccount(parsed),
    notes: parsed.notes ?? null,
    ownerId: parsed.ownerId ?? null,
    sortOrder: parsed.sortOrder ?? Date.now(),
    createdAt: now,
    updatedAt: now,
    updatedBy: uid,
  })
  return ref.id
}

export async function updateAccount(
  householdId: string,
  accountId: string,
  uid: string,
  input: AccountInput,
): Promise<void> {
  const parsed = accountInputSchema.parse(input)
  await updateDoc(doc(getDb(), 'households', householdId, 'accounts', accountId), {
    ...serializedAccount(parsed),
    notes: parsed.notes ?? null,
    ownerId: parsed.ownerId ?? null,
    updatedAt: Timestamp.now(),
    updatedBy: uid,
  })
}

export async function deleteAccount(householdId: string, accountId: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'households', householdId, 'accounts', accountId))
}
