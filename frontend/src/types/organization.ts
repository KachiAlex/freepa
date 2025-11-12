export type OrganizationAddress = {
  line1?: string | null
  line2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
}

export type OrganizationProfile = {
  id: string
  name: string
  ownerUid?: string | null
  ownerEmail?: string | null
  legalName?: string | null
  supportEmail?: string | null
  supportPhone?: string | null
  website?: string | null
  taxId?: string | null
  defaultCurrency?: string | null
  locale?: string | null
  invoicePrefix?: string | null
  invoiceNotes?: string | null
  paymentTerms?: string | null
  address?: OrganizationAddress | null
  logoUrl?: string | null
  logoStoragePath?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  profileUpdatedAt?: string | null
}

export type OrganizationProfileInput = {
  name: string
  legalName?: string
  supportEmail?: string
  supportPhone?: string
  website?: string
  taxId?: string
  defaultCurrency?: string
  locale?: string
  invoicePrefix?: string
  invoiceNotes?: string
  paymentTerms?: string
  address?: OrganizationAddress | null
  logoUrl?: string
  logoStoragePath?: string
}

