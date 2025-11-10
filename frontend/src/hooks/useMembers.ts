import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { assignMemberRole, listMembers, removeMember } from '../services/members';

const MEMBERS_KEY = ['organization-members'];

export function useMembers(organizationId?: string) {
  return useQuery({
    queryKey: [...MEMBERS_KEY, organizationId],
    queryFn: () => listMembers(organizationId!),
    enabled: Boolean(organizationId),
  });
}

export function useAssignMemberRole(organizationId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { targetUid: string; role: string }) => {
      if (!organizationId) {
        throw new Error('Missing organization context for role assignment.');
      }
      return assignMemberRole({
        organizationId,
        targetUid: variables.targetUid,
        role: variables.role,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...MEMBERS_KEY, organizationId] });
    },
  });
}

export function useRemoveMember(organizationId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (targetUid: string) => {
      if (!organizationId) {
        throw new Error('Missing organization context for member removal.');
      }
      return removeMember({ organizationId, targetUid });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...MEMBERS_KEY, organizationId] });
    },
  });
}

