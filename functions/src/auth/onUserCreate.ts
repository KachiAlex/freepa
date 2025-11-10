import * as functions from 'firebase-functions';
import { FieldValue, getFirestore } from '../lib/firebase';

const db = getFirestore();

export const onAuthUserCreate = functions.auth.user().onCreate(async (user) => {
  const userRef = db.collection('users').doc(user.uid);
  await userRef.set(
    {
      email: user.email ?? null,
      organizations: [],
      orgRoles: {},
      platformAdmin: user.customClaims?.platformAdmin === true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
});

