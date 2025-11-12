import type { ChangeEvent, FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import LoadingState from '../../components/common/LoadingState'
import ErrorState from '../../components/common/ErrorState'
import { useTenant } from '../../context/AuthContext'
import { useMembers, useAssignMemberRole, useRemoveMember } from '../../hooks/useMembers'
import {
  useOrganizationList,
  useOrganizationProfile,
  useUpdateOrganizationProfile,
  useCreateOrganization,
} from '../../hooks/useOrganizationProfile'
import { uploadOrganizationLogo } from '../../services/organizations'
import type { OrganizationProfile } from '../../types/organization'

const ROLES = ['owner', 'admin', 'manager', 'editor', 'finance', 'viewer'] as const

const CURRENCY_OPTIONS = ['USD', 'NGN', 'GHS', 'KES', 'GBP', 'EUR'] as const
const LOCALE_OPTIONS = [
  { value: 'en-US', label: 'English (United States)' },
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'fr-FR', label: 'French (France)' },
  { value: 'de-DE', label: 'German (Germany)' },
] as const

type AddressFormState = {
  line1: string
  line2: string
  city: string
  state: string
  postalCode: string
  country: string
}

type ProfileFormState = {
  name: string
  legalName: string
  supportEmail: string
  supportPhone: string
  website: string
  taxId: string
  defaultCurrency: string
  locale: string
  invoicePrefix: string
  invoiceNotes: string
  paymentTerms: string
  address: AddressFormState
  logoUrl: string
  logoStoragePath: string
}

const DEFAULT_ADDRESS: AddressFormState = {
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
}

const DEFAULT_PROFILE_FORM: ProfileFormState = {
  name: '',
  legalName: '',
  supportEmail: '',
  supportPhone: '',
  website: '',
  taxId: '',
  defaultCurrency: 'USD',
  locale: 'en-US',
  invoicePrefix: '',
  invoiceNotes: '',
  paymentTerms: '',
  address: DEFAULT_ADDRESS,
  logoUrl: '',
  logoStoragePath: '',
}

function mapProfileToForm(profile?: OrganizationProfile | null): ProfileFormState {
  if (!profile) {
    return { ...DEFAULT_PROFILE_FORM, address: { ...DEFAULT_ADDRESS } }
  }

  return {
    name: profile.name ?? '',
    legalName: profile.legalName ?? '',
    supportEmail: profile.supportEmail ?? '',
    supportPhone: profile.supportPhone ?? '',
    website: profile.website ?? '',
    taxId: profile.taxId ?? '',
    defaultCurrency: profile.defaultCurrency ?? 'USD',
    locale: profile.locale ?? 'en-US',
    invoicePrefix: profile.invoicePrefix ?? '',
    invoiceNotes: profile.invoiceNotes ?? '',
    paymentTerms: profile.paymentTerms ?? '',
    address: {
      line1: profile.address?.line1 ?? '',
      line2: profile.address?.line2 ?? '',
      city: profile.address?.city ?? '',
      state: profile.address?.state ?? '',
      postalCode: profile.address?.postalCode ?? '',
      country: profile.address?.country ?? '',
    },
    logoUrl: profile.logoUrl ?? '',
    logoStoragePath: profile.logoStoragePath ?? '',
  }
}

function SettingsPage() {
  const {
    organizations,
    activeOrgId,
    setActiveOrgId,
    loading: tenantLoading,
    refreshMembership,
  } = useTenant()

  const organizationListQuery = useOrganizationList(organizations)
  const organizationOptions = useMemo(() => {
    const hydrated = organizationListQuery.data ?? []
    const fallback = organizations
      .filter((orgId) => !hydrated.some((item) => item.id === orgId))
      .map((orgId) => ({ id: orgId, name: orgId }))
    return [...hydrated, ...fallback]
  }, [organizationListQuery.data, organizations])
  const activeCompanyId = activeOrgId ?? (organizationOptions[0]?.id ?? '')

  useEffect(() => {
    if (!activeOrgId && organizationOptions.length > 0) {
      setActiveOrgId(organizationOptions[0].id)
    }
  }, [activeOrgId, organizationOptions, setActiveOrgId])

  const profileQuery = useOrganizationProfile(activeOrgId)
  const updateProfile = useUpdateOrganizationProfile(activeOrgId)
  const createOrganizationMutation = useCreateOrganization()
  const membersQuery = useMembers(activeOrgId ?? undefined)
  const assignRole = useAssignMemberRole(activeOrgId ?? undefined)
  const removeMember = useRemoveMember(activeOrgId ?? undefined)

  const [formState, setFormState] = useState<ProfileFormState>({
    ...DEFAULT_PROFILE_FORM,
    address: { ...DEFAULT_ADDRESS },
  })
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoObjectUrl, setLogoObjectUrl] = useState<string | null>(null)
  const [isLogoUploading, setIsLogoUploading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formMessage, setFormMessage] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createOrgName, setCreateOrgName] = useState('')
  const [createSupportEmail, setCreateSupportEmail] = useState('')
  const [createCurrency, setCreateCurrency] = useState('USD')
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    if (profileQuery.data) {
      const nextForm = mapProfileToForm(profileQuery.data)
      setFormState(nextForm)
      setLogoPreview(nextForm.logoUrl ? nextForm.logoUrl : null)
    }
  }, [profileQuery.data])

  useEffect(() => {
    return () => {
      if (logoObjectUrl) {
        URL.revokeObjectURL(logoObjectUrl)
      }
    }
  }, [logoObjectUrl])

  const handleFieldChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target
    setFormError(null)
    setFormMessage(null)

    if (name.startsWith('address.')) {
      const [, field] = name.split('.')
      setFormState((prev) => ({
        ...prev,
        address: {
          ...prev.address,
          [field as keyof AddressFormState]: value,
        },
      }))
      return
    }

    setFormState((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleLogoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!activeOrgId) {
      setFormError('Select a company before uploading a logo.')
      return
    }

    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      setFormError('Please upload a valid image file.')
      return
    }

    if (file.size > 3 * 1024 * 1024) {
      setFormError('Logo must be smaller than 3MB.')
      return
    }

    setIsLogoUploading(true)
    setFormError(null)
    setFormMessage(null)

    try {
      const { url, storagePath } = await uploadOrganizationLogo({
        organizationId: activeOrgId,
        file,
        existingPath: formState.logoStoragePath || undefined,
      })

      if (logoObjectUrl) {
        URL.revokeObjectURL(logoObjectUrl)
        setLogoObjectUrl(null)
      }

      const objectUrl = URL.createObjectURL(file)
      setLogoObjectUrl(objectUrl)
      setLogoPreview(url || objectUrl)
      setFormState((prev) => ({
        ...prev,
        logoUrl: url,
        logoStoragePath: storagePath,
      }))
      setFormMessage('Logo uploaded. Save changes to persist the new branding.')
    } catch (error) {
      console.error('Failed to upload organization logo', error)
      setFormError((error as Error).message ?? 'Failed to upload logo.')
    } finally {
      setIsLogoUploading(false)
    }
  }

  const handleRemoveLogo = () => {
    if (logoObjectUrl) {
      URL.revokeObjectURL(logoObjectUrl)
      setLogoObjectUrl(null)
    }
    setFormState((prev) => ({
      ...prev,
      logoUrl: '',
      logoStoragePath: '',
    }))
    setLogoPreview(null)
    setFormMessage('Logo removed. Save changes to update the profile.')
  }

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!activeOrgId) {
      setFormError('Select a company to update its profile.')
      return
    }

    const trimmedName = formState.name.trim()
    if (!trimmedName) {
      setFormError('Company name is required.')
      return
    }

    setFormError(null)
    setFormMessage(null)

    try {
      await updateProfile.mutateAsync({
        name: trimmedName,
        legalName: formState.legalName,
        supportEmail: formState.supportEmail,
        supportPhone: formState.supportPhone,
        website: formState.website,
        taxId: formState.taxId,
        defaultCurrency: formState.defaultCurrency,
        locale: formState.locale,
        invoicePrefix: formState.invoicePrefix,
        invoiceNotes: formState.invoiceNotes,
        paymentTerms: formState.paymentTerms,
        address: { ...formState.address },
        logoUrl: formState.logoUrl,
        logoStoragePath: formState.logoStoragePath,
      })

      await refreshMembership()
      setFormMessage('Company profile saved successfully.')
    } catch (error) {
      console.error('Failed to update organization profile', error)
      setFormError((error as Error).message ?? 'Failed to update profile.')
    }
  }

  const handleCreateOrganization = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = createOrgName.trim()
    if (!name) {
      setCreateError('Company name is required.')
      return
    }

    setCreateError(null)
    try {
      const { organizationId } = await createOrganizationMutation.mutateAsync({
        name,
        profile: {
          supportEmail: createSupportEmail.trim() || undefined,
          defaultCurrency: createCurrency,
        },
      })

      await refreshMembership()
      setActiveOrgId(organizationId)
      setShowCreateForm(false)
      setCreateOrgName('')
      setCreateSupportEmail('')
      setCreateCurrency('USD')
      setFormMessage('New company added. You can now customise its invoice profile.')
    } catch (error) {
      console.error('Failed to create organization', error)
      setCreateError((error as Error).message ?? 'Failed to create company.')
    }
  }

  if (tenantLoading) {
    return <LoadingState message="Loading organization settings…" />
  }

  if (!activeOrgId && organizations.length === 0) {
    return (
      <ErrorState
        title="No company found"
        description="Create your first company profile to start invoicing."
      />
    )
  }

  return (
    <div className="page settings-page">
      <header className="page__header">
        <div>
          <h1>Settings</h1>
          <p>Manage company branding, sender details, and team access for each organisation.</p>
        </div>
      </header>

      <section className="panel settings-section">
        <div className="settings-section__header">
          <h2>Company profiles</h2>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setShowCreateForm((prev) => !prev)}
          >
            {showCreateForm ? 'Cancel' : 'Add company'}
          </button>
        </div>

        <div className="settings-org-switcher">
          <label className="field">
            <span>Active company</span>
            <select
              value={activeCompanyId}
              onChange={(event) => {
                const value = event.target.value
                if (value) {
                  setActiveOrgId(value)
                }
              }}
              disabled={organizationOptions.length === 0}
            >
              {organizationOptions.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
          <p className="settings-org-switcher__hint">
            Switch between companies to update invoice branding, sender details, and payment defaults.
          </p>
        </div>

        {showCreateForm ? (
          <form className="settings-create-org" onSubmit={handleCreateOrganization}>
            <label className="field">
              <span>Company name</span>
              <input
                type="text"
                name="newCompanyName"
                value={createOrgName}
                onChange={(event) => setCreateOrgName(event.target.value)}
                placeholder="e.g. Illuminate Information Technology Solutions Ltd"
                required
              />
            </label>
            <label className="field">
              <span>Support email (optional)</span>
              <input
                type="email"
                name="newCompanySupportEmail"
                value={createSupportEmail}
                onChange={(event) => setCreateSupportEmail(event.target.value)}
                placeholder="support@company.com"
              />
            </label>
            <label className="field">
              <span>Default currency</span>
              <select
                name="newCompanyCurrency"
                value={createCurrency}
                onChange={(event) => setCreateCurrency(event.target.value)}
              >
                {CURRENCY_OPTIONS.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </label>
            {createError ? <p className="form-error">{createError}</p> : null}
            <div className="settings-create-org__actions">
              <button
                type="submit"
                className="button button--primary"
                disabled={createOrganizationMutation.isPending}
              >
                {createOrganizationMutation.isPending ? 'Creating…' : 'Create company'}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="panel settings-section">
        <div className="settings-section__header">
          <h2>Company profile</h2>
          <p>Details shown on invoices, receipts, and client communications.</p>
        </div>

        {profileQuery.isLoading ? (
          <LoadingState message="Loading company profile…" />
        ) : profileQuery.isError ? (
          <ErrorState
            title="Failed to load company profile"
            description={(profileQuery.error as Error)?.message}
            onRetry={() => profileQuery.refetch()}
          />
        ) : (
          <form className="settings-profile-form" onSubmit={handleSaveProfile}>
            <div className="settings-branding">
              <div className="settings-logo">
                <div className="settings-logo__preview">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Company logo preview" />
                  ) : (
                    <span className="settings-logo__placeholder">Logo preview</span>
                  )}
                </div>
                <div className="settings-logo__actions">
                  <label className="button button--ghost">
                    {isLogoUploading ? 'Uploading…' : 'Upload logo'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml"
                      onChange={handleLogoChange}
                      disabled={isLogoUploading}
                    />
                  </label>
                  {formState.logoUrl ? (
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={handleRemoveLogo}
                    >
                      Remove logo
                    </button>
                  ) : null}
                  <p className="settings-logo__hint">Recommended: transparent PNG, at least 600×200px.</p>
                </div>
              </div>
            </div>

            <div className="settings-grid">
              <label className="field">
                <span>Trading / display name</span>
                <input
                  name="name"
                  value={formState.name}
                  onChange={handleFieldChange}
                  placeholder="Illuminate Information Technology Solutions Ltd"
                  required
                />
              </label>
              <label className="field">
                <span>Legal name</span>
                <input
                  name="legalName"
                  value={formState.legalName}
                  onChange={handleFieldChange}
                  placeholder="Legal entity registered name"
                />
              </label>
              <label className="field">
                <span>Support email</span>
                <input
                  name="supportEmail"
                  type="email"
                  value={formState.supportEmail}
                  onChange={handleFieldChange}
                  placeholder="support@company.com"
                />
              </label>
              <label className="field">
                <span>Support phone</span>
                <input
                  name="supportPhone"
                  value={formState.supportPhone}
                  onChange={handleFieldChange}
                  placeholder="+234 801 234 5678"
                />
              </label>
              <label className="field">
                <span>Website</span>
                <input
                  name="website"
                  value={formState.website}
                  onChange={handleFieldChange}
                  placeholder="https://company.com"
                />
              </label>
              <label className="field">
                <span>Tax or registration ID</span>
                <input
                  name="taxId"
                  value={formState.taxId}
                  onChange={handleFieldChange}
                  placeholder="RC XXXXXXX"
                />
              </label>
              <label className="field">
                <span>Default currency</span>
                <select name="defaultCurrency" value={formState.defaultCurrency} onChange={handleFieldChange}>
                  {CURRENCY_OPTIONS.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Locale</span>
                <select name="locale" value={formState.locale} onChange={handleFieldChange}>
                  {LOCALE_OPTIONS.map((locale) => (
                    <option key={locale.value} value={locale.value}>
                      {locale.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <fieldset className="settings-fieldset">
              <legend>Invoice address</legend>
              <div className="settings-grid">
                <label className="field">
                  <span>Street line 1</span>
                  <input
                    name="address.line1"
                    value={formState.address.line1}
                    onChange={handleFieldChange}
                    placeholder="123 Innovation Way"
                  />
                </label>
                <label className="field">
                  <span>Street line 2</span>
                  <input
                    name="address.line2"
                    value={formState.address.line2}
                    onChange={handleFieldChange}
                    placeholder="Suite 200"
                  />
                </label>
                <label className="field">
                  <span>City</span>
                  <input
                    name="address.city"
                    value={formState.address.city}
                    onChange={handleFieldChange}
                    placeholder="Lagos"
                  />
                </label>
                <label className="field">
                  <span>State / Province</span>
                  <input
                    name="address.state"
                    value={formState.address.state}
                    onChange={handleFieldChange}
                    placeholder="Lagos"
                  />
                </label>
                <label className="field">
                  <span>Postal code</span>
                  <input
                    name="address.postalCode"
                    value={formState.address.postalCode}
                    onChange={handleFieldChange}
                    placeholder="100001"
                  />
                </label>
                <label className="field">
                  <span>Country</span>
                  <input
                    name="address.country"
                    value={formState.address.country}
                    onChange={handleFieldChange}
                    placeholder="NG"
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="settings-fieldset">
              <legend>Invoice footer</legend>
              <label className="field">
                <span>Invoice prefix</span>
                <input
                  name="invoicePrefix"
                  value={formState.invoicePrefix}
                  onChange={handleFieldChange}
                  placeholder="ILL-"
                />
              </label>
              <label className="field">
                <span>Default payment terms</span>
                <textarea
                  name="paymentTerms"
                  rows={3}
                  value={formState.paymentTerms}
                  onChange={handleFieldChange}
                  placeholder="Payment due within 14 days. Late payments attract a 5% fee."
                />
              </label>
              <label className="field">
                <span>Notes for clients</span>
                <textarea
                  name="invoiceNotes"
                  rows={3}
                  value={formState.invoiceNotes}
                  onChange={handleFieldChange}
                  placeholder="Thank you for partnering with Illuminate ITS. Kindly confirm receipt."
                />
              </label>
            </fieldset>

            {formError ? <p className="form-error">{formError}</p> : null}
            {formMessage ? <p className="form-success">{formMessage}</p> : null}

            <div className="settings-actions">
              <button
                type="submit"
                className="button button--primary"
                disabled={updateProfile.isPending || isLogoUploading}
              >
                {updateProfile.isPending ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="panel settings-section">
        <div className="settings-section__header">
          <h2>Team access</h2>
          <p>Control who can issue invoices and manage billing for the selected company.</p>
        </div>
        {membersQuery.isLoading ? (
          <LoadingState message="Loading members…" />
        ) : membersQuery.isError ? (
          <ErrorState onRetry={() => membersQuery.refetch()} />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {membersQuery.data?.map((member) => (
                <tr key={member.uid}>
                  <td>{member.email ?? member.uid}</td>
                  <td>
                    <select
                      value={member.role}
                      onChange={(event) =>
                        assignRole.mutate({
                          targetUid: member.uid,
                          role: event.target.value,
                        })
                      }
                      disabled={assignRole.isPending}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{member.updatedAt ? new Date(member.updatedAt).toLocaleString() : '—'}</td>
                  <td className="table__actions">
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() => removeMember.mutate(member.uid)}
                      disabled={removeMember.isPending}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {membersQuery.data?.length === 0 ? (
                <tr>
                  <td colSpan={4}>No members added yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export default SettingsPage
