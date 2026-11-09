import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { ApiError } from '../lib/errors';
import { toIso } from '../lib/invoiceMapper';
import { recordAuditEvent } from '../lib/audit';
import { assertOrgAccess, assertOrgRole, requireAuth } from '../middleware/auth';

export const clientsRouter = Router({ mergeParams: true });

clientsRouter.use(requireAuth);

clientsRouter.get('/', async (req, res, next) => {
  try {
    const { organizationId } = req.params as { organizationId: string };
    assertOrgAccess(req.auth, organizationId);

    const result = await query<{
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      outstanding_balance: number;
      last_invoice_date: string | null;
      tags: string[] | null;
      created_at: Date | string;
      updated_at: Date | string;
    }>('SELECT * FROM clients WHERE organization_id = $1 ORDER BY name ASC', [organizationId]);

    res.json(
      result.rows.map((row) => ({
        id: row.id,
        organizationId,
        name: row.name,
        email: row.email,
        phone: row.phone ?? undefined,
        outstandingBalance: row.outstanding_balance ?? 0,
        lastInvoiceDate: row.last_invoice_date ?? undefined,
        tags: row.tags ?? [],
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
      })),
    );
  } catch (error) {
    next(error);
  }
});

const createClientSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(40).optional(),
});

clientsRouter.post('/', async (req, res, next) => {
  try {
    const { organizationId } = req.params as { organizationId: string };
    const parsed = createClientSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'invalid_payload', 'Invalid client payload.', parsed.error.flatten());
    }

    assertOrgAccess(req.auth, organizationId);
    assertOrgRole(req.auth, organizationId, ['owner', 'admin', 'manager', 'editor']);

    const result = await query<{
      id: string;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `INSERT INTO clients (organization_id, name, email, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at, updated_at`,
      [organizationId, parsed.data.name.trim(), parsed.data.email?.trim() || null, parsed.data.phone?.trim() || null],
    );

    await recordAuditEvent({
      actorUid: req.auth!.uid,
      actorEmail: req.auth!.email,
      action: 'client:create',
      target: `${organizationId}/${result.rows[0].id}`,
      metadata: { name: parsed.data.name },
    });

    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      organizationId,
      name: parsed.data.name.trim(),
      email: parsed.data.email?.trim() ?? '',
      phone: parsed.data.phone?.trim() || undefined,
      outstandingBalance: 0,
      tags: [],
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    });
  } catch (error) {
    next(error);
  }
});
