import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool';
import { ApiError } from '../lib/errors';
import { recordAuditEvent } from '../lib/audit';
import { toIso } from '../lib/invoiceMapper';
import { assertOrgAccess, assertOrgRole, requireAuth } from '../middleware/auth';

export const organizationsRouter = Router();

const roleSchema = z.enum(['owner', 'admin', 'manager', 'editor', 'finance', 'viewer']);

const addressSchema = z
  .object({
    line1: z.string().min(1).max(160).optional(),
    line2: z.string().max(160).optional(),
    city: z.string().max(120).optional(),
    state: z.string().max(120).optional(),
    postalCode: z.string().max(30).optional(),
    country: z.string().max(2).optional(),
  })
  .strict();

const companyProfileSchema = z.object({
  name: z.string().min(1).max(160),
  legalName: z.string().max(200).optional(),
  supportEmail: z.string().email().optional(),
  supportPhone: z.string().max(40).optional(),
  website: z.string().url().optional(),
  taxId: z.string().max(120).optional(),
  defaultCurrency: z
    .string()
    .regex(/^[A-Z]{3}$/, 'Provide a 3-letter ISO currency code (e.g. USD).')
    .optional(),
  locale: z.string().max(12).optional(),
  invoicePrefix: z.string().max(16).optional(),
  invoiceNotes: z.string().max(2000).optional(),
  paymentTerms: z.string().max(2000).optional(),
  address: addressSchema.partial().optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  logoStoragePath: z.string().max(256).optional(),
});

type OrganizationRow = {
  id: string;
  name: string;
  owner_uid: string | null;
  owner_email: string | null;
  profile: Record<string, unknown>;
  profile_updated_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function mapOrganization(row: OrganizationRow) {
  const profile = row.profile ?? {};
  return {
    id: row.id,
    name: row.name,
    ownerUid: row.owner_uid,
    ownerEmail: row.owner_email,
    legalName: (profile.legalName as string | undefined) ?? null,
    supportEmail: (profile.supportEmail as string | undefined) ?? null,
    supportPhone: (profile.supportPhone as string | undefined) ?? null,
    website: (profile.website as string | undefined) ?? null,
    taxId: (profile.taxId as string | undefined) ?? null,
    defaultCurrency: (profile.defaultCurrency as string | undefined) ?? null,
    locale: (profile.locale as string | undefined) ?? null,
    invoicePrefix: (profile.invoicePrefix as string | undefined) ?? null,
    invoiceNotes: (profile.invoiceNotes as string | undefined) ?? null,
    paymentTerms: (profile.paymentTerms as string | undefined) ?? null,
    address: (profile.address as Record<string, unknown> | undefined) ?? null,
    logoUrl: (profile.logoUrl as string | undefined) ?? null,
    logoStoragePath: (profile.logoStoragePath as string | undefined) ?? null,
    createdAt: toIso(row.created_at) ?? null,
    updatedAt: toIso(row.updated_at) ?? null,
    profileUpdatedAt: toIso(row.profile_updated_at) ?? null,
  };
}

function trimToNull(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildProfileUpdate(profile?: Partial<z.infer<typeof companyProfileSchema>> | null) {
  if (!profile) {
    return {};
  }

  const address = profile.address ?? null;
  const normalizedAddress =
    address && Object.values(address).some((v) => typeof v === 'string' && v.trim().length > 0)
      ? {
          line1: trimToNull(address.line1 ?? null),
          line2: trimToNull(address.line2 ?? null),
          city: trimToNull(address.city ?? null),
          state: trimToNull(address.state ?? null),
          postalCode: trimToNull(address.postalCode ?? null),
          country: trimToNull(address.country ?? null),
        }
      : null;

  return {
    legalName: trimToNull(profile.legalName ?? null),
    supportEmail: trimToNull(profile.supportEmail ?? null),
    supportPhone: trimToNull(profile.supportPhone ?? null),
    website: trimToNull(profile.website ?? null),
    taxId: trimToNull(profile.taxId ?? null),
    defaultCurrency: profile.defaultCurrency ? profile.defaultCurrency.toUpperCase() : null,
    locale: trimToNull(profile.locale ?? null),
    invoicePrefix: trimToNull(profile.invoicePrefix ?? null),
    invoiceNotes: trimToNull(profile.invoiceNotes ?? null),
    paymentTerms: trimToNull(profile.paymentTerms ?? null),
    address: normalizedAddress,
    logoUrl: trimToNull(profile.logoUrl ?? null),
    logoStoragePath: trimToNull(profile.logoStoragePath ?? null),
  };
}

organizationsRouter.use(requireAuth);

// List organizations the caller belongs to (platform admins see all).
organizationsRouter.get('/', async (req, res, next) => {
  try {
    const auth = req.auth!;
    const result = auth.platformAdmin
      ? await query<OrganizationRow>('SELECT * FROM organizations ORDER BY created_at DESC')
      : await query<OrganizationRow>(
          `SELECT o.* FROM organizations o
           JOIN members m ON m.organization_id = o.id
           WHERE m.user_id = $1
           ORDER BY o.created_at DESC`,
          [auth.uid],
        );

    res.json(result.rows.map(mapOrganization));
  } catch (error) {
    next(error);
  }
});

// provisionTenant — create an organization and make the caller its owner.
organizationsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = z
      .object({
        organizationName: z.string().min(1),
        profile: companyProfileSchema.omit({ name: true }).partial().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'invalid_payload', 'Invalid organization payload.', parsed.error.flatten());
    }

    const auth = req.auth!;
    const { organizationName, profile } = parsed.data;
    const profileUpdate = buildProfileUpdate(profile ?? null);

    const organizationId = await withTransaction(async (client) => {
      const orgResult = await client.query<{ id: string }>(
        `INSERT INTO organizations (name, owner_uid, owner_email, profile, profile_updated_at)
         VALUES ($1, $2, $3, $4, CASE WHEN $4::text <> '{}' THEN now() ELSE NULL END)
         RETURNING id`,
        [organizationName, auth.uid, auth.email, JSON.stringify(profileUpdate)],
      );
      const orgId = orgResult.rows[0].id;

      await client.query(
        `INSERT INTO members (organization_id, user_id, email, role, invited_by)
         VALUES ($1, $2, $3, 'owner', $2)`,
        [orgId, auth.uid, auth.email],
      );

      return orgId;
    });

    await recordAuditEvent({
      actorUid: auth.uid,
      actorEmail: auth.email,
      action: 'tenant:provision',
      target: organizationId,
      metadata: { organizationName },
    });

    res.status(201).json({ organizationId });
  } catch (error) {
    next(error);
  }
});

organizationsRouter.get('/:organizationId', async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    assertOrgAccess(req.auth, organizationId);

    const result = await query<OrganizationRow>('SELECT * FROM organizations WHERE id = $1', [
      organizationId,
    ]);
    if (result.rows.length === 0) {
      throw new ApiError(404, 'not_found', 'Organization not found.');
    }

    res.json(mapOrganization(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

// updateOrganizationProfile
organizationsRouter.patch('/:organizationId/profile', async (req, res, next) => {
  try {
    const parsed = z
      .object({ profile: companyProfileSchema })
      .safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'invalid_payload', 'Invalid organization profile payload.', parsed.error.flatten());
    }

    const { organizationId } = req.params;
    assertOrgAccess(req.auth, organizationId);
    assertOrgRole(req.auth, organizationId, ['owner', 'admin']);

    const { name, ...rest } = parsed.data.profile;
    const profileUpdate = buildProfileUpdate(rest);

    const result = await query(
      `UPDATE organizations
       SET name = $2, profile = $3, profile_updated_at = now(), updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [organizationId, name, JSON.stringify(profileUpdate)],
    );
    if (result.rows.length === 0) {
      throw new ApiError(404, 'not_found', 'Organization not found.');
    }

    await recordAuditEvent({
      actorUid: req.auth!.uid,
      actorEmail: req.auth!.email,
      action: 'tenant:updateProfile',
      target: organizationId,
      metadata: { name },
    });

    res.json({ organizationId, name });
  } catch (error) {
    next(error);
  }
});

// List members of an organization.
organizationsRouter.get('/:organizationId/members', async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    assertOrgAccess(req.auth, organizationId);

    const result = await query<{
      user_id: string;
      role: string;
      email: string | null;
      updated_at: Date | string;
    }>(
      `SELECT m.user_id, m.role, COALESCE(u.email, m.email) AS email, m.updated_at
       FROM members m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1`,
      [organizationId],
    );

    res.json(
      result.rows.map((row) => ({
        uid: row.user_id,
        role: row.role,
        email: row.email,
        updatedAt: toIso(row.updated_at),
      })),
    );
  } catch (error) {
    next(error);
  }
});

// setMemberRole — assign or update a member's role (owner/admin only).
// Accepts a targetUid or a targetEmail (for invite-by-email flows).
organizationsRouter.post('/:organizationId/members/role', async (req, res, next) => {
  try {
    const parsed = z
      .object({
        targetUid: z.string().min(1).optional(),
        targetEmail: z.string().email().optional(),
        role: roleSchema,
      })
      .refine((value) => Boolean(value.targetUid || value.targetEmail), {
        message: 'Provide a target UID or email address.',
      })
      .safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'invalid_payload', 'Invalid role payload.', parsed.error.flatten());
    }

    const { organizationId } = req.params;
    const { targetEmail, role } = parsed.data;
    let targetUid = parsed.data.targetUid ?? '';
    assertOrgAccess(req.auth, organizationId);
    assertOrgRole(req.auth, organizationId, ['owner', 'admin']);

    const targetUser = targetUid
      ? await query<{ id: string; email: string | null }>(
          'SELECT id, email FROM users WHERE id = $1',
          [targetUid],
        )
      : await query<{ id: string; email: string | null }>(
          'SELECT id, email FROM users WHERE email = $1',
          [targetEmail!.trim().toLowerCase()],
        );
    if (targetUser.rows.length === 0) {
      throw new ApiError(404, 'not_found', 'No user exists with the provided identifier.');
    }
    targetUid = targetUser.rows[0].id;

    await query(
      `INSERT INTO members (organization_id, user_id, email, role, invited_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, user_id)
       DO UPDATE SET role = EXCLUDED.role, updated_at = now()`,
      [organizationId, targetUid, targetUser.rows[0]?.email ?? null, role, req.auth!.uid],
    );

    await recordAuditEvent({
      actorUid: req.auth!.uid,
      actorEmail: req.auth!.email,
      action: 'admin:setMemberRole',
      target: targetUid,
      metadata: { organizationId, role },
    });

    res.json({ organizationId, targetUid, role });
  } catch (error) {
    next(error);
  }
});

// removeMember — remove a user from an organization (owner/admin only).
organizationsRouter.delete('/:organizationId/members/:targetUid', async (req, res, next) => {
  try {
    const { organizationId, targetUid } = req.params;
    assertOrgAccess(req.auth, organizationId);
    assertOrgRole(req.auth, organizationId, ['owner', 'admin']);

    await query('DELETE FROM members WHERE organization_id = $1 AND user_id = $2', [
      organizationId,
      targetUid,
    ]);

    await recordAuditEvent({
      actorUid: req.auth!.uid,
      actorEmail: req.auth!.email,
      action: 'admin:removeMember',
      target: targetUid,
      metadata: { organizationId },
    });

    res.json({ organizationId, targetUid });
  } catch (error) {
    next(error);
  }
});
