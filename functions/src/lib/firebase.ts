import * as admin from 'firebase-admin';

let app: admin.app.App | null = null;

export function getFirebaseApp(): admin.app.App {
  if (!app) {
    app = admin.initializeApp();
  }
  return app;
}

export function getFirestore() {
  return getFirebaseApp().firestore();
}

export const FieldValue = admin.firestore.FieldValue;

