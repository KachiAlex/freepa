import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { assertUserHasRole, assertUserInOrg } from '../lib/auth';
import { FieldValue, getFirestore } from '../lib/firebase';
import { recordAuditEvent } from '../lib/audit';

const db = getFirestore();

const roleSchema = z.enum(['owner', 'admin', 'manager', 'editor', 'finance', 'viewer']);

const addressSchema = z
  .object({
    line1: z.string().min(1).max(160).optional(),
    line2: z.string().max(160).optional(),
    city: z.string().max(120).optional(),
    state: z.string().max(120).optional(),
    postalCode: z.string().max(30).optional(),
    country: z.string().max(2).optional(),
  })
  .strict();

const companyProfileSchema = z.object({
  name: z.string().min(1).max(160),
  legalName: z.string().max(200).optional(),
  supportEmail: z.string().email().optional(),
  supportPhone: z.string().max(40).optional(),
  website: z.string().url().optional(),
  taxId: z.string().max(120).optional(),
  defaultCurrency: z
    .string()
    .regex(/^[A-Z]{3}$/, 'Provide a 3-letter ISO currency code (e.g. USD).')
    .optional(),
  locale: z.string().max(12).optional(),
  invoicePrefix: z.string().max(16).optional(),
  invoiceNotes: z.string().max(2000).optional(),
  paymentTerms: z.string().max(2000).optional(),
  address: addressSchema.partial().optional(),
  logoUrl: z.string().url().optional(),
  logoStoragePath: z.string().max(256).optional(),
});

type CompanyProfileInput = z.infer<typeof companyProfileSchema>;
type CompanyProfileUpdate = Omit<CompanyProfileInput, 'name'>;

function trimToNull(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeAddress(address?: Partial<z.infer<typeof addressSchema>> | null) {
  if (!address) {
    return null;
  }
  const normalized = {
    line1: trimToNull(address.line1 ?? null),
    line2: trimToNull(address.line2 ?? null),
    city: trimToNull(address.city ?? null),
    state: trimToNull(address.state ?? null),
    postalCode: trimToNull(address.postalCode ?? null),
    country: trimToNull(address.country ?? null),
  };

  const hasValue = Object.values(normalized).some((value) => value && value.length > 0);
  return hasValue ? normalized : null;
}

function buildProfileUpdate(profile?: Partial<CompanyProfileUpdate> | null) {
  if (!profile) {
    return {};
  }

  const defaultCurrency = profile.defaultCurrency ? profile.defaultCurrency.toUpperCase() : null;
  const locale = trimToNull(profile.locale ?? null);

  return {
    legalName: trimToNull(profile.legalName ?? null),
    supportEmail: trimToNull(profile.supportEmail ?? null),
    supportPhone: trimToNull(profile.supportPhone ?? null),
    website: trimToNull(profile.website ?? null),
    taxId: trimToNull(profile.taxId ?? null),
    defaultCurrency,
    locale,
    invoicePrefix: trimToNull(profile.invoicePrefix ?? null),
    invoiceNotes: trimToNull(profile.invoiceNotes ?? null),
    paymentTerms: trimToNull(profile.paymentTerms ?? null),
    address: normalizeAddress(profile.address ?? null),
    logoUrl: trimToNull(profile.logoUrl ?? null),
    logoStoragePath: trimToNull(profile.logoStoragePath ?? null),
  };
}

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
  profile: companyProfileSchema.omit({ name: true }).partial().optional(),
});

const updateOrganizationProfileSchema = z.object({
  organizationId: z.string().min(1),
  profile: companyProfileSchema,
});

export const provisionTenant = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }

  const payload = provisionTenantSchema.safeParse(data);
  if (!payload.success) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid organization payload.', payload.error.flatten());
  }

  const { organizationName, profile: profilePayload } = payload.data;
  const uid = context.auth.uid;
  const email = (context.auth.token.email as string | undefined) ?? null;

  const organizationRef = db.collection('organizations').doc();
  const organizationId = organizationRef.id;
  const memberRef = organizationRef.collection('members').doc(uid);
  const userDocRef = db.collection('users').doc(uid);
  const profileUpdate = buildProfileUpdate(profilePayload ?? null);
  const organizationData: Record<string, unknown> = {
    name: organizationName,
    ownerUid: uid,
    ownerEmail: email,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (Object.keys(profileUpdate).length > 0) {
    organizationData.profile = profileUpdate;
    organizationData.profileUpdatedAt = FieldValue.serverTimestamp();
  }

  await db.runTransaction(async (transaction) => {
    transaction.set(
      organizationRef,
      organizationData,
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

export const updateOrganizationProfile = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }

  const payload = updateOrganizationProfileSchema.safeParse(data);
  if (!payload.success) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid organization profile payload.',
      payload.error.flatten(),
    );
  }

  const { organizationId, profile } = payload.data;

  await assertUserInOrg(context, organizationId);
  assertUserHasRole(context, organizationId, ['owner', 'admin']);

  const { name, ...rest } = profile;
  const profileUpdate = buildProfileUpdate(rest);
  const organizationRef = db.collection('organizations').doc(organizationId);

  const updateData: Record<string, unknown> = {
    name,
    updatedAt: FieldValue.serverTimestamp(),
    profileUpdatedAt: FieldValue.serverTimestamp(),
  };

  if (Object.keys(profileUpdate).length > 0) {
    updateData.profile = profileUpdate;
  }

  await organizationRef.set(updateData, { merge: true });

  await recordAuditEvent({
    actorUid: context.auth.uid ?? 'system',
    actorEmail: context.auth.token.email as string | undefined,
    action: 'tenant:updateProfile',
    target: organizationId,
    metadata: {
      name,
    },
  });

  return { organizationId, name };
});

