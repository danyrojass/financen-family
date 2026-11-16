import { describe, expect, it } from 'vitest'
import { ALLOWED_EMAILS, isAllowedEmail } from './access'

describe('isAllowedEmail', () => {
  it('acepta las cuentas de la allowlist', () => {
    for (const email of ALLOWED_EMAILS) {
      expect(isAllowedEmail(email)).toBe(true)
    }
  })

  it('ignora mayusculas y espacios', () => {
    expect(isAllowedEmail('  DANyROJASSIMON@GMAIL.COM  ')).toBe(true)
    expect(isAllowedEmail('ISAUX13@GMAIL.COM')).toBe(true)
  })

  it('rechaza cuentas no autorizadas o emails vacios', () => {
    expect(isAllowedEmail('otra@gmail.com')).toBe(false)
    expect(isAllowedEmail('')).toBe(false)
    expect(isAllowedEmail(null)).toBe(false)
    expect(isAllowedEmail(undefined)).toBe(false)
  })
})
