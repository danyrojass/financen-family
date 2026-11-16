import { collection, deleteDoc, doc, orderBy, setDoc, Timestamp, updateDoc } from 'firebase/firestore'
import { getDb } from '@/lib/firebase'
import { mapBudget } from './mappers'
import { subscribeDocs } from './subscribe'
import { budgetInputSchema, type BudgetInput } from './schemas'

export function subscribeBudgets(
  householdId: string,
  onData: (budgets: ReturnType<typeof mapBudget>[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return subscribeDocs(
    `households/${householdId}/budgets`,
    mapBudget,
    onData,
    onError,
    [orderBy('period', 'desc')],
  )
}

export async function createBudget(
  householdId: string,
  uid: string,
  input: BudgetInput,
): Promise<string> {
  const parsed = budgetInputSchema.parse(input)
  const ref = doc(collection(getDb(), 'households', householdId, 'budgets'))
  const now = Timestamp.now()
  await setDoc(ref, {
    ...parsed,
    notes: parsed.notes ?? null,
    createdAt: now,
    updatedAt: now,
    updatedBy: uid,
  })
  return ref.id
}

export async function updateBudget(
  householdId: string,
  budgetId: string,
  uid: string,
  input: BudgetInput,
): Promise<void> {
  const parsed = budgetInputSchema.parse(input)
  await updateDoc(doc(getDb(), 'households', householdId, 'budgets', budgetId), {
    ...parsed,
    notes: parsed.notes ?? null,
    updatedAt: Timestamp.now(),
    updatedBy: uid,
  })
}

export async function deleteBudget(householdId: string, budgetId: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'households', householdId, 'budgets', budgetId))
}
