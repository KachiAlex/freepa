import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createOrganization,
  getOrganizationProfile,
  listOrganizationsByIds,
  updateOrganizationProfileRequest,
} from '../services/organizations'
import type { OrganizationProfileInput } from '../types/organization'

const ORGANIZATION_PROFILE_KEY = ['organization-profile']
const ORGANIZATION_LIST_KEY = ['organization-list']

export function useOrganizationProfile(organizationId?: string | null) {
  return useQuery({
    queryKey: [...ORGANIZATION_PROFILE_KEY, organizationId ?? ''],
    queryFn: () => getOrganizationProfile(organizationId as string),
    enabled: Boolean(organizationId),
  })
}

export function useOrganizationList(organizationIds: string[]) {
  return useQuery({
    queryKey: [...ORGANIZATION_LIST_KEY, ...organizationIds],
    queryFn: () => listOrganizationsByIds(organizationIds),
    enabled: organizationIds.length > 0,
  })
}

export function useUpdateOrganizationProfile(organizationId?: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (profile: OrganizationProfileInput) => {
      if (!organizationId) {
        throw new Error('Missing organization context.')
      }
      return updateOrganizationProfileRequest({ organizationId, profile })
    },
    onSuccess: async (_data, _variables, context) => {
      const targetId = organizationId ?? (context as string | undefined)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...ORGANIZATION_PROFILE_KEY, targetId ?? ''] }),
        queryClient.invalidateQueries({ queryKey: ORGANIZATION_LIST_KEY }),
      ])
    },
  })
}

export function useCreateOrganization() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createOrganization,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ORGANIZATION_LIST_KEY })
    },
  })
}

