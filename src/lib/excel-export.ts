import { Workbook } from 'exceljs'
import type { ExportTable } from './export'

/**
 * Genera el binario XLSX. Se carga con import() dinamico desde la UI para no
 * incluir exceljs en el bundle inicial.
 */
export async function buildXlsxBuffer(table: ExportTable, sheetName: string): Promise<ArrayBuffer> {
  const workbook = new Workbook()
  workbook.creator = 'Finanzas del Hogar'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(sheetName.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  sheet.addRow(table.headers)
  const header = sheet.getRow(1)
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F766E' },
  }
  header.alignment = { vertical: 'middle' }
  header.height = 20

  for (const row of table.rows) {
    sheet.addRow(row)
  }

  const amountColumn = table.headers.findIndex((headerText) => headerText === 'Importe') + 1
  const baseColumn =
    table.headers.findIndex((headerText) => headerText.startsWith('Importe base')) + 1
  const baseFormat = table.baseCurrency === 'PYG' ? '#,##0' : '#,##0.00'
  const amountFormat = '#,##0.00'

  sheet.columns.forEach((column, index) => {
    const position = index + 1
    const longest = Math.max(
      table.headers[index]?.length ?? 10,
      ...table.rows.slice(0, 300).map((row) => String(row[index] ?? '').length),
    )
    column.width = Math.min(48, Math.max(11, longest + 2))
    if (position === amountColumn || position === baseColumn) {
      column.numFmt = position === baseColumn ? baseFormat : amountFormat
      column.alignment = { horizontal: 'right' }
    }
  })

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: Math.max(1, table.headers.length) },
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return buffer as unknown as ArrayBuffer
}
