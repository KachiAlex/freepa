import * as functions from 'firebase-functions';

function isPlatformAdmin(context: functions.https.CallableContext): boolean {
  return context.auth?.token.platformAdmin === true;
}

export async function assertUserInOrg(context: functions.https.CallableContext, organizationId: string) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }

  if (isPlatformAdmin(context)) {
    return;
  }

  const orgMemberships = context.auth.token.organizations as string[] | undefined;
  if (!orgMemberships || !orgMemberships.includes(organizationId)) {
    throw new functions.https.HttpsError('permission-denied', 'Missing organization access.');
  }
}

export function assertUserHasRole(
  context: functions.https.CallableContext,
  organizationId: string,
  allowedRoles: string[],
) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }

  if (isPlatformAdmin(context)) {
    return;
  }

  const roles = (context.auth.token.orgRoles as Record<string, string> | undefined) ?? {};
  const role = roles[organizationId];

  if (!role || !allowedRoles.includes(role)) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient role for operation.');
  }
}

export function getUserRole(context: functions.https.CallableContext, organizationId: string): string | null {
  if (!context.auth) {
    return null;
  }
  const roles = context.auth.token.orgRoles as Record<string, string> | undefined;
  return roles?.[organizationId] ?? null;
}

