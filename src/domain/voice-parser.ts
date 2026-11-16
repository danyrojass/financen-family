/**
 * Interprete deterministico de frases de voz (es-PY).
 *
 * Arquitectura desacoplada: este modulo implementa la interfaz `VoiceInterpreter`.
 * Hoy usa reglas + diccionarios locales (sin red, sin API keys). Manana se puede
 * inyectar un proveedor LLM a traves de una Cloud Function sin tocar la UI.
 */
import type {
  Account,
  Card,
  Category,
  Loan,
  TransactionDraft,
  TransactionType,
} from './models'
import { CURRENCY_META, type CurrencyCode } from './money'
import { CATEGORY_KEYWORDS } from './defaults'
import { addDays, fromDateInput } from '@/lib/date'

export interface VoiceContext {
  baseCurrency: CurrencyCode
  accounts: Array<Pick<Account, 'id' | 'name' | 'type' | 'currency'>>
  cards: Array<Pick<Card, 'id' | 'name' | 'issuer' | 'currency'>>
  categories: Array<Pick<Category, 'id' | 'name' | 'kind' | 'parentId'>>
  loans: Array<Pick<Loan, 'id' | 'name' | 'kind'>>
}

export interface VoiceInterpreter {
  interpret(transcript: string, context: VoiceContext): TransactionDraft
}

export const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

const NUMBER_WORDS: Record<string, number> = {
  cero: 0,
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintiun: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
  doscientos: 200,
  doscientas: 200,
  trescientos: 300,
  trescientas: 300,
  cuatrocientos: 400,
  cuatrocientas: 400,
  quinientos: 500,
  quinientas: 500,
  seiscientos: 600,
  seiscientas: 600,
  setecientos: 700,
  setecientas: 700,
  ochocientos: 800,
  ochocientas: 800,
  novecientos: 900,
  novecientas: 900,
}

const MULTIPLIERS: Record<string, number> = {
  mil: 1_000,
  k: 1_000,
  millon: 1_000_000,
  millones: 1_000_000,
}

const CURRENCY_WORDS: Record<string, CurrencyCode> = {
  dolar: 'USD',
  dolares: 'USD',
  usd: 'USD',
  verdes: 'USD',
  guarani: 'PYG',
  guaranies: 'PYG',
  gs: 'PYG',
  pyg: 'PYG',
}

const VERBS = [
  'gaste',
  'gasté',
  'pague',
  'pagué',
  'compre',
  'compré',
  'abone',
  'aboné',
  'recibi',
  'recibí',
  'cobre',
  'cobré',
  'ingrese',
  'ingresé',
  'transferi',
  'transferí',
  'pase',
  'pasé',
  'retire',
  'retiré',
  'ahorre',
  'ahorré',
  'aporte',
  'aporte',
  'salio',
  'salió',
  'me pagaron',
  'entraron',
]

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .replace(/[¿?¡!;:"“”()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

function parseNumericToken(token: string): number | null {
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(token)) {
    return Number(token.replace(/[.,]/g, ''))
  }
  const withK = token.match(/^(\d+(?:[.,]\d+)?)k$/)
  if (withK?.[1]) return Number(withK[1].replace(',', '.')) * 1000
  if (/^\d+(?:[.,]\d+)?$/.test(token)) {
    return Number(token.replace(',', '.'))
  }
  return null
}

interface AmountMatch {
  major: number
  currency: CurrencyCode | null
  startIndex: number
  endIndex: number
  raw: string
}

function extractAmount(tokens: string[]): AmountMatch | null {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const numeric = parseNumericToken(token)
    const wordValue = NUMBER_WORDS[token]
    const isMultiplierStart = token in MULTIPLIERS
    if (numeric === null && wordValue == null && !isMultiplierStart) continue

    let total = 0
    let current = 0
    let used = false
    let j = i

    while (j < tokens.length) {
      const currentToken = tokens[j]
      const value = NUMBER_WORDS[currentToken]
      const multiplier = MULTIPLIERS[currentToken]
      const asNumber = parseNumericToken(currentToken)

      if (currentToken === 'y') {
        j++
        continue
      }
      if (multiplier) {
        current = (current || 1) * multiplier
        total += current
        current = 0
        used = true
        j++
        continue
      }
      if (value != null) {
        current += value
        used = true
        j++
        continue
      }
      if (asNumber != null) {
        current += asNumber
        used = true
        j++
        continue
      }
      break
    }

    if (!used) continue
    const major = total + current
    if (!Number.isFinite(major) || major <= 0) continue

    let currency: CurrencyCode | null = null
    for (let k = j; k < Math.min(j + 3, tokens.length); k++) {
      const currencyWord = CURRENCY_WORDS[tokens[k]]
      if (currencyWord) {
        currency = currencyWord
        break
      }
    }
    if (!currency) {
      for (const candidate of tokens) {
        const currencyWord = CURRENCY_WORDS[candidate]
        if (currencyWord) {
          currency = currencyWord
          break
        }
      }
    }

    return {
      major,
      currency,
      startIndex: i,
      endIndex: j,
      raw: tokens.slice(i, j).join(' '),
    }
  }
  return null
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(normalizeText(keyword)))
}

function detectType(normalized: string): { type: TransactionType; explicit: boolean } {
  if (containsAny(normalized, ['transferi', 'transferencia', 'transferir', 'pase de', 'movi de']) &&
    /\bde\b.+\ba\b/.test(normalized)) {
    return { type: 'transfer', explicit: true }
  }
  if (containsAny(normalized, ['retire', 'retiro', 'avance', 'adelanto']) &&
    containsAny(normalized, ['tarjeta', 'credito'])) {
    return { type: 'withdrawal', explicit: true }
  }
  if (
    containsAny(normalized, ['pague la tarjeta', 'pago de tarjeta', 'pague el resumen', 'pague el extracto', 'pague tarjeta']) ||
    (containsAny(normalized, ['pague', 'pago', 'abone']) &&
      containsAny(normalized, ['tarjeta', 'resumen', 'extracto']))
  ) {
    return { type: 'card_payment', explicit: true }
  }
  if (
    containsAny(normalized, ['prestamo', 'cuota del prestamo', 'cuota del auto', 'credito hipotecario']) &&
    containsAny(normalized, ['pague', 'pago', 'abone', 'cuota'])
  ) {
    return { type: 'loan_payment', explicit: true }
  }
  if (containsAny(normalized, ['ahorre', 'ahorro', 'aporte a ahorro', 'guarde en ahorro'])) {
    return { type: 'savings_contribution', explicit: true }
  }
  if (containsAny(normalized, ['recibi', 'cobre', 'ingreso', 'ingrese', 'me pagaron', 'entraron', 'entró'])) {
    return { type: 'income', explicit: true }
  }
  if (containsAny(normalized, ['gaste', 'compre', 'pague', 'abone', 'sali'])) {
    return { type: 'expense', explicit: true }
  }
  return { type: 'expense', explicit: false }
}

function detectAccount(
  normalized: string,
  accounts: VoiceContext['accounts'],
  preferType?: Account['type'],
): VoiceContext['accounts'][number] | null {
  const candidates = accounts
    .filter((account) => !preferType || account.type === preferType)
    .map((account) => ({ account, name: normalizeText(account.name) }))
    .filter(({ name }) => name.length >= 3 && normalized.includes(name))
    .sort((a, b) => b.name.length - a.name.length)

  if (candidates[0]) return candidates[0].account

  if (containsAny(normalized, ['efectivo', 'contado', 'cash'])) {
    const cash =
      accounts.find((account) => account.type === 'cash') ??
      accounts.find((account) => normalizeText(account.name).includes('efectivo'))
    if (cash) return cash
  }
  return null
}

function detectCard(
  normalized: string,
  cards: VoiceContext['cards'],
): VoiceContext['cards'][number] | null {
  const scored = cards
    .map((card) => {
      const name = normalizeText(card.name)
      const issuer = normalizeText(card.issuer)
      let score = 0
      if (name.length >= 3 && normalized.includes(name)) score = name.length + 10
      else if (issuer.length >= 3 && normalized.includes(issuer)) score = issuer.length
      return { card, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored[0]?.card ?? null
}

function detectCategory(
  normalized: string,
  categories: VoiceContext['categories'],
  kind: 'expense' | 'income',
): VoiceContext['categories'][number] | null {
  const relevant = categories.filter((category) => category.kind === kind)
  const matches = relevant
    .map((category) => {
      const name = normalizeText(category.name)
      return { category, score: name.length >= 3 && normalized.includes(name) ? name.length : 0 }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  if (matches[0]) return matches[0].category
  return null
}

function categoryByHint(
  hint: string,
  categories: VoiceContext['categories'],
  kind: 'expense' | 'income',
): VoiceContext['categories'][number] | null {
  const target = normalizeText(hint)
  return (
    categories.find((category) => category.kind === kind && normalizeText(category.name) === target) ??
    null
  )
}

function matchCategoriesByKeywords(
  normalized: string,
  categories: VoiceContext['categories'],
  kind: 'expense' | 'income',
  keywordMap: Array<{ keywords: string[]; categoryHint: string }>,
): VoiceContext['categories'][number] | null {
  for (const entry of keywordMap) {
    const found = entry.keywords.find((keyword) => normalized.includes(normalizeText(keyword)))
    if (!found) continue
    const category = categoryByHint(entry.categoryHint, categories, kind)
    if (category) return category
  }
  return null
}

function detectDate(normalized: string): Date {
  const today = new Date()
  if (/\banteayer\b|\bantes de ayer\b/.test(normalized)) return addDays(today, -2)
  if (/\bayer\b/.test(normalized)) return addDays(today, -1)
  if (/\bmanana\b/.test(normalized)) return addDays(today, 1)

  const explicit = normalized.match(/\b(\d{1,2}) de ([a-z]+)(?: de (\d{4}))?\b/)
  if (explicit) {
    const day = Number(explicit[1])
    const monthName = explicit[2]
    const monthIndex = MONTH_NAMES.indexOf(monthName)
    if (monthIndex >= 0 && day >= 1 && day <= 31) {
      const year = explicit[3] ? Number(explicit[3]) : today.getFullYear()
      const candidate = new Date(year, monthIndex, day)
      if (candidate.getTime() > today.getTime() + 7 * 86_400_000) {
        candidate.setFullYear(year - 1)
      }
      if (!Number.isNaN(candidate.getTime())) return candidate
    }
  }

  const iso = normalized.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (iso?.[1]) {
    const parsed = fromDateInput(iso[1])
    if (parsed) return parsed
  }
  return today
}

function detectLoan(
  normalized: string,
  loans: VoiceContext['loans'],
): VoiceContext['loans'][number] | null {
  const matches = loans
    .map((loan) => {
      const name = normalizeText(loan.name)
      return { loan, score: name.length >= 3 && normalized.includes(name) ? name.length : 0 }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
  if (matches[0]) return matches[0].loan
  if (normalized.includes('prestamo')) {
    return loans.find((loan) => loan.kind === 'loan') ?? null
  }
  return null
}

function cleanupDescription(
  transcript: string,
  amount: AmountMatch | null,
  accountName: string | null,
  cardName: string | null,
  type: TransactionType,
): string {
  let cleaned = transcript
  for (const verb of VERBS) {
    cleaned = cleaned.replace(new RegExp(`\\b${escapeRegex(verb)}\\b`, 'gi'), ' ')
  }
  if (amount) {
    cleaned = cleaned.replace(
      new RegExp(`\\b${escapeRegex(amount.raw)}\\b`, 'gi'),
      ' ',
    )
  }
  cleaned = cleaned
    .replace(/\b\d[\d.,]*\s*(mil|millón|millon|millones|k)?\b/gi, ' ')
    .replace(/\b(guaraníes|guaranies|dólares|dolares|usd|gs|pyg)\b/gi, ' ')
  if (cardName) {
    cleaned = cleaned.replace(new RegExp(escapeRegex(cardName), 'gi'), ' ')
  }
  if (accountName) {
    cleaned = cleaned.replace(new RegExp(escapeRegex(accountName), 'gi'), ' ')
  }
  cleaned = cleaned
    .replace(/\b(en efectivo|al contado|con la tarjeta|con tarjeta|de la tarjeta)\b/gi, ' ')
    .replace(
      /\b(en|de|del|con|por|para|la|el|los|las|un|una|al|a|hoy|ayer|anteayer|mi|mis)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned.length >= 3) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  }
  if (type === 'card_payment') return 'Pago de tarjeta'
  if (type === 'withdrawal') return 'Retiro de efectivo'
  if (type === 'loan_payment') return 'Pago de préstamo'
  if (type === 'savings_contribution') return 'Aporte a ahorro'
  if (type === 'transfer') return 'Transferencia entre cuentas'
  return 'Movimiento'
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function detectTransferEndpoints(
  normalized: string,
  accounts: VoiceContext['accounts'],
): { from: VoiceContext['accounts'][number] | null; to: VoiceContext['accounts'][number] | null } {
  const match = normalized.match(/\bde\s+(.+?)\s+a\s+(.+)$/)
  if (!match) return { from: null, to: null }
  const fromSegment = match[1] ?? ''
  const toSegment = match[2] ?? ''
  const from = detectAccount(fromSegment, accounts) ?? detectAccount(fromSegment, accounts, 'bank')
  const to = detectAccount(toSegment, accounts)
  return { from, to }
}

export function interpretVoiceCommand(
  transcript: string,
  context: VoiceContext,
  now = new Date(),
): TransactionDraft {
  const normalized = normalizeText(transcript)
  const tokens = tokenize(transcript)
  const amount = extractAmount(tokens)
  const typeInfo = detectType(normalized)

  const currency = amount?.currency ?? context.baseCurrency
  const amountMinor =
    amount != null
      ? Math.round(amount.major * 10 ** CURRENCY_META[currency].decimals)
      : null

  const missing: string[] = []
  const warnings: string[] = []

  let accountId: string | null = null
  let accountName: string | null = null
  let toAccountId: string | null = null
  let toAccountName: string | null = null
  let cardId: string | null = null
  let cardName: string | null = null
  let loanId: string | null = null
  let categoryId: string | null = null
  let categoryName: string | null = null

  const transferEndpoints = detectTransferEndpoints(normalized, context.accounts)
  const card = detectCard(normalized, context.cards)
  const account = detectAccount(normalized, context.accounts)

  const isIncome = typeInfo.type === 'income'
  const kind: 'expense' | 'income' = isIncome ? 'income' : 'expense'

  const keywordCategory = matchCategoriesByKeywords(
    normalized,
    context.categories,
    kind,
    CATEGORY_KEYWORDS,
  )
  const directCategory =
    typeInfo.type === 'expense' || typeInfo.type === 'income' || typeInfo.type === 'loan_payment'
      ? detectCategory(normalized, context.categories, kind)
      : null
  const category = directCategory ?? keywordCategory

  if (category) {
    categoryId = category.id
    categoryName = category.name
  } else if (
    typeInfo.type === 'expense' ||
    typeInfo.type === 'income' ||
    typeInfo.type === 'loan_payment'
  ) {
    warnings.push('No se detectó una categoría. Podés elegirla en la vista previa.')
  }

  switch (typeInfo.type) {
    case 'transfer':
      accountId = transferEndpoints.from?.id ?? null
      accountName = transferEndpoints.from?.name ?? null
      toAccountId = transferEndpoints.to?.id ?? null
      toAccountName = transferEndpoints.to?.name ?? null
      if (!accountId) missing.push('cuenta de origen')
      if (!toAccountId) missing.push('cuenta de destino')
      if (!amount) missing.push('importe')
      break
    case 'withdrawal':
      cardId = card?.id ?? null
      cardName = card?.name ?? null
      accountId = account?.id ?? null
      accountName = account?.name ?? null
      if (account) {
        toAccountId = account.id
        toAccountName = account.name
      }
      if (!cardId) missing.push('tarjeta')
      if (!toAccountId) missing.push('cuenta de efectivo')
      if (!amount) missing.push('importe')
      break
    case 'card_payment':
      cardId = card?.id ?? null
      cardName = card?.name ?? null
      accountId = account?.id ?? null
      accountName = account?.name ?? null
      if (!cardId) missing.push('tarjeta')
      if (!accountId) missing.push('cuenta de pago')
      if (!amount) missing.push('importe')
      break
    case 'loan_payment': {
      const loan = detectLoan(normalized, context.loans)
      loanId = loan?.id ?? null
      accountId = account?.id ?? null
      accountName = account?.name ?? null
      if (!loanId) missing.push('préstamo o compromiso')
      if (!accountId) missing.push('cuenta de pago')
      if (!amount) missing.push('importe')
      break
    }
    case 'income':
      accountId = account?.id ?? null
      accountName = account?.name ?? null
      if (!accountId) missing.push('cuenta donde entró el dinero')
      if (!amount) missing.push('importe')
      break
    case 'savings_contribution':
    case 'savings_withdrawal':
      accountId = transferEndpoints.from?.id ?? account?.id ?? null
      accountName = transferEndpoints.from?.name ?? account?.name ?? null
      toAccountId = transferEndpoints.to?.id ?? null
      toAccountName = transferEndpoints.to?.name ?? null
      if (!accountId) missing.push('cuenta de origen')
      if (!toAccountId) missing.push('cuenta de ahorro')
      if (!amount) missing.push('importe')
      break
    case 'adjustment':
      missing.push('importe')
      break
    case 'expense':
    default:
      if (card) {
        cardId = card.id
        cardName = card.name
        warnings.push(`Se interpretó como gasto con la tarjeta ${card.name}.`)
      } else {
        accountId = account?.id ?? null
        accountName = account?.name ?? null
        if (!accountId) missing.push('medio de pago (cuenta o tarjeta)')
      }
      if (!amount) missing.push('importe')
      break
  }

  if (!amount) {
    warnings.push('No se detectó un importe claro. Escribilo manualmente.')
  }
  if (amount?.currency && amount.currency !== context.baseCurrency) {
    warnings.push(
      `Importe en ${amount.currency}. Se convertirá a ${context.baseCurrency} con la cotización configurada.`,
    )
  }
  if (typeInfo.type === 'expense' && !typeInfo.explicit) {
    warnings.push('Se asumió que es un gasto porque no se detectó el tipo de movimiento.')
  }

  const description =
    typeInfo.type === 'transfer' && accountName && toAccountName
      ? `${accountName} → ${toAccountName}`
      : cleanupDescription(transcript, amount, accountName, cardName, typeInfo.type)

  let confidence = 0.45
  if (amount) confidence += 0.2
  if (typeInfo.explicit) confidence += 0.1
  if (cardId || accountId) confidence += 0.15
  if (categoryId) confidence += 0.05
  if (missing.length === 0) confidence += 0.03
  confidence = Math.min(0.98, confidence)

  const draft: TransactionDraft = {
    type: typeInfo.type,
    date: detectDate(normalized) ?? now,
    description,
    amountMinor,
    currency,
    categoryId,
    categoryName,
    accountId,
    accountName,
    toAccountId,
    toAccountName,
    cardId,
    cardName,
    loanId,
    notes: null,
    entryMethod: 'voice',
    rawTranscript: transcript,
    confidence,
    missing,
    warnings,
  }

  return draft
}

export const rulesVoiceInterpreter: VoiceInterpreter = {
  interpret: (transcript, context) => interpretVoiceCommand(transcript, context),
}
