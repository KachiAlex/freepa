import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { assertUserHasRole, assertUserInOrg } from '../lib/auth';
import { FieldValue, getFirestore } from '../lib/firebase';
import { recordAuditEvent } from '../lib/audit';

const db = getFirestore();

const roleSchema = z.enum(['owner', 'admin', 'manager', 'editor', 'finance', 'viewer']);

const setRoleSchema = z.object({
  organizationId: z.string().min(1),
  targetUid: z.string().min(1),
  role: roleSchema,
});

export const setMemberRole = functions.https.onCall(async (data, context) => {
  const payload = setRoleSchema.safeParse(data);
  if (!payload.success) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid role payload.', payload.error.flatten());
  }

  const { organizationId, targetUid, role } = payload.data;

  await assertUserInOrg(context, organizationId);
  assertUserHasRole(context, organizationId, ['owner', 'admin']);

  const memberRef = db.collection('organizations').doc(organizationId).collection('members').doc(targetUid);
  const userRef = db.collection('users').doc(targetUid);

  await db.runTransaction(async (transaction) => {
    transaction.set(
      memberRef,
      {
        organizationId,
        role,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    transaction.set(
      userRef,
      {
        organizations: FieldValue.arrayUnion(organizationId),
        updatedAt: FieldValue.serverTimestamp(),
        [`orgRoles.${organizationId}`]: role,
      } as Record<string, unknown>,
      { merge: true },
    );
  });

  await recordAuditEvent({
    actorUid: context.auth?.uid ?? 'system',
    actorEmail: context.auth?.token.email as string | undefined,
    action: 'admin:setMemberRole',
    target: targetUid,
    metadata: { organizationId, role },
  });

  await applyCustomClaims(targetUid);

  return { organizationId, targetUid, role };
});

const removeMemberSchema = z.object({
  organizationId: z.string().min(1),
  targetUid: z.string().min(1),
});

export const removeMember = functions.https.onCall(async (data, context) => {
  const payload = removeMemberSchema.safeParse(data);
  if (!payload.success) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid remove payload.', payload.error.flatten());
  }

  const { organizationId, targetUid } = payload.data;

  await assertUserInOrg(context, organizationId);
  assertUserHasRole(context, organizationId, ['owner', 'admin']);

  const memberRef = db.collection('organizations').doc(organizationId).collection('members').doc(targetUid);
  const userRef = db.collection('users').doc(targetUid);

  await db.runTransaction(async (transaction) => {
    transaction.delete(memberRef);
    transaction.set(
      userRef,
      {
        organizations: FieldValue.arrayRemove(organizationId),
        [`orgRoles.${organizationId}`]: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  await recordAuditEvent({
    actorUid: context.auth?.uid ?? 'system',
    actorEmail: context.auth?.token.email as string | undefined,
    action: 'admin:removeMember',
    target: targetUid,
    metadata: { organizationId },
  });

  await applyCustomClaims(targetUid);

  return { organizationId, targetUid };
});

async function applyCustomClaims(uid: string) {
  const userSnap = await db.collection('users').doc(uid).get();
  const userData = userSnap.data() ?? {};
  const organizations: string[] = Array.isArray(userData.organizations) ? userData.organizations : [];
  const orgRoles: Record<string, string> = typeof userData.orgRoles === 'object' ? userData.orgRoles : {};

  const userRecord = await admin.auth().getUser(uid);
  const existingClaims = userRecord.customClaims ?? {};

  const updatedClaims: Record<string, unknown> = {
    ...existingClaims,
    organizations,
    orgRoles,
  };

  const platformAdminFlag = existingClaims.platformAdmin === true || userData.platformAdmin === true;
  if (platformAdminFlag) {
    updatedClaims.platformAdmin = true;
  } else if ('platformAdmin' in updatedClaims) {
    delete updatedClaims.platformAdmin;
  }

  await admin.auth().setCustomUserClaims(uid, updatedClaims);

  await db
    .collection('users')
    .doc(uid)
    .set(
      {
        email: userRecord.email ?? null,
        organizations,
        orgRoles,
        platformAdmin: platformAdminFlag,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

const grantAdminSchema = z.object({
  targetEmail: z.string().email(),
});

export const grantPlatformAdmin = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }

  const payload = grantAdminSchema.safeParse(data);
  if (!payload.success) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid email provided.', payload.error.flatten());
  }

  const requestorClaims = context.auth.token as Record<string, unknown>;
  if (requestorClaims.platformAdmin !== true) {
    throw new functions.https.HttpsError('permission-denied', 'Only existing platform admins can grant admin access.');
  }

  const { targetEmail } = payload.data;
  const userRecord = await admin.auth().getUserByEmail(targetEmail).catch((error) => {
    console.error('Failed to find user by email', targetEmail, error);
    throw new functions.https.HttpsError('not-found', 'No user exists with this email.');
  });

  const existingClaims = userRecord.customClaims ?? {};
  await admin.auth().setCustomUserClaims(userRecord.uid, {
    ...existingClaims,
    platformAdmin: true,
  });

  await db
    .collection('users')
    .doc(userRecord.uid)
    .set(
      {
        email: targetEmail,
        platformAdmin: true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  await recordAuditEvent({
    actorUid: context.auth.uid ?? 'unknown',
    actorEmail: context.auth.token.email as string | undefined,
    action: 'admin:grantPlatformAdmin',
    target: userRecord.uid,
    metadata: { targetEmail },
  });

  return { uid: userRecord.uid, email: targetEmail };
});

const revokeAdminSchema = z
  .object({
    targetUid: z.string().min(1).optional(),
    targetEmail: z.string().email().optional(),
  })
  .refine((value) => Boolean(value.targetUid || value.targetEmail), {
    message: 'Provide a target UID or email address.',
  });

export const revokePlatformAdmin = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }

  const payload = revokeAdminSchema.safeParse(data);
  if (!payload.success) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid revoke payload.', payload.error.flatten());
  }

  const requestorClaims = context.auth.token as Record<string, unknown>;
  if (requestorClaims.platformAdmin !== true) {
    throw new functions.https.HttpsError('permission-denied', 'Only platform admins can revoke admin access.');
  }

  const { targetUid, targetEmail } = payload.data;

  let userRecord: admin.auth.UserRecord;
  try {
    if (targetUid) {
      userRecord = await admin.auth().getUser(targetUid);
    } else if (targetEmail) {
      userRecord = await admin.auth().getUserByEmail(targetEmail);
    } else {
      throw new functions.https.HttpsError('invalid-argument', 'Target user not specified.');
    }
  } catch (error) {
    console.error('Failed to resolve user for revokePlatformAdmin', { targetUid, targetEmail }, error);
    throw new functions.https.HttpsError('not-found', 'No user found for the provided identifier.');
  }

  const userSnap = await db.collection('users').doc(userRecord.uid).get();
  const userData = userSnap.data() ?? {};
  const organizations: string[] = Array.isArray(userData.organizations) ? userData.organizations : [];
  const orgRoles: Record<string, string> = typeof userData.orgRoles === 'object' ? userData.orgRoles : {};

  const existingClaims = userRecord.customClaims ?? {};
  const { platformAdmin: _removed, ...remainingClaims } = existingClaims;

  await admin.auth().setCustomUserClaims(userRecord.uid, {
    ...remainingClaims,
    organizations,
    orgRoles,
  });

  await db
    .collection('users')
    .doc(userRecord.uid)
    .set(
      {
        email: userRecord.email ?? null,
        platformAdmin: false,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  await recordAuditEvent({
    actorUid: context.auth.uid ?? 'unknown',
    actorEmail: context.auth.token.email as string | undefined,
    action: 'admin:revokePlatformAdmin',
    target: userRecord.uid,
    metadata: {
      targetUid: userRecord.uid,
      targetEmail: userRecord.email ?? targetEmail ?? null,
    },
  });

  return { uid: userRecord.uid, email: userRecord.email ?? null };
});

const provisionTenantSchema = z.object({
  organizationName: z.string().min(1),
});

export const provisionTenant = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }

  const payload = provisionTenantSchema.safeParse(data);
  if (!payload.success) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid organization payload.', payload.error.flatten());
  }

  const { organizationName } = payload.data;
  const uid = context.auth.uid;
  const email = (context.auth.token.email as string | undefined) ?? null;

  const userDocRef = db.collection('users').doc(uid);
  const userSnapshot = await userDocRef.get();
  const userData = userSnapshot.data() ?? {};
  if (Array.isArray(userData.organizations) && userData.organizations.length > 0) {
    throw new functions.https.HttpsError('failed-precondition', 'User already belongs to an organization.');
  }

  const organizationRef = db.collection('organizations').doc();
  const organizationId = organizationRef.id;
  const memberRef = organizationRef.collection('members').doc(uid);

  await db.runTransaction(async (transaction) => {
    transaction.set(
      organizationRef,
      {
        name: organizationName,
        ownerUid: uid,
        ownerEmail: email,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    transaction.set(
      memberRef,
      {
        email,
        role: 'owner',
        invitedBy: uid,
        joinedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    transaction.set(
      userDocRef,
      {
        email,
        organizations: FieldValue.arrayUnion(organizationId),
        orgRoles: { [organizationId]: 'owner' },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  await applyCustomClaims(uid);

  await recordAuditEvent({
    actorUid: uid,
    actorEmail: email ?? undefined,
    action: 'tenant:provision',
    target: organizationId,
    metadata: { organizationName },
  });

  return { organizationId };
});

