import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  type Auth,
} from 'firebase/auth'
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'
import { getFunctions, type Functions } from 'firebase/functions'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'
import { appCheckSiteKey, functionsRegion, getFirebaseEnv, getMissingFirebaseKeys } from './env'

let app: FirebaseApp | null = null
let dbInstance: Firestore | null = null
let authInstance: Auth | null = null
let functionsInstance: Functions | null = null
let appCheckInitialized = false

function ensureApp(): FirebaseApp {
  if (app) return app
  const missing = getMissingFirebaseKeys()
  if (missing.length > 0) {
    throw new Error(
      `Falta configurar Firebase. Variables ausentes: ${missing.join(', ')}. Revisá .env.local y reiniciá el servidor.`,
    )
  }

  const config = getFirebaseEnv()
  app = getApps().length > 0 ? getApp() : initializeApp(config)

  if (appCheckSiteKey && !appCheckInitialized) {
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      })
      appCheckInitialized = true
    } catch (error) {
      console.warn('No se pudo inicializar App Check:', error)
    }
  }

  return app
}

export function getFirebaseApp(): FirebaseApp {
  return ensureApp()
}

export function getDb(): Firestore {
  if (dbInstance) return dbInstance
  const firebaseApp = ensureApp()
  try {
    dbInstance = initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    })
  } catch {
    dbInstance = getFirestore(firebaseApp)
  }
  return dbInstance
}

export function getFirebaseAuth(): Auth {
  if (authInstance) return authInstance
  authInstance = getAuth(ensureApp())
  void setPersistence(authInstance, browserLocalPersistence).catch(() => undefined)
  return authInstance
}

export function getFirebaseFunctions(): Functions {
  if (functionsInstance) return functionsInstance
  functionsInstance = getFunctions(ensureApp(), functionsRegion)
  return functionsInstance
}

export function createGoogleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  return provider
}
