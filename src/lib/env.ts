export interface FirebaseEnv {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
  measurementId: string
}

interface EnvShape {
  VITE_FIREBASE_API_KEY?: string
  VITE_FIREBASE_AUTH_DOMAIN?: string
  VITE_FIREBASE_PROJECT_ID?: string
  VITE_FIREBASE_STORAGE_BUCKET?: string
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string
  VITE_FIREBASE_APP_ID?: string
  VITE_FIREBASE_MEASUREMENT_ID?: string
  VITE_FIREBASE_APP_CHECK_SITE_KEY?: string
  VITE_USE_CLOUD_FUNCTIONS?: string
  VITE_FUNCTIONS_REGION?: string
  VITE_DEFAULT_USD_RATE?: string
}

const env = import.meta.env as unknown as EnvShape

export function getFirebaseEnv(): FirebaseEnv {
  return {
    apiKey: env.VITE_FIREBASE_API_KEY ?? '',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: env.VITE_FIREBASE_APP_ID ?? '',
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID ?? '',
  }
}

export function getMissingFirebaseKeys(): string[] {
  const config = getFirebaseEnv()
  const required: Array<[string, string]> = [
    ['VITE_FIREBASE_API_KEY', config.apiKey],
    ['VITE_FIREBASE_AUTH_DOMAIN', config.authDomain],
    ['VITE_FIREBASE_PROJECT_ID', config.projectId],
    ['VITE_FIREBASE_APP_ID', config.appId],
  ]
  return required.filter(([, value]) => !value).map(([key]) => key)
}

export const appCheckSiteKey = env.VITE_FIREBASE_APP_CHECK_SITE_KEY ?? ''
export const useCloudFunctions = env.VITE_USE_CLOUD_FUNCTIONS === 'true'
export const functionsRegion = env.VITE_FUNCTIONS_REGION ?? 'southamerica-east1'
export const defaultUsdRate = Number(env.VITE_DEFAULT_USD_RATE ?? 7500) || 7500
export const appEnv = import.meta.env.MODE
