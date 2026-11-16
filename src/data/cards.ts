import { collection, deleteDoc, doc, orderBy, setDoc, Timestamp, updateDoc } from 'firebase/firestore'
import { getDb } from '@/lib/firebase'
import { mapCard } from './mappers'
import { subscribeDocs } from './subscribe'
import { cardInputSchema, type CardInput } from './schemas'

export function subscribeCards(
  householdId: string,
  onData: (cards: ReturnType<typeof mapCard>[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return subscribeDocs(
    `households/${householdId}/cards`,
    mapCard,
    onData,
    onError,
    [orderBy('createdAt', 'asc')],
  )
}

export async function createCard(
  householdId: string,
  uid: string,
  input: CardInput,
): Promise<string> {
  const parsed = cardInputSchema.parse(input)
  const ref = doc(collection(getDb(), 'households', householdId, 'cards'))
  const now = Timestamp.now()
  await setDoc(ref, {
    ...parsed,
    holderId: parsed.holderId ?? null,
    notes: parsed.notes ?? null,
    createdAt: now,
    updatedAt: now,
    updatedBy: uid,
  })
  return ref.id
}

export async function updateCard(
  householdId: string,
  cardId: string,
  uid: string,
  input: CardInput,
): Promise<void> {
  const parsed = cardInputSchema.parse(input)
  await updateDoc(doc(getDb(), 'households', householdId, 'cards', cardId), {
    ...parsed,
    holderId: parsed.holderId ?? null,
    notes: parsed.notes ?? null,
    updatedAt: Timestamp.now(),
    updatedBy: uid,
  })
}

export async function deleteCard(householdId: string, cardId: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'households', householdId, 'cards', cardId))
}
