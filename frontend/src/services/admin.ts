import { apiFetch, apiJson } from '../api/client';
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
  return apiFetch<AdminOrganization[]>('/api/admin/organizations');
}

export async function listUsersAdmin(): Promise<AdminUser[]> {
  return apiFetch<AdminUser[]>('/api/admin/users');
}

export async function listInvoicesAdmin(limitCount = 25): Promise<Invoice[]> {
  return apiFetch<Invoice[]>(`/api/admin/invoices?limit=${limitCount}`);
}

export async function listPaymentsAdmin(limitCount = 25): Promise<Payment[]> {
  return apiFetch<Payment[]>(`/api/admin/payments?limit=${limitCount}`);
}

export async function getAdminStats(): Promise<AdminStats> {
  return apiFetch<AdminStats>('/api/admin/stats');
}

export async function grantPlatformAdminUser(targetEmail: string): Promise<{ uid: string; email: string | null }> {
  return apiJson<{ uid: string; email: string | null }>('POST', '/api/admin/grant', { targetEmail });
}

type RevokePlatformAdminInput = {
  targetUid?: string;
  targetEmail?: string;
};

export async function revokePlatformAdminUser(
  input: RevokePlatformAdminInput,
): Promise<{ uid: string; email: string | null }> {
  return apiJson<{ uid: string; email: string | null }>('POST', '/api/admin/revoke', input);
}

type SetMemberRoleInput = {
  organizationId: string;
  targetUid: string;
  role: OrgRole;
};

export async function setMemberRoleAdmin(input: SetMemberRoleInput): Promise<void> {
  await apiJson('POST', `/api/organizations/${input.organizationId}/members/role`, {
    targetUid: input.targetUid,
    role: input.role,
  });
}

type RemoveMemberInput = {
  organizationId: string;
  targetUid: string;
};

export async function removeMemberAdmin(input: RemoveMemberInput): Promise<void> {
  await apiJson('DELETE', `/api/organizations/${input.organizationId}/members/${input.targetUid}`);
}
