/**
 * Cloud Function opcional para aceptar invitaciones de forma atomica.
 *
 * Se usa solo cuando VITE_USE_CLOUD_FUNCTIONS=true. El flujo por defecto del
 * cliente escribe directamente en Firestore y las reglas validan la invitacion.
 *
 * Esta funcion existe para:
 *  - centralizar la validacion de email/vencimiento/estado en el servidor,
 *  - hacer atomica la creacion del miembro, el consumo de la invitacion y la
 *    actualizacion del perfil del usuario,
 *  - ofrecer un punto de extension para auditoria o notificaciones.
 */
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'

initializeApp()

const db = getFirestore()
const REGION = 'southamerica-east1'
const MAX_ID_LENGTH = 128
const MAX_NAME_LENGTH = 120

interface AcceptInvitationData {
  householdId?: unknown
  invitationId?: unknown
}

interface AcceptInvitationResult {
  householdId: string
  alreadyMember: boolean
}

function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH
}

function cleanName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.slice(0, MAX_NAME_LENGTH) : fallback
}

function getEmail(request: CallableRequest<AcceptInvitationData>): string {
  const token = request.auth?.token
  return typeof token?.email === 'string' ? token.email.trim().toLowerCase() : ''
}

function getTokenString(
  request: CallableRequest<AcceptInvitationData>,
  key: 'name' | 'picture',
): string | null {
  const value = request.auth?.token[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  if (value && typeof value === 'object' && 'toDate' in value) {
    const candidate = value as { toDate?: unknown }
    if (typeof candidate.toDate === 'function') {
      return (candidate.toDate as () => Date)()
    }
  }
  return null
}

export const acceptInvitation = onCall(
  { region: REGION, maxInstances: 20 },
  async (request): Promise<AcceptInvitationResult> => {
    const uid = request.auth?.uid
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Necesitás iniciar sesión para aceptar la invitación.')
    }

    const data = (request.data ?? {}) as AcceptInvitationData
    if (!isValidId(data.householdId) || !isValidId(data.invitationId)) {
      throw new HttpsError('invalid-argument', 'La invitación no es válida.')
    }

    const householdId = data.householdId
    const invitationId = data.invitationId
    const email = getEmail(request)
    const now = Timestamp.now()

    const householdRef = db.collection('households').doc(householdId)
    const invitationRef = householdRef.collection('invitations').doc(invitationId)
    const memberRef = householdRef.collection('members').doc(uid)
    const userRef = db.collection('users').doc(uid)

    return db.runTransaction(async (transaction) => {
      const householdSnapshot = await transaction.get(householdRef)
      if (!householdSnapshot.exists) {
        throw new HttpsError('not-found', 'El hogar ya no existe.')
      }

      const invitationSnapshot = await transaction.get(invitationRef)
      if (!invitationSnapshot.exists) {
        throw new HttpsError('not-found', 'La invitación no existe o ya fue eliminada.')
      }

      const memberSnapshot = await transaction.get(memberRef)
      const userSnapshot = await transaction.get(userRef)
      const invitation = invitationSnapshot.data() ?? {}
      const household = householdSnapshot.data() ?? {}

      const invitationEmail =
        typeof invitation.email === 'string' ? invitation.email.trim().toLowerCase() : ''
      if (invitationEmail && invitationEmail !== email) {
        throw new HttpsError(
          'permission-denied',
          `La invitación fue creada para ${invitationEmail}. Ingresá con esa cuenta de Google.`,
        )
      }

      const baseCurrency = household.baseCurrency === 'USD' ? 'USD' : 'PYG'
      const displayName = cleanName(
        getTokenString(request, 'name') ?? userSnapshot.get('displayName'),
        email.split('@')[0] || 'Usuario',
      )
      const photoURL = getTokenString(request, 'picture') ?? userSnapshot.get('photoURL') ?? null

      const writeUserProfile = () => {
        transaction.set(
          userRef,
          {
            uid,
            displayName,
            email,
            photoURL,
            householdIds: FieldValue.arrayUnion(householdId),
            activeHouseholdId: householdId,
            onboardingCompleted: true,
            updatedAt: now,
            ...(userSnapshot.exists
              ? {}
              : {
                  createdAt: now,
                  lastSeenAt: null,
                  defaultCurrency: baseCurrency,
                }),
          },
          { merge: true },
        )
      }

      // Idempotencia: si ya es miembro, solo se asegura el perfil y se retorna.
      if (memberSnapshot.exists) {
        writeUserProfile()
        if (invitation.status === 'pending') {
          transaction.update(invitationRef, {
            status: 'accepted',
            acceptedBy: uid,
            acceptedAt: now,
          })
        }
        return { householdId, alreadyMember: true }
      }

      if (invitation.status !== 'pending') {
        throw new HttpsError(
          'failed-precondition',
          'Esta invitación ya fue utilizada o revocada. Pedile al owner que genere una nueva.',
        )
      }

      const expiresAt = toDate(invitation.expiresAt)
      if (!expiresAt || expiresAt.getTime() <= Date.now()) {
        throw new HttpsError(
          'failed-precondition',
          'La invitación venció. Pedile al owner que genere una nueva.',
        )
      }

      if (invitation.role !== 'MEMBER') {
        throw new HttpsError('failed-precondition', 'El rol de la invitación no es válido.')
      }

      transaction.set(memberRef, {
        uid,
        role: 'MEMBER',
        displayName,
        email,
        photoURL,
        joinedAt: now,
        invitationId,
      })

      transaction.update(invitationRef, {
        status: 'accepted',
        acceptedBy: uid,
        acceptedAt: now,
      })

      writeUserProfile()

      return { householdId, alreadyMember: false }
    })
  },
)
