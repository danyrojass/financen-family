import { doc, getDoc, orderBy, setDoc, Timestamp, updateDoc } from 'firebase/firestore'
import type { ReconciliationItem } from '@/domain/models'
import { getDb } from '@/lib/firebase'
import { mapReconciliationItem } from './mappers'
import { subscribeDocs } from './subscribe'
import {
  reconciliationItemInputSchema,
  type ReconciliationItemInput,
} from './schemas'

function itemRef(householdId: string, itemId: string) {
  return doc(getDb(), 'households', householdId, 'reconciliationItems', itemId)
}

export function subscribeReconciliationItems(
  householdId: string,
  onData: (items: ReconciliationItem[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return subscribeDocs(
    `households/${householdId}/reconciliationItems`,
    mapReconciliationItem,
    onData,
    onError,
    [orderBy('createdAt', 'desc')],
  )
}

/**
 * Alta o actualizacion por ID fijo: ejecutar el proceso dos veces no duplica
 * items y conserva la fecha de creacion original.
 */
export async function upsertReconciliationItem(
  householdId: string,
  itemId: string,
  input: ReconciliationItemInput,
  uid: string,
): Promise<void> {
  const parsed = reconciliationItemInputSchema.parse(input)
  const ref = itemRef(householdId, itemId)
  const existing = await getDoc(ref)
  const now = Timestamp.now()
  await setDoc(ref, {
    ...parsed,
    createdAt: existing.exists() ? existing.data().createdAt : now,
    updatedAt: now,
    updatedBy: uid,
  })
}

/** Marca el seguimiento como resuelto. No modifica saldos ni movimientos. */
export async function resolveReconciliationItem(
  householdId: string,
  itemId: string,
  uid: string,
): Promise<void> {
  await updateDoc(itemRef(householdId, itemId), {
    status: 'resolved',
    updatedAt: Timestamp.now(),
    updatedBy: uid,
  })
}
