import { describe, expect, it } from 'vitest'
import {
  convertMinor,
  formatMoney,
  isSafeAmount,
  parseAmountToMinor,
  toMinor,
} from '@/domain/money'

describe('formatMoney', () => {
  it('formatea guaranies sin decimales con separador de miles', () => {
    expect(formatMoney(1_500_000, 'PYG')).toBe('G. 1.500.000')
    expect(formatMoney(0, 'PYG')).toBe('G. 0')
    expect(formatMoney(45_000, 'PYG')).toBe('G. 45.000')
  })

  it('formatea dolares con dos decimales y coma decimal', () => {
    expect(formatMoney(25_000, 'USD')).toBe('USD 250,00')
    expect(formatMoney(123_456, 'USD')).toBe('USD 1.234,56')
    expect(formatMoney(5, 'USD')).toBe('USD 0,05')
  })

  it('maneja negativos', () => {
    expect(formatMoney(-1_500_000, 'PYG')).toBe('-G. 1.500.000')
    expect(formatMoney(-25_000, 'USD')).toBe('-USD 250,00')
  })

  it('formato compacto para graficos', () => {
    expect(formatMoney(1_500_000, 'PYG', { compact: true })).toBe('G. 1,5 M')
  })
})

describe('parseAmountToMinor', () => {
  it('interpreta importes en guaranies', () => {
    expect(parseAmountToMinor('1.500.000', 'PYG')).toBe(1_500_000)
    expect(parseAmountToMinor('G. 45.000', 'PYG')).toBe(45_000)
    expect(parseAmountToMinor('45000', 'PYG')).toBe(45_000)
    expect(parseAmountToMinor('45 000', 'PYG')).toBe(45_000)
  })

  it('interpreta importes en dolares', () => {
    expect(parseAmountToMinor('250,50', 'USD')).toBe(25_050)
    expect(parseAmountToMinor('USD 250,00', 'USD')).toBe(25_000)
    expect(parseAmountToMinor('1.234,56', 'USD')).toBe(123_456)
    expect(parseAmountToMinor('1,234.56', 'USD')).toBe(123_456)
    expect(parseAmountToMinor('250', 'USD')).toBe(25_000)
    expect(parseAmountToMinor('0,05', 'USD')).toBe(5)
  })

  it('rechaza basura', () => {
    expect(parseAmountToMinor('', 'PYG')).toBeNull()
    expect(parseAmountToMinor('abc', 'PYG')).toBeNull()
    expect(parseAmountToMinor('--', 'PYG')).toBeNull()
  })
})

describe('convertMinor', () => {
  const rates = { USD: 7500 }

  it('convierte USD a PYG con enteros exactos', () => {
    expect(convertMinor(100_000, 'USD', 'PYG', rates, 'PYG')).toBe(7_500_000)
    expect(convertMinor(1, 'USD', 'PYG', rates, 'PYG')).toBe(75)
  })

  it('convierte PYG a USD', () => {
    expect(convertMinor(7_500_000, 'PYG', 'USD', rates, 'PYG')).toBe(100_000)
    expect(convertMinor(7_350_000, 'PYG', 'USD', { USD: 7350 }, 'PYG')).toBe(100_000)
  })

  it('devuelve el mismo importe para la misma moneda', () => {
    expect(convertMinor(1234, 'PYG', 'PYG', rates, 'PYG')).toBe(1234)
  })

  it('devuelve null si falta la cotizacion', () => {
    expect(convertMinor(1000, 'USD', 'PYG', {}, 'PYG')).toBeNull()
  })

  it('no pierde precision en montos grandes', () => {
    const usd = 99_999_999 // USD 999.999,99
    const pyg = convertMinor(usd, 'USD', 'PYG', { USD: 7500 }, 'PYG')
    expect(pyg).toBe(7_499_999_925)
  })
})

describe('helpers de dinero', () => {
  it('toMinor respeta los decimales de cada moneda', () => {
    expect(toMinor(1500, 'PYG')).toBe(1500)
    expect(toMinor(250, 'USD')).toBe(25_000)
  })

  it('valida enteros seguros', () => {
    expect(isSafeAmount(150_000)).toBe(true)
    expect(isSafeAmount(1.5)).toBe(false)
    expect(isSafeAmount(Number.MAX_SAFE_INTEGER)).toBe(false)
  })
})
