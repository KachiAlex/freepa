import { apiFetch, apiJson } from '../api/client';
import type { OrganizationMember } from '../types/membership';

export async function listMembers(organizationId: string): Promise<OrganizationMember[]> {
  const members = await apiFetch<OrganizationMember[]>(
    `/api/organizations/${organizationId}/members`,
  );
  return members.sort((a, b) => a.role.localeCompare(b.role));
}

export async function assignMemberRole(params: {
  organizationId: string;
  targetUid: string;
  role: string;
}): Promise<void> {
  await apiJson('POST', `/api/organizations/${params.organizationId}/members/role`, {
    targetUid: params.targetUid,
    role: params.role,
  });
}

export async function removeMember(params: {
  organizationId: string;
  targetUid: string;
}): Promise<void> {
  await apiJson('DELETE', `/api/organizations/${params.organizationId}/members/${params.targetUid}`);
}

export async function inviteMember(params: {
  organizationId: string;
  targetEmail: string;
  role: string;
}): Promise<void> {
  await apiJson('POST', `/api/organizations/${params.organizationId}/members/role`, {
    targetEmail: params.targetEmail,
    role: params.role,
  });
}
