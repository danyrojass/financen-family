import type { Account, Card, Category, HouseholdMember, Transaction } from '@/domain/models'
import { fromMinor, decimalsOf, type CurrencyCode } from '@/domain/money'
import { formatDate } from './date'
import { TRANSACTION_TYPE_LABELS } from './labels'

export interface ExportLookups {
  categories: Category[]
  accounts: Account[]
  cards: Card[]
  members: HouseholdMember[]
}

export interface ExportTable {
  headers: string[]
  rows: Array<Array<string | number>>
  baseCurrency: CurrencyCode
}

function nameMap<T extends { id: string; name: string }>(items: T[]): Map<string, string> {
  return new Map(items.map((item) => [item.id, item.name]))
}

function dateString(date: Date): string {
  return formatDate(date, 'short')
}

/**
 * Tabla plana y reproducible con los movimientos. El importe se exporta en la
 * moneda original y ademas convertido a la moneda base del hogar.
 */
export function buildTransactionExportTable(
  transactions: Transaction[],
  lookups: ExportLookups,
  baseCurrency: CurrencyCode,
): ExportTable {
  const categories = nameMap(lookups.categories)
  const accounts = nameMap(lookups.accounts)
  const cards = nameMap(lookups.cards)
  const members = new Map(lookups.members.map((member) => [member.uid, member.displayName]))

  const headers = [
    'Fecha',
    'Tipo',
    'Descripción',
    'Categoría',
    'Cuenta',
    'Cuenta destino',
    'Tarjeta',
    'Integrante',
    'Moneda',
    'Importe',
    'Importe base (' + baseCurrency + ')',
    'Estado',
    'Método',
    'Notas',
  ]

  const rows = [...transactions]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map((tx) => {
      const decimals = decimalsOf(tx.currency)
      const amountMajor = Number(fromMinor(tx.amountMinor, tx.currency).toFixed(decimals))
      const baseDecimals = decimalsOf(baseCurrency)
      const baseMajor = Number(fromMinor(tx.baseAmountMinor, baseCurrency).toFixed(baseDecimals))
      return [
        dateString(tx.date),
        TRANSACTION_TYPE_LABELS[tx.type] ?? tx.type,
        tx.description,
        tx.categoryId ? categories.get(tx.categoryId) ?? '' : '',
        tx.accountId ? accounts.get(tx.accountId) ?? '' : '',
        tx.toAccountId ? accounts.get(tx.toAccountId) ?? '' : '',
        tx.cardId ? cards.get(tx.cardId) ?? '' : '',
        members.get(tx.createdBy) ?? tx.createdByName,
        tx.currency,
        amountMajor,
        baseMajor,
        tx.status === 'confirmed' ? 'Confirmado' : 'Pendiente',
        tx.entryMethod === 'voice' ? 'Voz' : tx.entryMethod === 'import' ? 'Importado' : 'Manual',
        tx.notes ?? '',
      ]
    })

  return { headers, rows, baseCurrency }
}

function escapeCsvCell(value: string | number): string {
  const text = String(value ?? '')
  if (/[";\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function tableToCsv(table: ExportTable): string {
  const lines = [table.headers.map(escapeCsvCell).join(';')]
  for (const row of table.rows) {
    lines.push(row.map(escapeCsvCell).join(';'))
  }
  return lines.join('\r\n')
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function downloadCsv(filename: string, table: ExportTable): void {
  // BOM para que Excel detecte UTF-8 (tildes y ñ).
  const content = `\uFEFF${tableToCsv(table)}`
  downloadBlob(filename, new Blob([content], { type: 'text/csv;charset=utf-8' }))
}

export async function downloadXlsx(filename: string, table: ExportTable): Promise<void> {
  const { buildXlsxBuffer } = await import('./excel-export')
  const buffer = await buildXlsxBuffer(table, 'Movimientos')
  downloadBlob(
    filename,
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  )
}

export function exportFilename(prefix: string, from: Date, to: Date, extension: string): string {
  const start = `${from.getFullYear()}${String(from.getMonth() + 1).padStart(2, '0')}${String(from.getDate()).padStart(2, '0')}`
  const end = `${to.getFullYear()}${String(to.getMonth() + 1).padStart(2, '0')}${String(to.getDate()).padStart(2, '0')}`
  return `${prefix}-${start}-${end}.${extension}`
}
