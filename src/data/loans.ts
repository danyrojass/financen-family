import { collection, deleteDoc, doc, setDoc, Timestamp, updateDoc } from 'firebase/firestore'
import { getDb } from '@/lib/firebase'
import { mapLoan } from './mappers'
import { subscribeDocs } from './subscribe'
import { loanInputSchema, type LoanInput } from './schemas'

export function subscribeLoans(
  householdId: string,
  onData: (loans: ReturnType<typeof mapLoan>[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return subscribeDocs(`households/${householdId}/loans`, mapLoan, onData, onError)
}

export async function createLoan(
  householdId: string,
  uid: string,
  input: LoanInput,
): Promise<string> {
  const parsed = loanInputSchema.parse(input)
  const ref = doc(collection(getDb(), 'households', householdId, 'loans'))
  const now = Timestamp.now()
  await setDoc(ref, {
    ...parsed,
    institution: parsed.institution ?? null,
    accountId: parsed.accountId ?? null,
    categoryId: parsed.categoryId ?? null,
    notes: parsed.notes ?? null,
    firstDueDate: Timestamp.fromDate(parsed.firstDueDate),
    createdAt: now,
    updatedAt: now,
    updatedBy: uid,
  })
  return ref.id
}

export async function updateLoan(
  householdId: string,
  loanId: string,
  uid: string,
  input: LoanInput,
): Promise<void> {
  const parsed = loanInputSchema.parse(input)
  await updateDoc(doc(getDb(), 'households', householdId, 'loans', loanId), {
    ...parsed,
    institution: parsed.institution ?? null,
    accountId: parsed.accountId ?? null,
    categoryId: parsed.categoryId ?? null,
    notes: parsed.notes ?? null,
    firstDueDate: Timestamp.fromDate(parsed.firstDueDate),
    updatedAt: Timestamp.now(),
    updatedBy: uid,
  })
}

export async function deleteLoan(householdId: string, loanId: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'households', householdId, 'loans', loanId))
}
