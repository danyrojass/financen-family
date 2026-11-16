import {
  collection,
  onSnapshot,
  query,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore'
import { getDb } from '@/lib/firebase'
import { logError } from '@/lib/errors'

export type Mapper<T> = (id: string, data: DocumentData) => T

/**
 * Suscripcion generica a una coleccion (o subcoleccion) del hogar.
 * Devuelve la funcion de unsubscribe de Firestore.
 */
export function subscribeDocs<T>(
  path: string,
  mapper: Mapper<T>,
  onData: (items: T[]) => void,
  onError: (error: unknown) => void,
  constraints: QueryConstraint[] = [],
): () => void {
  const target = query(collection(getDb(), path), ...constraints)
  return onSnapshot(
    target,
    (snapshot) => onData(snapshot.docs.map((item) => mapper(item.id, item.data()))),
    (error) => {
      logError(`subscribeDocs:${path}`, error)
      onError(error)
    },
  )
}
