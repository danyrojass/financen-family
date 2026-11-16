import { collection, deleteDoc, doc, orderBy, setDoc, Timestamp, updateDoc } from 'firebase/firestore'
import { getDb } from '@/lib/firebase'
import { mapAccount } from './mappers'
import { subscribeDocs } from './subscribe'
import { accountInputSchema, type AccountInput } from './schemas'

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
    ...parsed,
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
    ...parsed,
    notes: parsed.notes ?? null,
    ownerId: parsed.ownerId ?? null,
    updatedAt: Timestamp.now(),
    updatedBy: uid,
  })
}

export async function deleteAccount(householdId: string, accountId: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'households', householdId, 'accounts', accountId))
}
