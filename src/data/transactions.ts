import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { getDb } from '@/lib/firebase'
import { AppError } from '@/lib/errors'
import { convertMinor, type CurrencyCode } from '@/domain/money'
import { addMonths } from '@/lib/date'
import { generateId } from '@/lib/utils'
import type { Transaction } from '@/domain/models'
import { mapAudit, mapTransaction } from './mappers'
import { subscribeDocs } from './subscribe'
import { transactionInputSchema, transactionUpdateSchema, type TransactionInput, type TransactionUpdate } from './schemas'

export interface LedgerWriteContext {
  baseCurrency: CurrencyCode
  fxRates: Record<string, number>
}

export interface Actor {
  uid: string
  displayName: string
}

export interface TransactionPage {
  items: Transaction[]
  cursor: QueryDocumentSnapshot<DocumentData> | null
  hasMore: boolean
}

const DEFAULT_PAGE_SIZE = 50
const MAX_QUERY_LIMIT = 5000

function computeBaseAmount(
  amountMinor: number,
  currency: CurrencyCode,
  ctx: LedgerWriteContext,
): { baseAmountMinor: number; fxRate: number } {
  const converted = convertMinor(
    amountMinor,
    currency,
    ctx.baseCurrency,
    ctx.fxRates,
    ctx.baseCurrency,
  )
  if (converted === null) {
    throw new AppError(
      `Falta la cotización de ${currency}. Configurala en Ajustes del hogar antes de registrar el movimiento.`,
      'ledger/missing-rate',
    )
  }
  const rate = currency === ctx.baseCurrency ? 1 : ctx.fxRates[currency] ?? 1
  return { baseAmountMinor: converted, fxRate: rate }
}

/**
 * Construye los documentos Firestore de un movimiento (uno o N si es en cuotas).
 * Los importes en cuotas se reparten en enteros; el resto se suma a la primera.
 */
export function buildTransactionDocs(
  input: TransactionInput,
  ctx: LedgerWriteContext,
  actor: Actor,
  householdId: string,
): Array<Record<string, unknown>> {
  const parsed = transactionInputSchema.parse(input)
  const now = Timestamp.now()
  const installments =
    parsed.type === 'expense' && parsed.cardId && (parsed.installmentCount ?? 1) > 1
      ? Math.min(48, parsed.installmentCount ?? 1)
      : 1

  const planId = installments > 1 ? generateId() : null
  const docs: Array<Record<string, unknown>> = []

  for (let index = 0; index < installments; index += 1) {
    const baseAmount =
      installments === 1
        ? parsed.amountMinor
        : Math.trunc(parsed.amountMinor / installments) + (index === 0 ? parsed.amountMinor % installments : 0)
    const { baseAmountMinor, fxRate } = computeBaseAmount(baseAmount, parsed.currency, ctx)
    const date = installments === 1 ? parsed.date : addMonths(parsed.date, index)
    const description =
      installments === 1 ? parsed.description : `${parsed.description} (cuota ${index + 1}/${installments})`

    docs.push({
      householdId,
      type: parsed.type,
      date: Timestamp.fromDate(date),
      description: description.slice(0, 240),
      amountMinor: baseAmount,
      currency: parsed.currency,
      baseAmountMinor,
      fxRate,
      categoryId: parsed.categoryId ?? null,
      accountId: parsed.accountId ?? null,
      toAccountId: parsed.toAccountId ?? null,
      toAmountMinor:
        parsed.toAmountMinor ??
        (parsed.toAccountId && parsed.type !== 'expense' && parsed.type !== 'income'
          ? baseAmount
          : null),
      cardId: parsed.cardId ?? null,
      loanId: parsed.loanId ?? null,
      commitmentId: parsed.commitmentId ?? null,
      principalMinor: parsed.principalMinor ?? null,
      interestMinor: parsed.interestMinor ?? null,
      feeMinor: parsed.feeMinor ?? null,
      installmentPlanId: planId,
      installmentIndex: installments > 1 ? index + 1 : null,
      installmentCount: installments > 1 ? installments : null,
      createdBy: actor.uid,
      createdByName: actor.displayName.slice(0, 120),
      entryMethod: parsed.entryMethod,
      status: parsed.status,
      notes: parsed.notes ?? null,
      recurringId: parsed.recurringId ?? null,
      rawTranscript: parsed.rawTranscript ?? null,
      confidence: parsed.confidence ?? null,
      deletedAt: null,
      deletedBy: null,
      updatedBy: null,
      createdAt: now,
      updatedAt: now,
    })
  }

  return docs
}

function auditPayload(
  action: 'created' | 'updated' | 'deleted' | 'restored',
  actor: Actor,
  summary: string,
): Record<string, unknown> {
  return {
    action,
    by: actor.uid,
    byName: actor.displayName.slice(0, 120),
    at: Timestamp.now(),
    summary: summary.slice(0, 500),
    changes: null,
  }
}

export async function createTransactions(params: {
  householdId: string
  actor: Actor
  ctx: LedgerWriteContext
  inputs: TransactionInput[]
}): Promise<string[]> {
  const { householdId, actor, ctx, inputs } = params
  if (inputs.length === 0) return []

  const db = getDb()
  const batch = writeBatch(db)
  const ids: string[] = []

  for (const input of inputs) {
    const docs = buildTransactionDocs(input, ctx, actor, householdId)
    for (const payload of docs) {
      const id = generateId()
      ids.push(id)
      const ref = doc(db, 'households', householdId, 'transactions', id)
      batch.set(ref, payload)
      batch.set(
        doc(collection(ref, 'audit')),
        auditPayload(
          'created',
          actor,
          `${String(payload.type)} · ${String(payload.description)}`,
        ),
      )
    }
  }

  await batch.commit()
  return ids
}

export async function createTransaction(params: {
  householdId: string
  actor: Actor
  ctx: LedgerWriteContext
  input: TransactionInput
}): Promise<string> {
  const ids = await createTransactions({
    householdId: params.householdId,
    actor: params.actor,
    ctx: params.ctx,
    inputs: [params.input],
  })
  return ids[0] ?? ''
}

export async function updateTransaction(params: {
  householdId: string
  transactionId: string
  actor: Actor
  ctx: LedgerWriteContext
  update: TransactionUpdate
}): Promise<void> {
  const { householdId, transactionId, actor, ctx, update } = params
  const parsed = transactionUpdateSchema.parse(update)
  const db = getDb()
  const ref = doc(db, 'households', householdId, 'transactions', transactionId)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) throw new AppError('El movimiento no existe.', 'not-found')

  const payload: Record<string, unknown> = {
    updatedAt: Timestamp.now(),
    updatedBy: actor.uid,
  }

  if (parsed.description !== undefined) payload.description = parsed.description
  if (parsed.notes !== undefined) payload.notes = parsed.notes ?? null
  if (parsed.categoryId !== undefined) payload.categoryId = parsed.categoryId ?? null
  if (parsed.status !== undefined) payload.status = parsed.status
  if (parsed.date !== undefined) payload.date = Timestamp.fromDate(parsed.date)
  if (parsed.amountMinor !== undefined) {
    const data = snapshot.data()
    const currency = (data.currency === 'USD' ? 'USD' : 'PYG') as CurrencyCode
    const storedAmount = typeof data.amountMinor === 'number' ? Math.trunc(data.amountMinor) : 0
    const storedRate =
      typeof data.fxRate === 'number' && data.fxRate > 0
        ? data.fxRate
        : (ctx.fxRates[currency] ?? 1)
    const { baseAmountMinor } = computeBaseAmount(parsed.amountMinor, currency, {
      baseCurrency: ctx.baseCurrency,
      fxRates: { ...ctx.fxRates, [currency]: storedRate },
    })
    payload.amountMinor = parsed.amountMinor
    payload.baseAmountMinor = baseAmountMinor

    // Mantener coherentes los campos derivados que dependen del importe.
    // Las reglas permiten actualizar estos campos, pero no cambiar `fxRate`.
    if (storedAmount !== 0) {
      if (typeof data.toAmountMinor === 'number') {
        payload.toAmountMinor = Math.round(
          (data.toAmountMinor * parsed.amountMinor) / storedAmount,
        )
      }

      const principal = typeof data.principalMinor === 'number' ? data.principalMinor : null
      const interest = typeof data.interestMinor === 'number' ? data.interestMinor : null
      if (principal != null && interest != null && principal + interest === storedAmount) {
        const newPrincipal = Math.round((principal * parsed.amountMinor) / storedAmount)
        payload.principalMinor = newPrincipal
        payload.interestMinor = parsed.amountMinor - newPrincipal
      }
    }
  }

  const batch = writeBatch(db)
  batch.update(ref, payload)
  batch.set(
    doc(collection(ref, 'audit')),
    auditPayload('updated', actor, `Movimiento actualizado: ${parsed.description ?? transactionId}`),
  )
  await batch.commit()
}

export async function softDeleteTransaction(params: {
  householdId: string
  transactionId: string
  actor: Actor
}): Promise<void> {
  const db = getDb()
  const ref = doc(db, 'households', params.householdId, 'transactions', params.transactionId)
  const batch = writeBatch(db)
  batch.update(ref, {
    deletedAt: Timestamp.now(),
    deletedBy: params.actor.uid,
    updatedAt: Timestamp.now(),
    updatedBy: params.actor.uid,
  })
  batch.set(doc(collection(ref, 'audit')), auditPayload('deleted', params.actor, 'Movimiento eliminado'))
  await batch.commit()
}

export async function restoreTransaction(params: {
  householdId: string
  transactionId: string
  actor: Actor
}): Promise<void> {
  const db = getDb()
  const ref = doc(db, 'households', params.householdId, 'transactions', params.transactionId)
  const batch = writeBatch(db)
  batch.update(ref, {
    deletedAt: null,
    deletedBy: null,
    updatedAt: Timestamp.now(),
    updatedBy: params.actor.uid,
  })
  batch.set(doc(collection(ref, 'audit')), auditPayload('restored', params.actor, 'Movimiento restaurado'))
  await batch.commit()
}

export async function markTransactionConfirmed(params: {
  householdId: string
  transactionId: string
  actor: Actor
}): Promise<void> {
  await updateDoc(
    doc(getDb(), 'households', params.householdId, 'transactions', params.transactionId),
    {
      status: 'confirmed',
      updatedAt: Timestamp.now(),
      updatedBy: params.actor.uid,
    },
  )
}

function rangeConstraints(from: Date, to: Date): QueryConstraint[] {
  return [
    where('date', '>=', Timestamp.fromDate(from)),
    where('date', '<=', Timestamp.fromDate(to)),
  ]
}

export function subscribeTransactionsInRange(params: {
  householdId: string
  from: Date
  to: Date
  max?: number
  onData: (transactions: Transaction[]) => void
  onError: (error: unknown) => void
}): () => void {
  const { householdId, from, to, onData, onError } = params
  const max = Math.min(params.max ?? MAX_QUERY_LIMIT, MAX_QUERY_LIMIT)
  return subscribeDocs(
    `households/${householdId}/transactions`,
    mapTransaction,
    onData,
    onError,
    [...rangeConstraints(from, to), orderBy('date', 'desc'), limitTo(max)],
  )
}

export async function fetchTransactionsPage(params: {
  householdId: string
  from: Date
  to: Date
  pageSize?: number
  cursor?: QueryDocumentSnapshot<DocumentData> | null
}): Promise<TransactionPage> {
  const pageSize = Math.min(params.pageSize ?? DEFAULT_PAGE_SIZE, 200)
  const constraints: QueryConstraint[] = [
    ...rangeConstraints(params.from, params.to),
    orderBy('date', 'desc'),
    limitTo(pageSize + 1),
  ]
  if (params.cursor) constraints.push(startAfter(params.cursor))

  const snapshot = await getDocs(
    query(collection(getDb(), 'households', params.householdId, 'transactions'), ...constraints),
  )
  const docs = snapshot.docs.slice(0, pageSize)
  return {
    items: docs.map((item) => mapTransaction(item.id, item.data())),
    cursor: docs[docs.length - 1] ?? null,
    hasMore: snapshot.docs.length > pageSize,
  }
}

export async function fetchTransactionsInRange(params: {
  householdId: string
  from: Date
  to: Date
  max?: number
}): Promise<Transaction[]> {
  const max = Math.min(params.max ?? MAX_QUERY_LIMIT, MAX_QUERY_LIMIT)
  const snapshot = await getDocs(
    query(
      collection(getDb(), 'households', params.householdId, 'transactions'),
      ...rangeConstraints(params.from, params.to),
      orderBy('date', 'desc'),
      limitTo(max),
    ),
  )
  return snapshot.docs.map((item) => mapTransaction(item.id, item.data()))
}

export async function fetchTransactionAudit(
  householdId: string,
  transactionId: string,
): Promise<ReturnType<typeof mapAudit>[]> {
  const snapshot = await getDocs(
    query(
      collection(getDb(), 'households', householdId, 'transactions', transactionId, 'audit'),
      orderBy('at', 'desc'),
      limitTo(30),
    ),
  )
  return snapshot.docs.map((item) => mapAudit(item.id, item.data()))
}
