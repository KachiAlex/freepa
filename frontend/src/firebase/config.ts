import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions'
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
}

let firebaseApp: FirebaseApp | null = null
let firestoreInstance: Firestore | null = null
let functionsInstance: Functions | null = null
let authInstance: Auth | null = null
let storageInstance: FirebaseStorage | null = null

export function initFirebase(): FirebaseApp {
  if (firebaseApp) {
    return firebaseApp
  }

  if (!getApps().length) {
    firebaseApp = initializeApp(firebaseConfig)
  } else {
    firebaseApp = getApp()
  }

  configureEmulators(firebaseApp)
  return firebaseApp
}

function configureEmulators(app: FirebaseApp) {
  if (!isUsingEmulators()) {
    return
  }

  const auth = getAuth(app)
  const firestore = getFirestore(app)
  const storage = getStorage(app)
  const functions = getFunctions(app)

  if (!auth.emulatorConfig) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  }

  connectFirestoreEmulator(firestore, '127.0.0.1', 8080)
  connectStorageEmulator(storage, '127.0.0.1', 9199)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
}

export function isUsingEmulators(): boolean {
  return import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'
}

export function getAuthInstance(): Auth {
  if (!authInstance) {
    const app = initFirebase()
    authInstance = getAuth(app)
  }
  return authInstance
}

export function getFirestoreInstance(): Firestore {
  if (!firestoreInstance) {
    const app = initFirebase()
    firestoreInstance = getFirestore(app)
  }
  return firestoreInstance
}

export function getFunctionsInstance(): Functions {
  if (!functionsInstance) {
    const app = initFirebase()
    functionsInstance = getFunctions(app)
  }
  return functionsInstance
}

export function getStorageInstance(): FirebaseStorage {
  if (!storageInstance) {
    const app = initFirebase()
    storageInstance = getStorage(app)
  }
  return storageInstance
}

export type { FirebaseApp }

