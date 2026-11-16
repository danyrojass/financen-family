import type { MonthKey } from '@/domain/models'

export function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function endOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(23, 59, 59, 999)
  return copy
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

export function addMonths(date: Date, months: number): Date {
  const copy = new Date(date)
  const day = copy.getDate()
  copy.setDate(1)
  copy.setMonth(copy.getMonth() + months)
  const lastDay = daysInMonth(copy.getFullYear(), copy.getMonth())
  copy.setDate(Math.min(day, lastDay))
  return copy
}

export function addYears(date: Date, years: number): Date {
  return addMonths(date, years * 12)
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

export function parseMonthKey(key: string): MonthKey {
  const [year, month] = key.split('-').map(Number)
  return { year, month } // month 1-12
}

export function monthKeyFromParts({ year, month }: MonthKey): string {
  return `${year}-${pad2(month)}`
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0)
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
}

export function monthRange(monthKey: string): { from: Date; to: Date } {
  const { year, month } = parseMonthKey(monthKey)
  return {
    from: new Date(year, month - 1, 1, 0, 0, 0, 0),
    to: new Date(year, month, 0, 23, 59, 59, 999),
  }
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const { year, month } = parseMonthKey(monthKey)
  const date = new Date(year, month - 1 + delta, 1)
  return monthKeyOf(date)
}

export function lastNMonthKeys(count: number, reference = new Date()): string[] {
  const keys: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    keys.push(shiftMonthKey(monthKeyOf(reference), -i))
  }
  return keys
}

const MONTH_NAMES = [
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

export function monthLabel(monthKey: string, options: { short?: boolean; withYear?: boolean } = {}): string {
  const { year, month } = parseMonthKey(monthKey)
  const name = MONTH_NAMES[(month - 1 + 12) % 12] ?? ''
  const formatted = options.short ? name.slice(0, 3) : name
  const capitalized = formatted.charAt(0).toUpperCase() + formatted.slice(1)
  return options.withYear === false ? capitalized : `${capitalized} ${year}`
}

export function formatDate(date: Date, style: 'short' | 'long' | 'day-month' = 'short'): string {
  if (style === 'long') {
    return date.toLocaleDateString('es-PY', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  }
  if (style === 'day-month') {
    return date.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' })
  }
  return date.toLocaleDateString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** yyyy-MM-dd para <input type="date"> en horario local. */
export function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** yyyy-MM para <input type="month"> */
export function toMonthInput(date: Date): string {
  return monthKeyOf(date)
}

/** Interpreta yyyy-MM-dd como fecha local a medianoche. */
export function fromDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return null
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function relativeDayLabel(date: Date, reference = new Date()): string {
  const diff = Math.round(
    (startOfDay(date).getTime() - startOfDay(reference).getTime()) / 86_400_000,
  )
  if (diff === 0) return 'Hoy'
  if (diff === -1) return 'Ayer'
  if (diff === 1) return 'Mañana'
  if (diff < 0 && diff >= -6) return `Hace ${Math.abs(diff)} días`
  if (diff > 1 && diff <= 6) return `En ${diff} días`
  return formatDate(date)
}
