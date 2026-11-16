import { FirebaseError } from 'firebase/app'

export class AppError extends Error {
  readonly code: string
  readonly cause?: unknown

  constructor(message: string, code = 'app/unknown', cause?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.cause = cause
  }
}

const FIREBASE_MESSAGES: Record<string, string> = {
  'auth/popup-closed-by-user': 'Cerraste la ventana de Google antes de completar el ingreso.',
  'auth/popup-blocked':
    'El navegador bloqueó la ventana de Google. Habilitá las ventanas emergentes e intentá de nuevo.',
  'auth/cancelled-popup-request': 'Se canceló el ingreso. Intentá otra vez.',
  'auth/unauthorized-domain':
    'Este dominio no está autorizado en Firebase Authentication. Agregalo en Authentication > Settings > Authorized domains.',
  'auth/account-exists-with-different-credential':
    'Ya existe una cuenta con ese email usando otro método de ingreso.',
  'auth/network-request-failed': 'Sin conexión. Verificá tu internet e intentá de nuevo.',
  'auth/too-many-requests': 'Demasiados intentos. Esperá unos minutos.',
  'auth/operation-not-allowed':
    'El proveedor Google no está habilitado en Firebase Authentication.',
  'permission-denied': 'No tenés permisos para realizar esta acción.',
  'unavailable': 'No se pudo conectar con el servidor. Revisá tu conexión.',
  'not-found': 'El registro ya no existe.',
  'already-exists': 'El registro ya existe.',
  'failed-precondition':
    'Falta un índice de Firestore o una condición previa. Revisá la consola de Firebase.',
  'resource-exhausted': 'Se alcanzó un límite de uso. Intentá más tarde.',
  'unauthenticated': 'Tu sesión expiró. Volvé a ingresar.',
  'invalid-argument': 'Los datos enviados no son válidos.',
  'deadline-exceeded': 'La operación tardó demasiado. Intentá de nuevo.',
  'functions/not-found':
    'La Cloud Function no está desplegada. Revisá la configuración del proyecto.',
  'functions/unavailable': 'El servicio de funciones no está disponible.',
  'functions/internal': 'Error interno de la Cloud Function.',
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (error instanceof FirebaseError) {
    const message =
      FIREBASE_MESSAGES[error.code] ??
      FIREBASE_MESSAGES[error.code.replace('firestore/', '')] ??
      error.message
    return new AppError(message, error.code, error)
  }
  if (error instanceof Error) return new AppError(error.message, 'app/unknown', error)
  return new AppError('Ocurrió un error inesperado.', 'app/unknown', error)
}

export function errorMessage(error: unknown): string {
  return toAppError(error).message
}

export function logError(context: string, error: unknown): void {
  // En produccion esto podria enviarse a un servicio de observabilidad.
  console.error(`[${context}]`, error)
}
