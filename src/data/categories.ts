import { collection, deleteDoc, doc, orderBy, setDoc, Timestamp, updateDoc } from 'firebase/firestore'
import { getDb } from '@/lib/firebase'
import { mapCategory } from './mappers'
import { subscribeDocs } from './subscribe'
import { categoryInputSchema, type CategoryInput } from './schemas'

export function subscribeCategories(
  householdId: string,
  onData: (categories: ReturnType<typeof mapCategory>[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return subscribeDocs(
    `households/${householdId}/categories`,
    mapCategory,
    onData,
    onError,
    [orderBy('sortOrder', 'asc')],
  )
}

export async function createCategory(
  householdId: string,
  uid: string,
  input: CategoryInput,
): Promise<string> {
  const parsed = categoryInputSchema.parse(input)
  const ref = doc(collection(getDb(), 'households', householdId, 'categories'))
  const now = Timestamp.now()
  await setDoc(ref, {
    ...parsed,
    parentId: parsed.parentId ?? null,
    color: parsed.color ?? null,
    icon: parsed.icon ?? null,
    isSystem: false,
    sortOrder: parsed.sortOrder ?? Date.now(),
    createdAt: now,
    updatedAt: now,
    updatedBy: uid,
  })
  return ref.id
}

export async function updateCategory(
  householdId: string,
  categoryId: string,
  uid: string,
  input: CategoryInput,
): Promise<void> {
  const parsed = categoryInputSchema.parse(input)
  await updateDoc(doc(getDb(), 'households', householdId, 'categories', categoryId), {
    ...parsed,
    parentId: parsed.parentId ?? null,
    color: parsed.color ?? null,
    icon: parsed.icon ?? null,
    updatedAt: Timestamp.now(),
    updatedBy: uid,
  })
}

export async function archiveCategory(
  householdId: string,
  categoryId: string,
  uid: string,
  archived: boolean,
): Promise<void> {
  await updateDoc(doc(getDb(), 'households', householdId, 'categories', categoryId), {
    isArchived: archived,
    updatedAt: Timestamp.now(),
    updatedBy: uid,
  })
}

export async function deleteCategory(householdId: string, categoryId: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'households', householdId, 'categories', categoryId))
}
