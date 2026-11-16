// Cuentas habilitadas para usar la app.
// Debe mantenerse sincronizado con la allowlist de firestore.rules.
export const ALLOWED_EMAILS = ['isaux13@gmail.com', 'danyrojassimon@gmail.com'] as const

const ALLOWED_EMAIL_SET = new Set<string>(ALLOWED_EMAILS)

/** true si el email esta en la allowlist (sin distinguir mayusculas). */
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return ALLOWED_EMAIL_SET.has(email.trim().toLowerCase())
}
