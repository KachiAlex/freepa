import { doc, getDoc, Timestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
  type UploadResult,
} from 'firebase/storage'
import { getFirestoreInstance, getFunctionsInstance, getStorageInstance } from '../firebase/config'
import type {
  OrganizationProfile,
  OrganizationProfileInput,
  OrganizationAddress,
} from '../types/organization'

function toIso(value?: Timestamp | string | Date | null): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  if (value instanceof Date) {
    return value.toISOString()
  }
  return value.toDate().toISOString()
}

function normalizeString(value?: string | null): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeAddress(address?: Record<string, unknown> | null): OrganizationAddress | null {
  if (!address || typeof address !== 'object') {
    return null
  }
  const formatted: OrganizationAddress = {
    line1: normalizeString(address.line1 as string | undefined),
    line2: normalizeString(address.line2 as string | undefined),
    city: normalizeString(address.city as string | undefined),
    state: normalizeString(address.state as string | undefined),
    postalCode: normalizeString(address.postalCode as string | undefined),
    country: normalizeString(address.country as string | undefined),
  }

  const hasValue = Object.values(formatted).some((value) => value && value.length > 0)
  return hasValue ? formatted : null
}

function mapOrganizationDocument(
  organizationId: string,
  data: Record<string, unknown>,
): OrganizationProfile {
  const profile = (data.profile as Record<string, unknown> | undefined) ?? {}
  const address = normalizeAddress(profile.address as Record<string, unknown> | undefined)

  return {
    id: organizationId,
    name: (data.name as string | undefined) ?? 'Untitled company',
    ownerUid: (data.ownerUid as string | undefined) ?? null,
    ownerEmail: (data.ownerEmail as string | undefined) ?? null,
    legalName: normalizeString((profile.legalName as string | undefined) ?? null),
    supportEmail: normalizeString((profile.supportEmail as string | undefined) ?? null),
    supportPhone: normalizeString((profile.supportPhone as string | undefined) ?? null),
    website: normalizeString((profile.website as string | undefined) ?? null),
    taxId: normalizeString((profile.taxId as string | undefined) ?? null),
    defaultCurrency: normalizeString((profile.defaultCurrency as string | undefined) ?? null),
    locale: normalizeString((profile.locale as string | undefined) ?? null),
    invoicePrefix: normalizeString((profile.invoicePrefix as string | undefined) ?? null),
    invoiceNotes: normalizeString((profile.invoiceNotes as string | undefined) ?? null),
    paymentTerms: normalizeString((profile.paymentTerms as string | undefined) ?? null),
    address,
    logoUrl: normalizeString((profile.logoUrl as string | undefined) ?? null),
    logoStoragePath: normalizeString((profile.logoStoragePath as string | undefined) ?? null),
    createdAt: toIso((data.createdAt as Timestamp | string | undefined) ?? null),
    updatedAt: toIso((data.updatedAt as Timestamp | string | undefined) ?? null),
    profileUpdatedAt: toIso((data.profileUpdatedAt as Timestamp | string | undefined) ?? null),
  }
}

export async function getOrganizationProfile(organizationId: string): Promise<OrganizationProfile> {
  const db = getFirestoreInstance()
  const organizationRef = doc(db, 'organizations', organizationId)
  const snapshot = await getDoc(organizationRef)

  if (!snapshot.exists()) {
    throw new Error('Organization not found.')
  }

  return mapOrganizationDocument(snapshot.id, snapshot.data() as Record<string, unknown>)
}

export async function listOrganizationsByIds(
  organizationIds: string[],
): Promise<OrganizationProfile[]> {
  if (organizationIds.length === 0) {
    return []
  }

  const profiles = await Promise.all(
    organizationIds.map(async (organizationId) => {
      try {
        return await getOrganizationProfile(organizationId)
      } catch (error) {
        console.warn('Failed to fetch organization profile', { organizationId, error })
        return null
      }
    }),
  )

  return profiles.filter((profile): profile is OrganizationProfile => profile !== null)
}

export async function updateOrganizationProfileRequest(params: {
  organizationId: string
  profile: OrganizationProfileInput
}): Promise<void> {
  const functions = getFunctionsInstance()
  const callable = httpsCallable<
    { organizationId: string; profile: OrganizationProfileInput },
    { organizationId: string; name: string }
  >(functions, 'updateOrganizationProfile')

  await callable({
    organizationId: params.organizationId,
    profile: params.profile,
  })
}

export async function createOrganization(params: {
  name: string
  profile?: Partial<Omit<OrganizationProfileInput, 'name'>>
}): Promise<{ organizationId: string }> {
  const functions = getFunctionsInstance()
  const callable = httpsCallable<
    { organizationName: string; profile?: Partial<Omit<OrganizationProfileInput, 'name'>> },
    { organizationId: string }
  >(functions, 'provisionTenant')

  const result = await callable({
    organizationName: params.name,
    profile: params.profile,
  })
  return result.data
}

type UploadLogoResult = {
  url: string
  storagePath: string
  uploadResult: UploadResult
}

export async function uploadOrganizationLogo(params: {
  organizationId: string
  file: File
  existingPath?: string | null
}): Promise<UploadLogoResult> {
  const { organizationId, file, existingPath } = params
  const storage = getStorageInstance()
  const extension = file.name.includes('.') ? file.name.split('.').pop() ?? 'png' : 'png'
  const safeExtension = extension.replace(/[^a-zA-Z0-9]/g, '') || 'png'
  const storagePath = `organizations/${organizationId}/branding/logo-${Date.now()}.${safeExtension}`
  const logoRef = ref(storage, storagePath)

  const uploadResult = await uploadBytes(logoRef, file, {
    contentType: file.type || 'image/png',
  })
  const url = await getDownloadURL(logoRef)

  if (existingPath && existingPath !== storagePath) {
    try {
      await deleteObject(ref(storage, existingPath))
    } catch (error) {
      console.warn('Failed to delete previous organization logo', { existingPath, error })
    }
  }

  return { url, storagePath, uploadResult }
}

