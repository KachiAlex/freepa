import { httpsCallable } from 'firebase/functions';
import { getFunctionsInstance } from '../firebase/config';
import type { Invoice } from '../types/invoice';
import type { Payment } from '../types/payment';

export type AdminOrganization = {
  id: string;
  name?: string;
  slug?: string;
  createdAt?: string;
  updatedAt?: string;
  ownerEmail?: string;
  memberCount: number;
  invoiceCount: number;
};

export type AdminUser = {
  uid: string;
  email?: string | null;
  organizations: string[];
  roles: Record<string, string>;
  platformAdmin: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminStats = {
  totalUsers: number;
  platformAdmins: number;
  totalOrganizations: number;
  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
};

export type OrgRole = 'owner' | 'admin' | 'manager' | 'editor' | 'finance' | 'viewer';

export const ORG_ROLES: OrgRole[] = ['owner', 'admin', 'manager', 'editor', 'finance', 'viewer'];

export async function listOrganizationsAdmin(): Promise<AdminOrganization[]> {
  const callable = httpsCallable<undefined, AdminOrganization[]>(getFunctionsInstance(), 'adminListOrganizations');
  const result = await callable();
  return result.data;
}

export async function listUsersAdmin(): Promise<AdminUser[]> {
  const callable = httpsCallable<undefined, AdminUser[]>(getFunctionsInstance(), 'adminListUsers');
  const result = await callable();
  return result.data;
}

export async function listInvoicesAdmin(limitCount = 25): Promise<Invoice[]> {
  const callable = httpsCallable<{ limit: number }, Invoice[]>(getFunctionsInstance(), 'adminListInvoices');
  const result = await callable({ limit: limitCount });
  return result.data;
}

export async function listPaymentsAdmin(limitCount = 25): Promise<Payment[]> {
  const callable = httpsCallable<{ limit: number }, Payment[]>(getFunctionsInstance(), 'adminListPayments');
  const result = await callable({ limit: limitCount });
  return result.data;
}

export async function getAdminStats(): Promise<AdminStats> {
  const callable = httpsCallable<undefined, AdminStats>(getFunctionsInstance(), 'adminGetStats');
  const result = await callable();
  return result.data;
}

export async function grantPlatformAdminUser(targetEmail: string): Promise<{ uid: string; email: string | null }> {
  const functions = getFunctionsInstance();
  const callable = httpsCallable<{ targetEmail: string }, { uid: string; email: string | null }>(
    functions,
    'grantPlatformAdmin',
  );
  const result = await callable({ targetEmail });
  return result.data;
}

type RevokePlatformAdminInput = {
  targetUid?: string;
  targetEmail?: string;
};

export async function revokePlatformAdminUser(
  input: RevokePlatformAdminInput,
): Promise<{ uid: string; email: string | null }> {
  const functions = getFunctionsInstance();
  const callable = httpsCallable<RevokePlatformAdminInput, { uid: string; email: string | null }>(
    functions,
    'revokePlatformAdmin',
  );
  const result = await callable(input);
  return result.data;
}

type SetMemberRoleInput = {
  organizationId: string;
  targetUid: string;
  role: OrgRole;
};

export async function setMemberRoleAdmin(input: SetMemberRoleInput): Promise<void> {
  const functions = getFunctionsInstance();
  const callable = httpsCallable<SetMemberRoleInput, { organizationId: string; targetUid: string; role: OrgRole }>(
    functions,
    'setMemberRole',
  );
  await callable(input);
}

type RemoveMemberInput = {
  organizationId: string;
  targetUid: string;
};

export async function removeMemberAdmin(input: RemoveMemberInput): Promise<void> {
  const functions = getFunctionsInstance();
  const callable = httpsCallable<RemoveMemberInput, { organizationId: string; targetUid: string }>(
    functions,
    'removeMember',
  );
  await callable(input);
}

