import { apiFetch, apiJson, apiUpload } from '../api/client'
import type {
  OrganizationProfile,
  OrganizationProfileInput,
} from '../types/organization'

export async function getOrganizationProfile(organizationId: string): Promise<OrganizationProfile> {
  return apiFetch<OrganizationProfile>(`/api/organizations/${organizationId}`)
}

export async function listOrganizationsByIds(
  organizationIds: string[],
): Promise<OrganizationProfile[]> {
  if (organizationIds.length === 0) {
    return []
  }

  try {
    const profiles = await apiFetch<OrganizationProfile[]>('/api/organizations')
    const wanted = new Set(organizationIds)
    return profiles.filter((profile) => wanted.has(profile.id))
  } catch (error) {
    console.warn('Failed to fetch organization profiles', error)
    return []
  }
}

export async function updateOrganizationProfileRequest(params: {
  organizationId: string
  profile: OrganizationProfileInput
}): Promise<void> {
  await apiJson('PATCH', `/api/organizations/${params.organizationId}/profile`, {
    profile: params.profile,
  })
}

export async function createOrganization(params: {
  name: string
  profile?: Partial<Omit<OrganizationProfileInput, 'name'>>
}): Promise<{ organizationId: string }> {
  return apiJson<{ organizationId: string }>('POST', '/api/organizations', {
    organizationName: params.name,
    profile: params.profile,
  })
}

type UploadLogoResult = {
  url: string
  storagePath: string
}

export async function uploadOrganizationLogo(params: {
  organizationId: string
  file: File
  existingPath?: string | null
}): Promise<UploadLogoResult> {
  const formData = new FormData()
  formData.append('file', params.file)
  if (params.existingPath) {
    formData.append('existingPath', params.existingPath)
  }

  return apiUpload<UploadLogoResult>(
    `/api/organizations/${params.organizationId}/uploads/logo`,
    formData,
  )
}
