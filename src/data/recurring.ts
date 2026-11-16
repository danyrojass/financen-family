import {
  collection,
  deleteDoc,
  doc,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { getDb } from '@/lib/firebase'
import { nextOccurrence } from '@/domain/ledger'
import type { RecurringRule } from '@/domain/models'
import type { TransactionInput } from './schemas'
import { recurringInputSchema, type RecurringInput } from './schemas'
import { mapRecurringRule } from './mappers'
import { subscribeDocs } from './subscribe'
import { buildTransactionDocs, type Actor, type LedgerWriteContext } from './transactions'

export function subscribeRecurring(
  householdId: string,
  onData: (rules: RecurringRule[]) => void,
  onError: (error: unknown) => void,
): () => void {
  return subscribeDocs(`households/${householdId}/recurring`, mapRecurringRule, onData, onError)
}

export async function createRecurring(
  householdId: string,
  uid: string,
  input: RecurringInput,
): Promise<string> {
  const parsed = recurringInputSchema.parse(input)
  const ref = doc(collection(getDb(), 'households', householdId, 'recurring'))
  const now = Timestamp.now()
  await setDoc(ref, {
    ...parsed,
    intervalDays: parsed.intervalDays ?? null,
    dayOfMonth: parsed.dayOfMonth ?? null,
    accountId: parsed.accountId ?? null,
    cardId: parsed.cardId ?? null,
    toAccountId: parsed.toAccountId ?? null,
    categoryId: parsed.categoryId ?? null,
    loanId: parsed.loanId ?? null,
    notes: parsed.notes ?? null,
    nextRunAt: Timestamp.fromDate(parsed.nextRunAt),
    createdAt: now,
    updatedAt: now,
    updatedBy: uid,
  })
  return ref.id
}

export async function updateRecurring(
  householdId: string,
  recurringId: string,
  uid: string,
  input: RecurringInput,
): Promise<void> {
  const parsed = recurringInputSchema.parse(input)
  await updateDoc(doc(getDb(), 'households', householdId, 'recurring', recurringId), {
    ...parsed,
    intervalDays: parsed.intervalDays ?? null,
    dayOfMonth: parsed.dayOfMonth ?? null,
    accountId: parsed.accountId ?? null,
    cardId: parsed.cardId ?? null,
    toAccountId: parsed.toAccountId ?? null,
    categoryId: parsed.categoryId ?? null,
    loanId: parsed.loanId ?? null,
    notes: parsed.notes ?? null,
    nextRunAt: Timestamp.fromDate(parsed.nextRunAt),
    updatedAt: Timestamp.now(),
    updatedBy: uid,
  })
}

export async function deleteRecurring(householdId: string, recurringId: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'households', householdId, 'recurring', recurringId))
}

function toTransactionInput(rule: RecurringRule, runAt: Date): TransactionInput {
  return {
    type: rule.type,
    date: runAt,
    description: rule.name,
    amountMinor: rule.amountMinor,
    currency: rule.currency,
    categoryId: rule.categoryId,
    accountId: rule.accountId,
    toAccountId: rule.toAccountId,
    toAmountMinor: null,
    cardId: rule.cardId,
    loanId: rule.loanId,
    commitmentId: null,
    principalMinor: null,
    interestMinor: null,
    feeMinor: null,
    notes: rule.notes,
    status: 'pending',
    entryMethod: 'manual',
    recurringId: rule.id,
    rawTranscript: null,
    confidence: null,
  }
}

/**
 * Genera borradores PENDIENTES de las reglas vencidas. Nunca registra el pago
 * como confirmado: la persona debe confirmarlo. Avanza nextRunAt para no
 * duplicar el borrador en la proxima apertura.
 */
export async function generateDueRecurringDrafts(params: {
  householdId: string
  actor: Actor
  ctx: LedgerWriteContext
  rules: RecurringRule[]
  now?: Date
}): Promise<number> {
  const { householdId, actor, ctx, rules } = params
  const now = params.now ?? new Date()
  const db = getDb()
  const batch = writeBatch(db)
  let created = 0

  for (const rule of rules) {
    if (!rule.isActive || !rule.autoGenerate) continue
    if (rule.nextRunAt.getTime() > now.getTime()) continue

    const docs = buildTransactionDocs(toTransactionInput(rule, rule.nextRunAt), ctx, actor, householdId)
    for (const payload of docs) {
      const txRef = doc(collection(db, 'households', householdId, 'transactions'))
      batch.set(txRef, payload)
      batch.set(doc(collection(txRef, 'audit')), {
        action: 'created',
        by: actor.uid,
        byName: actor.displayName,
        at: Timestamp.now(),
        summary: `Borrador pendiente de recurrente: ${rule.name}`,
        changes: null,
      })
      created += 1
    }

    let next = nextOccurrence(rule.nextRunAt, rule.frequency, rule.intervalDays)
    let guard = 0
    while (next.getTime() <= now.getTime() && guard < 36) {
      next = nextOccurrence(next, rule.frequency, rule.intervalDays)
      guard += 1
    }

    batch.update(doc(db, 'households', householdId, 'recurring', rule.id), {
      nextRunAt: Timestamp.fromDate(next),
      updatedAt: Timestamp.now(),
      updatedBy: actor.uid,
    })
  }

  if (created > 0) await batch.commit()
  return created
}
