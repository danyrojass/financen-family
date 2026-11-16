import { z } from 'zod'
import { MAX_AMOUNT_MINOR } from '@/domain/money'

export const transactionTypeSchema = z.enum([
  'expense',
  'income',
  'transfer',
  'withdrawal',
  'card_payment',
  'loan_payment',
  'savings_contribution',
  'savings_withdrawal',
  'adjustment',
])

export const currencySchema = z.enum(['PYG', 'USD'])

const optionalId = z.string().min(1).max(128).nullable()

export const transactionInputSchema = z
  .object({
    type: transactionTypeSchema,
    date: z.date(),
    description: z.string().trim().min(1, 'La descripción es obligatoria').max(240),
    amountMinor: z
      .number()
      .int('El importe debe ser un entero en unidades mínimas')
      .refine((value) => Math.abs(value) <= MAX_AMOUNT_MINOR, 'Importe fuera de rango'),
    currency: currencySchema,
    categoryId: optionalId,
    accountId: optionalId,
    toAccountId: optionalId,
    toAmountMinor: z.number().int().positive().max(MAX_AMOUNT_MINOR).nullable(),
    cardId: optionalId,
    loanId: optionalId,
    commitmentId: optionalId,
    principalMinor: z.number().int().min(0).max(MAX_AMOUNT_MINOR).nullable(),
    interestMinor: z.number().int().min(0).max(MAX_AMOUNT_MINOR).nullable(),
    feeMinor: z.number().int().min(0).max(MAX_AMOUNT_MINOR).nullable(),
    notes: z.string().max(1000).nullable(),
    status: z.enum(['confirmed', 'pending']),
    entryMethod: z.enum(['manual', 'voice', 'import']),
    recurringId: optionalId,
    rawTranscript: z.string().max(2000).nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    installmentCount: z.number().int().min(1).max(48).optional(),
  })
  .superRefine((value, ctx) => {
    const addIssue = (message: string, path: string) =>
      ctx.addIssue({ code: 'custom', message, path: [path] })

    if (value.type === 'adjustment') {
      if (value.amountMinor === 0) addIssue('El ajuste no puede ser 0', 'amountMinor')
      if (!value.accountId && !value.cardId) addIssue('Elegí la cuenta o tarjeta a ajustar', 'accountId')
      return
    }

    if (value.amountMinor <= 0) addIssue('El importe debe ser mayor a 0', 'amountMinor')

    switch (value.type) {
      case 'expense':
      case 'income':
        if (!value.accountId && !value.cardId) {
          addIssue('Elegí una cuenta o una tarjeta', 'accountId')
        }
        break
      case 'transfer':
      case 'savings_contribution':
      case 'savings_withdrawal':
        if (!value.accountId) addIssue('Elegí la cuenta de origen', 'accountId')
        if (!value.toAccountId) addIssue('Elegí la cuenta de destino', 'toAccountId')
        if (value.accountId && value.accountId === value.toAccountId) {
          addIssue('La cuenta de origen y destino deben ser distintas', 'toAccountId')
        }
        break
      case 'withdrawal':
        if (!value.cardId) addIssue('Elegí la tarjeta de la que retirás', 'cardId')
        if (!value.toAccountId) addIssue('Elegí la cuenta que recibe el efectivo', 'toAccountId')
        break
      case 'card_payment':
        if (!value.cardId) addIssue('Elegí la tarjeta que pagás', 'cardId')
        if (!value.accountId) addIssue('Elegí la cuenta desde la que pagás', 'accountId')
        break
      case 'loan_payment': {
        if (!value.loanId) addIssue('Elegí el préstamo o compromiso', 'loanId')
        if (!value.accountId) addIssue('Elegí la cuenta de pago', 'accountId')
        const principal = value.principalMinor ?? 0
        const interest = value.interestMinor ?? 0
        if (principal + interest !== value.amountMinor) {
          addIssue('Capital + interés debe ser igual al importe pagado', 'principalMinor')
        }
        break
      }
      default:
        break
    }
  })

export type TransactionInput = z.infer<typeof transactionInputSchema>

export const transactionUpdateSchema = z
  .object({
    description: z.string().trim().min(1).max(240),
    notes: z.string().max(1000).nullable(),
    categoryId: optionalId,
    status: z.enum(['confirmed', 'pending']),
    amountMinor: z.number().int().refine((v) => Math.abs(v) <= MAX_AMOUNT_MINOR),
    date: z.date(),
  })
  .partial()

export type TransactionUpdate = z.infer<typeof transactionUpdateSchema>

export const accountInputSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  type: z.enum(['cash', 'bank', 'wallet', 'savings', 'investment', 'other']),
  currency: currencySchema,
  initialBalanceMinor: z.number().int().min(-MAX_AMOUNT_MINOR).max(MAX_AMOUNT_MINOR),
  includeInAvailable: z.boolean(),
  ownerId: optionalId,
  isActive: z.boolean(),
  notes: z.string().max(500).nullable(),
  sortOrder: z.number().int().optional(),
})

export type AccountInput = z.infer<typeof accountInputSchema>

export const cardInputSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  issuer: z.string().trim().min(1, 'La institución es obligatoria').max(120),
  holderId: optionalId,
  limitMinor: z.number().int().positive('El límite debe ser mayor a 0').max(MAX_AMOUNT_MINOR),
  currency: currencySchema,
  closingDay: z.number().int().min(1).max(31),
  dueDay: z.number().int().min(1).max(31),
  isActive: z.boolean(),
  notes: z.string().max(500).nullable(),
})

export type CardInput = z.infer<typeof cardInputSchema>

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(80),
  kind: z.enum(['expense', 'income']),
  parentId: optionalId,
  color: z.string().max(32).nullable(),
  icon: z.string().max(40).nullable(),
  isArchived: z.boolean(),
  sortOrder: z.number().int().optional(),
})

export type CategoryInput = z.infer<typeof categoryInputSchema>

export const budgetInputSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Periodo inválido'),
  categoryId: z.string().min(1, 'Elegí una categoría').max(128),
  amountMinor: z.number().int().positive('El presupuesto debe ser mayor a 0').max(MAX_AMOUNT_MINOR),
  currency: currencySchema,
  notes: z.string().max(300).nullable(),
})

export type BudgetInput = z.infer<typeof budgetInputSchema>

export const loanInputSchema = z.object({
  kind: z.enum(['loan', 'commitment']),
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  institution: z.string().max(120).nullable(),
  originalPrincipalMinor: z.number().int().positive().max(MAX_AMOUNT_MINOR),
  interestRate: z.number().min(0).max(100),
  installmentAmountMinor: z.number().int().positive().max(MAX_AMOUNT_MINOR),
  installmentsTotal: z.number().int().min(1).max(600),
  firstDueDate: z.date(),
  currency: currencySchema,
  accountId: optionalId,
  categoryId: optionalId,
  isActive: z.boolean(),
  notes: z.string().max(500).nullable(),
})

export type LoanInput = z.infer<typeof loanInputSchema>

export const recurringInputSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  type: z.enum(['expense', 'income', 'transfer', 'savings_contribution', 'card_payment', 'loan_payment']),
  amountMinor: z.number().int().positive().max(MAX_AMOUNT_MINOR),
  currency: currencySchema,
  frequency: z.enum(['weekly', 'monthly', 'yearly', 'custom']),
  intervalDays: z.number().int().min(1).max(365).nullable(),
  dayOfMonth: z.number().int().min(1).max(31).nullable(),
  nextRunAt: z.date(),
  accountId: optionalId,
  cardId: optionalId,
  toAccountId: optionalId,
  categoryId: optionalId,
  loanId: optionalId,
  autoGenerate: z.boolean(),
  isActive: z.boolean(),
  notes: z.string().max(300).nullable(),
})

export type RecurringInput = z.infer<typeof recurringInputSchema>
