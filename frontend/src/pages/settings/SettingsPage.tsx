import type { ChangeEvent, FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import LoadingState from '../../components/common/LoadingState'
import ErrorState from '../../components/common/ErrorState'
import { PageHeading } from '../../components/ui/PageHeading'
import { Panel } from '../../components/ui/Panel'
import { Drawer } from '../../components/ui/Drawer'
import { useTenant } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useMembers, useAssignMemberRole, useRemoveMember } from '../../hooks/useMembers'
import { inviteMember } from '../../services/members'
import { useQueryClient } from '@tanstack/react-query'
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
  address: { line1: string; line2: string; city: string; state: string; postalCode: string; country: string }
  logoUrl: string
  logoStoragePath: string
}

const EMPTY: ProfileFormState = {
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
  address: { line1: '', line2: '', city: '', state: '', postalCode: '', country: '' },
  logoUrl: '',
  logoStoragePath: '',
}

function mapProfileToForm(profile?: OrganizationProfile | null): ProfileFormState {
  if (!profile) return { ...EMPTY, address: { ...EMPTY.address } }
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

function initials(email?: string | null): string {
  if (!email) return '?'
  const parts = email.split('@')[0].split(/[.\-_]+/)
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0]?.toUpperCase() ?? '')
}

function SettingsPage() {
  const {
    organizations,
    activeOrgId,
    setActiveOrgId,
    loading: tenantLoading,
    orgRoles,
    refreshMembership,
  } = useTenant()
  const { notify } = useToast()
  const queryClient = useQueryClient()

  const organizationListQuery = useOrganizationList(organizations)
  const organizationOptions = useMemo(() => {
    const hydrated = organizationListQuery.data ?? []
    const fallback = organizations
      .filter((orgId) => !hydrated.some((item) => item.id === orgId))
      .map((orgId) => ({ id: orgId, name: orgId }))
    return [...hydrated, ...fallback]
  }, [organizationListQuery.data, organizations])

  const profileQuery = useOrganizationProfile(activeOrgId)
  const updateProfile = useUpdateOrganizationProfile(activeOrgId)
  const createOrganizationMutation = useCreateOrganization()
  const membersQuery = useMembers(activeOrgId ?? undefined)
  const assignRole = useAssignMemberRole(activeOrgId ?? undefined)
  const removeMember = useRemoveMember(activeOrgId ?? undefined)

  const [formState, setFormState] = useState<ProfileFormState>({ ...EMPTY, address: { ...EMPTY.address } })
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoObjectUrl, setLogoObjectUrl] = useState<string | null>(null)
  const [isLogoUploading, setIsLogoUploading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formMessage, setFormMessage] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createOrgName, setCreateOrgName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<string>('viewer')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    if (profileQuery.data) {
      const next = mapProfileToForm(profileQuery.data)
      setFormState(next)
      setLogoPreview(next.logoUrl || null)
    }
  }, [profileQuery.data])

  useEffect(() => {
    return () => {
      if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl)
    }
  }, [logoObjectUrl])

  const handleFieldChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = event.target
    setFormError(null)
    setFormMessage(null)
    if (name.startsWith('address.')) {
      const key = name.split('.')[1] as keyof ProfileFormState['address']
      setFormState((prev) => ({ ...prev, address: { ...prev.address, [key]: value } }))
      return
    }
    setFormState((prev) => ({ ...prev, [name]: value }))
  }

  const handleLogoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!activeOrgId) return
    const file = event.target.files?.[0]
    if (!file) return
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
    try {
      const { url, storagePath } = await uploadOrganizationLogo({
        organizationId: activeOrgId,
        file,
        existingPath: formState.logoStoragePath || undefined,
      })
      if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl)
      setLogoObjectUrl(URL.createObjectURL(file))
      setLogoPreview(url)
      setFormState((prev) => ({ ...prev, logoUrl: url, logoStoragePath: storagePath }))
      setFormMessage('Logo uploaded. Save changes to persist the new branding.')
    } catch (error) {
      setFormError((error as Error).message ?? 'Failed to upload logo.')
    } finally {
      setIsLogoUploading(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!activeOrgId) {
      setFormError('Select a company to update its profile.')
      return
    }
    if (!formState.name.trim()) {
      setFormError('Company name is required.')
      return
    }
    setFormError(null)
    try {
      await updateProfile.mutateAsync({
        name: formState.name.trim(),
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
      const { organizationId } = await createOrganizationMutation.mutateAsync({ name })
      await refreshMembership()
      setActiveOrgId(organizationId)
      setShowCreateForm(false)
      setCreateOrgName('')
      setFormMessage('New company added. You can now customise its invoice profile.')
    } catch (error) {
      setCreateError((error as Error).message ?? 'Failed to create company.')
    }
  }

  const handleInvite = async () => {
    if (!activeOrgId || !inviteEmail.trim()) return
    setInviteBusy(true)
    try {
      await inviteMember({ organizationId: activeOrgId, targetEmail: inviteEmail.trim(), role: inviteRole })
      await queryClient.invalidateQueries({ queryKey: ['organization-members', activeOrgId] })
      notify(`Added ${inviteEmail} as ${inviteRole}.`)
      setInviteOpen(false)
      setInviteEmail('')
      setInviteRole('viewer')
    } catch (error) {
      notify((error as Error).message)
    } finally {
      setInviteBusy(false)
    }
  }

  if (tenantLoading) {
    return <LoadingState message="Loading organization settings…" />
  }

  if (!activeOrgId && organizations.length === 0 && !showCreateForm) {
    return (
      <div>
        <PageHeading eyebrow="Personalize your company and team" title="Workspace settings" />
        <Panel title="Create your first company">
          <div className="form-inner">
            <form onSubmit={handleCreateOrganization}>
              <div className="field">
                <label>Company name</label>
                <input
                  value={createOrgName}
                  onChange={(event) => setCreateOrgName(event.target.value)}
                  placeholder="e.g. Kreatix Studio"
                  required
                />
              </div>
              {createError ? <p className="form-error">{createError}</p> : null}
              <button type="submit" className="btn primary" disabled={createOrganizationMutation.isPending}>
                {createOrganizationMutation.isPending ? 'Creating…' : 'Create company'}
              </button>
            </form>
          </div>
        </Panel>
      </div>
    )
  }

  const activeRole = activeOrgId ? orgRoles[activeOrgId] : undefined
  const canManageTeam = ['owner', 'admin'].includes(activeRole ?? '')

  return (
    <div>
      <PageHeading
        eyebrow="Personalize your company and team"
        title="Workspace settings"
        actions={
          <button
            type="button"
            className="btn primary"
            disabled={updateProfile.isPending}
            onClick={handleSaveProfile}
          >
            {updateProfile.isPending ? 'Saving…' : 'Save changes'}
          </button>
        }
      />

      {formError ? <p className="form-error">{formError}</p> : null}
      {formMessage ? <p className="form-message">{formMessage}</p> : null}

      <div className="section-grid">
        <Panel>
          <div className="setting-panel">
            <h3>Company profiles</h3>
            <p>Switch between companies or add a new workspace.</p>
            <div className="field">
              <label>Active company</label>
              <select
                value={activeOrgId ?? ''}
                onChange={(event) => event.target.value && setActiveOrgId(event.target.value)}
              >
                {organizationOptions.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </div>
            {showCreateForm ? (
              <form onSubmit={handleCreateOrganization}>
                <div className="field">
                  <label>New company name</label>
                  <input
                    value={createOrgName}
                    onChange={(event) => setCreateOrgName(event.target.value)}
                    placeholder="e.g. Northstar Commerce"
                    required
                  />
                </div>
                {createError ? <p className="form-error">{createError}</p> : null}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="submit" className="btn primary" disabled={createOrganizationMutation.isPending}>
                    {createOrganizationMutation.isPending ? 'Creating…' : 'Create company'}
                  </button>
                  <button type="button" className="btn" onClick={() => setShowCreateForm(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button type="button" className="btn" onClick={() => setShowCreateForm(true)}>
                + Add company
              </button>
            )}
          </div>

          <div className="setting-panel">
            <h3>Company profile</h3>
            <p>These details appear on invoices and payment receipts.</p>
            {profileQuery.isLoading ? (
              <LoadingState message="Loading company profile…" />
            ) : profileQuery.isError ? (
              <ErrorState
                title="Failed to load company profile"
                description={(profileQuery.error as Error)?.message}
                onRetry={() => profileQuery.refetch()}
              />
            ) : (
              <>
                <div className="fieldgrid">
                  <div className="field">
                    <label>Business name</label>
                    <input name="name" value={formState.name} onChange={handleFieldChange} required />
                  </div>
                  <div className="field">
                    <label>Legal name</label>
                    <input name="legalName" value={formState.legalName} onChange={handleFieldChange} />
                  </div>
                  <div className="field">
                    <label>Business email</label>
                    <input name="supportEmail" type="email" value={formState.supportEmail} onChange={handleFieldChange} />
                  </div>
                  <div className="field">
                    <label>Support phone</label>
                    <input name="supportPhone" value={formState.supportPhone} onChange={handleFieldChange} />
                  </div>
                  <div className="field">
                    <label>Website</label>
                    <input name="website" value={formState.website} onChange={handleFieldChange} />
                  </div>
                  <div className="field">
                    <label>Tax identification number</label>
                    <input name="taxId" value={formState.taxId} onChange={handleFieldChange} placeholder="Enter tax ID" />
                  </div>
                  <div className="field">
                    <label>Default currency</label>
                    <select name="defaultCurrency" value={formState.defaultCurrency} onChange={handleFieldChange}>
                      {CURRENCY_OPTIONS.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Invoice prefix</label>
                    <input name="invoicePrefix" value={formState.invoicePrefix} onChange={handleFieldChange} />
                  </div>
                  <div className="field">
                    <label>Locale</label>
                    <select name="locale" value={formState.locale} onChange={handleFieldChange}>
                      {LOCALE_OPTIONS.map((locale) => (
                        <option key={locale.value} value={locale.value}>
                          {locale.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="fieldgrid">
                  <div className="field">
                    <label>Street line 1</label>
                    <input name="address.line1" value={formState.address.line1} onChange={handleFieldChange} />
                  </div>
                  <div className="field">
                    <label>Street line 2</label>
                    <input name="address.line2" value={formState.address.line2} onChange={handleFieldChange} />
                  </div>
                  <div className="field">
                    <label>City</label>
                    <input name="address.city" value={formState.address.city} onChange={handleFieldChange} />
                  </div>
                  <div className="field">
                    <label>State</label>
                    <input name="address.state" value={formState.address.state} onChange={handleFieldChange} />
                  </div>
                  <div className="field">
                    <label>Postal code</label>
                    <input name="address.postalCode" value={formState.address.postalCode} onChange={handleFieldChange} />
                  </div>
                  <div className="field">
                    <label>Country (ISO)</label>
                    <input name="address.country" value={formState.address.country} onChange={handleFieldChange} placeholder="NG" maxLength={2} />
                  </div>
                </div>
                <div className="field">
                  <label>Invoice notes</label>
                  <textarea name="invoiceNotes" value={formState.invoiceNotes} onChange={handleFieldChange} />
                </div>
                <div className="field">
                  <label>Payment terms</label>
                  <textarea name="paymentTerms" value={formState.paymentTerms} onChange={handleFieldChange} />
                </div>
              </>
            )}
          </div>

          <div className="setting-panel">
            <h3>Branding</h3>
            <p>Display your business identity on your invoices.</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div
                style={{
                  width: 110,
                  height: 68,
                  border: '1px dashed #dbe3ef',
                  borderRadius: 10,
                  display: 'grid',
                  placeItems: 'center',
                  overflow: 'hidden',
                  background: '#f7f9fc',
                }}
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="Company logo preview" style={{ maxWidth: '100%', maxHeight: '100%' }} />
                ) : (
                  <span className="mini-note">Logo preview</span>
                )}
              </div>
              <div>
                <label className="btn" style={{ cursor: 'pointer' }}>
                  {isLogoUploading ? 'Uploading…' : '↑ Upload company logo'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    onChange={handleLogoChange}
                    disabled={isLogoUploading}
                    className="sr-only"
                  />
                </label>
                {formState.logoUrl ? (
                  <button
                    type="button"
                    className="btn destructive"
                    style={{ marginLeft: 8 }}
                    onClick={() => {
                      setFormState((prev) => ({ ...prev, logoUrl: '', logoStoragePath: '' }))
                      setLogoPreview(null)
                      setFormMessage('Logo removed. Save changes to update the profile.')
                    }}
                  >
                    Remove
                  </button>
                ) : null}
                <p className="mini-note">Images only · Maximum 3 MB · PNG 600×200 recommended</p>
              </div>
            </div>
          </div>
        </Panel>

        <aside>
          <Panel>
            <div className="setting-panel">
              <h3>Team & permissions</h3>
              <p>Control who can access your workspace.</p>
              {membersQuery.isLoading ? (
                <LoadingState message="Loading members…" />
              ) : (
                (membersQuery.data ?? []).map((member) => (
                  <div className="member" key={member.uid}>
                    <span className="avatar">{initials(member.email)}</span>
                    <span className="meta">
                      <b>{member.email ?? member.uid}</b>
                      <small>{member.role} role</small>
                    </span>
                    {canManageTeam ? (
                      <>
                        <select
                          value={roleDrafts[member.uid] ?? member.role}
                          onChange={(event) =>
                            setRoleDrafts((prev) => ({ ...prev, [member.uid]: event.target.value }))
                          }
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="member-action"
                          title="Save role"
                          disabled={assignRole.isPending}
                          onClick={() =>
                            assignRole
                              .mutateAsync({ targetUid: member.uid, role: roleDrafts[member.uid] ?? member.role })
                              .then(() => notify('Role updated.'))
                              .catch((error) => notify((error as Error).message))
                          }
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          className="member-action"
                          title="Remove member"
                          disabled={removeMember.isPending}
                          onClick={() =>
                            removeMember
                              .mutateAsync(member.uid)
                              .then(() => notify('Member removed.'))
                              .catch((error) => notify((error as Error).message))
                          }
                        >
                          ✕
                        </button>
                      </>
                    ) : null}
                  </div>
                ))
              )}
              {canManageTeam ? (
                <button type="button" className="btn" style={{ marginTop: 20 }} onClick={() => setInviteOpen(true)}>
                  + Invite team member
                </button>
              ) : (
                <p className="role-info">Only owners and admins can manage team members.</p>
              )}
            </div>
            <div className="setting-panel">
              <h3>Account security</h3>
              <p>Permissions are enforced on the server for every request, not just in the UI.</p>
              <span className="pill paid">Role-based access</span>
            </div>
          </Panel>
        </aside>
      </div>

      <Drawer open={inviteOpen} onClose={() => setInviteOpen(false)}>
        <h2>Invite a teammate</h2>
        <p>Give a colleague access to this company. They must already have a FreePA account.</p>
        <div className="field">
          <label>Email address</label>
          <input
            type="email"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="name@company.com"
          />
        </div>
        <div className="field">
          <label>Organization role</label>
          <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
            {ROLES.filter((role) => role !== 'owner').map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>
        <div className="info">
          Membership takes effect immediately — the user's organizations and roles are resolved on
          each request.
        </div>
        <button
          type="button"
          className="btn primary"
          style={{ marginTop: 20 }}
          disabled={inviteBusy || !inviteEmail.trim()}
          onClick={handleInvite}
        >
          {inviteBusy ? 'Adding…' : 'Add member'}
        </button>
      </Drawer>
    </div>
  )
}

export default SettingsPage
