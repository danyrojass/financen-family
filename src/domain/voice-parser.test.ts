import { describe, expect, it } from 'vitest'
import { interpretVoiceCommand } from '@/domain/voice-parser'
import type { VoiceContext } from '@/domain/voice-parser'

const context: VoiceContext = {
  baseCurrency: 'PYG',
  accounts: [
    { id: 'cash', name: 'Efectivo', type: 'cash', currency: 'PYG' },
    { id: 'coop', name: 'Cooperativa Ypacaraí', type: 'bank', currency: 'PYG' },
    { id: 'ontop', name: 'Ontop', type: 'wallet', currency: 'USD' },
    { id: 'takenos', name: 'Takenos', type: 'wallet', currency: 'USD' },
  ],
  cards: [
    { id: 'card-coop', name: 'Cooperativa Visa', issuer: 'Cooperativa', currency: 'PYG' },
    { id: 'card-ita', name: 'Itaú Gold', issuer: 'Itaú', currency: 'PYG' },
  ],
  categories: [
    { id: 'cat-super', name: 'Supermercado', kind: 'expense', parentId: null },
    { id: 'cat-gym', name: 'Gimnasio', kind: 'expense', parentId: null },
    { id: 'cat-gift', name: 'Regalos', kind: 'expense', parentId: null },
    { id: 'cat-rent', name: 'Alquiler', kind: 'income', parentId: null },
    { id: 'cat-serv', name: 'Servicios', kind: 'expense', parentId: null },
    { id: 'cat-net', name: 'Internet', kind: 'expense', parentId: 'cat-serv' },
  ],
  loans: [{ id: 'loan-1', name: 'Préstamo auto', kind: 'loan' }],
}

describe('interprete de voz', () => {
  it('interpreta gasto con tarjeta', () => {
    const draft = interpretVoiceCommand(
      'Gasté 45 mil en supermercado con la tarjeta de Cooperativa',
      context,
    )
    expect(draft.type).toBe('expense')
    expect(draft.amountMinor).toBe(45_000)
    expect(draft.currency).toBe('PYG')
    expect(draft.cardId).toBe('card-coop')
    expect(draft.categoryId).toBe('cat-super')
    expect(draft.accountId).toBeNull()
    expect(draft.missing).toHaveLength(0)
  })

  it('interpreta gasto en efectivo', () => {
    const draft = interpretVoiceCommand('Hoy pagué 180 mil del gimnasio en efectivo', context)
    expect(draft.type).toBe('expense')
    expect(draft.amountMinor).toBe(180_000)
    expect(draft.accountId).toBe('cash')
    expect(draft.categoryId).toBe('cat-gym')
  })

  it('interpreta ingreso en guaranies', () => {
    const draft = interpretVoiceCommand('Recibí 2 millones de guaraníes por el alquiler', context)
    expect(draft.type).toBe('income')
    expect(draft.amountMinor).toBe(2_000_000)
    expect(draft.currency).toBe('PYG')
    expect(draft.categoryId).toBe('cat-rent')
  })

  it('interpreta transferencia entre cuentas en dolares', () => {
    const draft = interpretVoiceCommand('Transferí 500 dólares de Ontop a Takenos', context)
    expect(draft.type).toBe('transfer')
    expect(draft.amountMinor).toBe(50_000)
    expect(draft.currency).toBe('USD')
    expect(draft.accountId).toBe('ontop')
    expect(draft.toAccountId).toBe('takenos')
    expect(draft.missing).toHaveLength(0)
  })

  it('detecta datos faltantes cuando no hay medio de pago', () => {
    const draft = interpretVoiceCommand(
      'Gasté 35 mil en la encomienda del regalo de Lili',
      context,
    )
    expect(draft.type).toBe('expense')
    expect(draft.amountMinor).toBe(35_000)
    expect(draft.categoryId).toBe('cat-gift')
    expect(draft.missing).toContain('medio de pago (cuenta o tarjeta)')
    expect(draft.confidence).toBeGreaterThan(0.5)
  })

  it('detecta pago de tarjeta sin registrarlo como gasto', () => {
    const draft = interpretVoiceCommand('Pagué la tarjeta de Cooperativa 300 mil', context)
    expect(draft.type).toBe('card_payment')
    expect(draft.cardId).toBe('card-coop')
    expect(draft.amountMinor).toBe(300_000)
  })

  it('detecta pago de prestamo', () => {
    const draft = interpretVoiceCommand('Pagué 500 mil de la cuota del préstamo auto', context)
    expect(draft.type).toBe('loan_payment')
    expect(draft.loanId).toBe('loan-1')
    expect(draft.amountMinor).toBe(500_000)
  })

  it('interpreta subcategorias por palabra clave', () => {
    const draft = interpretVoiceCommand('Pagué 250 mil de internet con la tarjeta Itaú', context)
    expect(draft.categoryId).toBe('cat-net')
    expect(draft.cardId).toBe('card-ita')
  })

  it('detecta montos escritos con palabras', () => {
    const draft = interpretVoiceCommand('Gasté cuarenta y cinco mil en supermercado', context)
    expect(draft.amountMinor).toBe(45_000)
  })

  it('marca falta de importe', () => {
    const draft = interpretVoiceCommand('Gasté en supermercado con la tarjeta de Cooperativa', context)
    expect(draft.amountMinor).toBeNull()
    expect(draft.missing).toContain('importe')
  })
})
