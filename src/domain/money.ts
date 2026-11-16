/**
 * Capa de dominio - Dinero.
 *
 * Reglas no negociables:
 *  - Los importes se guardan SIEMPRE como enteros en la unidad minima de la
 *    moneda (PYG: guaranies, USD: centavos). Nunca floats para operaciones.
 *  - El redondeo solo ocurre al convertir entre monedas y queda registrado en
 *    el movimiento (baseAmountMinor + fxRate).
 *  - Este modulo no depende de Firebase ni de React: es 100% testeable.
 */

export const CURRENCY_META = {
  PYG: {
    code: 'PYG',
    symbol: 'G.',
    name: 'Guaraní paraguayo',
    decimals: 0,
    locale: 'es-PY',
  },
  USD: {
    code: 'USD',
    symbol: 'USD',
    name: 'Dólar estadounidense',
    decimals: 2,
    locale: 'en-US',
  },
} as const

export type CurrencyCode = keyof typeof CURRENCY_META

export const CURRENCY_CODES = Object.keys(CURRENCY_META) as CurrencyCode[]

/** Limite defensivo para evitar desbordes de Number/BigInt y datos absurdos. */
export const MAX_AMOUNT_MINOR = 1_000_000_000_000 // 1 billon de unidades minimas
export const MAX_FX_RATE = 1_000_000

export function isCurrency(value: unknown): value is CurrencyCode {
  return value === 'PYG' || value === 'USD'
}

export function decimalsOf(currency: CurrencyCode): number {
  return CURRENCY_META[currency].decimals
}

export function unitFactor(currency: CurrencyCode): number {
  return 10 ** decimalsOf(currency)
}

/** Convierte un monto "humano" (ej. 1500000) a unidades minimas. Solo para input. */
export function toMinor(major: number, currency: CurrencyCode): number {
  return Math.round(major * unitFactor(currency))
}

/** Convierte unidades minimas a un number "humano". Solo para presentacion. */
export function fromMinor(minor: number, currency: CurrencyCode): number {
  return minor / unitFactor(currency)
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export interface FormatMoneyOptions {
  /** Incluye el simbolo de la moneda (por defecto true). */
  withSymbol?: boolean
  /** Fuerza la cantidad de decimales. */
  decimals?: number
  /** Muestra el signo + en importes positivos. */
  explicitSign?: boolean
  /** Formato corto para ejes de graficos: G. 1,5 M */
  compact?: boolean
}

/**
 * Formatea un importe entero en unidades minimas.
 *  formatMoney(150000000, 'PYG')  -> "G. 1.500.000"
 *  formatMoney(25000, 'USD')      -> "USD 250,00"
 */
export function formatMoney(
  amountMinor: number,
  currency: CurrencyCode,
  options: FormatMoneyOptions = {},
): string {
  const { withSymbol = true, decimals = decimalsOf(currency), explicitSign = false } = options
  const meta = CURRENCY_META[currency]
  const sign = amountMinor < 0 ? '-' : explicitSign ? '+' : ''
  const abs = Math.abs(Math.trunc(amountMinor))

  if (options.compact) {
    const { value, suffix } = compactMoney(abs, currency)
    return `${sign}${withSymbol ? `${meta.symbol} ` : ''}${value}${suffix}`
  }

  const factor = 10 ** decimals
  const integerPart = Math.floor(abs / factor)
  const fractionPart = abs % factor
  const formattedInteger = groupThousands(String(integerPart))
  const formattedFraction =
    decimals > 0 ? `,${String(fractionPart).padStart(decimals, '0')}` : ''

  return `${sign}${withSymbol ? `${meta.symbol} ` : ''}${formattedInteger}${formattedFraction}`
}

function compactMoney(absMinor: number, currency: CurrencyCode): { value: string; suffix: string } {
  const major = absMinor / unitFactor(currency)
  const fmt = (n: number) => n.toFixed(1).replace('.', ',')
  if (major >= 1_000_000_000) return { value: fmt(major / 1_000_000_000), suffix: ' MM' }
  if (major >= 1_000_000) return { value: fmt(major / 1_000_000), suffix: ' M' }
  if (major >= 1_000) return { value: fmt(major / 1_000), suffix: ' K' }
  return { value: String(Math.round(major)), suffix: '' }
}

/** Importe sin simbolo, con separadores locales. */
export function formatAmount(amountMinor: number, currency: CurrencyCode): string {
  return formatMoney(amountMinor, currency, { withSymbol: false })
}

export function formatPercent(ratio: number, decimals = 0): string {
  return `${(ratio * 100).toFixed(decimals).replace('.', ',')}%`
}

/**
 * Parseo de importes escritos por el usuario.
 * Acepta "1.500.000", "1500000", "1,5", "USD 250,00", "G. 45.000", "45 000".
 * Devuelve null si no es un importe valido.
 */
export function parseAmountToMinor(input: string, currency: CurrencyCode): number | null {
  if (input == null) return null
  let text = String(input).trim().toLowerCase()
  if (!text) return null

  const negative = text.startsWith('-') || (text.startsWith('(') && text.endsWith(')'))
  text = text.replace(/[()]/g, '').replace(/^-/, '')

  // Quita simbolos y letras de moneda.
  text = text
    .replace(/gs\.?|g\.|guaranies|guaraníes|pyg|usd|us\$|dolares|dólares|dolar|dólar/g, '')
    .replace(/[^0-9.,\s]/g, '')
    .replace(/\s/g, '')

  if (!text || !/[0-9]/.test(text)) return null

  const decimals = decimalsOf(currency)
  let normalized: string

  if (decimals === 0) {
    normalized = text.replace(/[.,]/g, '')
  } else {
    const lastDot = text.lastIndexOf('.')
    const lastComma = text.lastIndexOf(',')
    const lastSep = Math.max(lastDot, lastComma)
    const digitsAfter = lastSep >= 0 ? text.length - lastSep - 1 : 0
    const isDecimalSeparator =
      lastSep >= 0 &&
      digitsAfter > 0 &&
      digitsAfter <= decimals &&
      text.slice(0, lastSep).replace(/[^0-9]/g, '').length > 0

    if (isDecimalSeparator) {
      const integerPart = text.slice(0, lastSep).replace(/[^0-9]/g, '')
      const fractionPart = text.slice(lastSep + 1).replace(/[^0-9]/g, '')
      normalized = `${integerPart || '0'}.${fractionPart.padEnd(decimals, '0').slice(0, decimals)}`
    } else {
      normalized = text.replace(/[.,]/g, '')
    }
  }

  if (!/^[0-9]+(\.[0-9]+)?$/.test(normalized)) return null
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  const minor = Math.round(value * (decimals === 0 ? 1 : 10 ** decimals))
  if (!Number.isSafeInteger(minor)) return null
  if (Math.abs(minor) > MAX_AMOUNT_MINOR) return null
  return negative ? -minor : minor
}

/** Redondeo entero de una division de BigInt (half away from zero). */
function divideRoundBigInt(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) return 0
  const negative = numerator < 0n !== denominator < 0n
  const a = numerator < 0n ? -numerator : numerator
  const b = denominator < 0n ? -denominator : denominator
  const quotient = (a * 2n + b) / (2n * b)
  const result = Number(quotient)
  return negative ? -result : result
}

/**
 * Convierte entre monedas usando tasas expresadas como
 * "1 unidad de la moneda X = rate unidades de la moneda base".
 * La base siempre tiene tasa 1. Usa BigInt para evitar errores de coma flotante.
 * Devuelve null si falta la tasa.
 */
export function convertMinor(
  amountMinor: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rates: Record<string, number>,
  baseCurrency: CurrencyCode,
): number | null {
  if (from === to) return amountMinor
  if (!Number.isFinite(amountMinor)) return null

  const fromRate = from === baseCurrency ? 1 : rates[from]
  const toRate = to === baseCurrency ? 1 : rates[to]
  if (!fromRate || !toRate || fromRate <= 0 || toRate <= 0) return null

  const scale = 10_000 // 4 decimales de precision para la tasa
  const fromScaled = BigInt(Math.round(fromRate * scale))
  const toScaled = BigInt(Math.round(toRate * scale))
  const fromFactor = 10n ** BigInt(decimalsOf(from))
  const toFactor = 10n ** BigInt(decimalsOf(to))

  const numerator = BigInt(amountMinor) * fromScaled * toFactor
  const denominator = fromFactor * toScaled
  return divideRoundBigInt(numerator, denominator)
}

/** Tasa efectiva (base por unidad) aplicada en una conversion. */
export function effectiveRate(
  amountMinor: number,
  convertedMinor: number,
  from: CurrencyCode,
  to: CurrencyCode,
): number | null {
  if (amountMinor === 0) return null
  const fromMajor = fromMinor(amountMinor, from)
  const toMajor = fromMinor(convertedMinor, to)
  if (toMajor === 0) return null
  return fromMajor / toMajor
}

export function isSafeAmount(amountMinor: number): boolean {
  return (
    Number.isInteger(amountMinor) &&
    Number.isSafeInteger(amountMinor) &&
    Math.abs(amountMinor) <= MAX_AMOUNT_MINOR
  )
}

/** Suma segura de importes enteros. */
export function sumMinor(values: number[]): number {
  return values.reduce((acc, value) => acc + Math.trunc(value || 0), 0)
}
