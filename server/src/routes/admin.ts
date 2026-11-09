import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { ApiError } from '../lib/errors';
import { recordAuditEvent } from '../lib/audit';
import { mapInvoiceRow, toIso, type InvoiceRow } from '../lib/invoiceMapper';
import { requireAuth, requirePlatformAdmin } from '../middleware/auth';

export const adminRouter = Router();

adminRouter.use(requireAuth, requirePlatformAdmin);

adminRouter.get('/stats', async (_req, res, next) => {
  try {
    const [users, admins, organizations, invoices] = await Promise.all([
      query<{ count: string }>('SELECT count(*) AS count FROM users'),
      query<{ count: string }>('SELECT count(*) AS count FROM users WHERE platform_admin'),
      query<{ count: string }>('SELECT count(*) AS count FROM organizations'),
      query<{ total: string; paid: string; pending: string }>(
        `SELECT count(*) AS total,
                count(*) FILTER (WHERE status = 'paid') AS paid,
                count(*) FILTER (WHERE status IN ('sent', 'overdue', 'payment_pending')) AS pending
         FROM invoices`,
      ),
    ]);

    const invoiceCounts = invoices.rows[0];
    res.json({
      totalUsers: Number(users.rows[0].count),
      platformAdmins: Number(admins.rows[0].count),
      totalOrganizations: Number(organizations.rows[0].count),
      totalInvoices: Number(invoiceCounts.total),
      paidInvoices: Number(invoiceCounts.paid),
      pendingInvoices: Number(invoiceCounts.pending),
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/organizations', async (_req, res, next) => {
  try {
    const result = await query<{
      id: string;
      name: string;
      owner_email: string | null;
      created_at: Date | string;
      updated_at: Date | string;
      member_count: string;
      invoice_count: string;
    }>(
      `SELECT o.id, o.name, o.owner_email, o.created_at, o.updated_at,
              (SELECT count(*) FROM members m WHERE m.organization_id = o.id) AS member_count,
              (SELECT count(*) FROM invoices i WHERE i.organization_id = o.id) AS invoice_count
       FROM organizations o
       ORDER BY o.created_at DESC`,
    );

    res.json(
      result.rows.map((row) => ({
        id: row.id,
        name: row.name ?? row.id,
        ownerEmail: row.owner_email ?? undefined,
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
        memberCount: Number(row.member_count),
        invoiceCount: Number(row.invoice_count),
      })),
    );
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/users', async (_req, res, next) => {
  try {
    const result = await query<{
      id: string;
      email: string | null;
      platform_admin: boolean;
      created_at: Date | string;
      updated_at: Date | string;
      organizations: string[] | null;
      roles: Record<string, string> | null;
    }>(
      `SELECT u.id, u.email, u.platform_admin, u.created_at, u.updated_at,
              array_agg(m.organization_id) FILTER (WHERE m.organization_id IS NOT NULL) AS organizations,
              jsonb_object_agg(m.organization_id, m.role)
                FILTER (WHERE m.organization_id IS NOT NULL) AS roles
       FROM users u
       LEFT JOIN members m ON m.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`,
    );

    res.json(
      result.rows.map((row) => ({
        uid: row.id,
        email: row.email,
        organizations: row.organizations ?? [],
        roles: row.roles ?? {},
        platformAdmin: Boolean(row.platform_admin),
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
      })),
    );
  } catch (error) {
    next(error);
  }
});

function parseLimit(value: unknown): number {
  const limit = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : 25;
  if (!Number.isFinite(limit)) return 25;
  return Math.min(Math.max(Math.floor(limit), 1), 100);
}

adminRouter.get('/invoices', async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit);
    const result = await query<InvoiceRow>(
      'SELECT * FROM invoices ORDER BY created_at DESC LIMIT $1',
      [limit],
    );
    res.json(result.rows.map(mapInvoiceRow));
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/payments', async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit);
    const result = await query<InvoiceRow>(
      `SELECT * FROM invoices
       WHERE payment IS NOT NULL
       ORDER BY updated_at DESC LIMIT $1`,
      [limit],
    );

    const payments = result.rows.map((row) => {
      const payment = (row.payment ?? {}) as Record<string, unknown>;
      const totals = (row.totals ?? {}) as { total?: number };
      return {
        id: `${row.id}-${(payment.reference as string) ?? 'payment'}`,
        organizationId: row.organization_id,
        invoiceId: row.id,
        invoiceNumber: row.number,
        provider: payment.provider,
        reference: payment.reference,
        status: row.status === 'paid' ? 'settled' : 'pending',
        amount: { amount: totals.total ?? (payment.amount as number) ?? 0, currency: row.currency },
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
        settledAt: toIso(payment.reconciledAt as string | undefined),
        raw: payment.reconciliation ?? payment.raw ?? payment,
      };
    });

    res.json(payments);
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/grant', async (req, res, next) => {
  try {
    const parsed = z.object({ targetEmail: z.string().email() }).safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'invalid_payload', 'Invalid email provided.', parsed.error.flatten());
    }

    const { targetEmail } = parsed.data;
    const result = await query<{ id: string }>(
      'UPDATE users SET platform_admin = true, updated_at = now() WHERE email = $1 RETURNING id',
      [targetEmail.trim().toLowerCase()],
    );
    if (result.rows.length === 0) {
      throw new ApiError(404, 'not_found', 'No user exists with this email.');
    }

    const uid = result.rows[0].id;
    await recordAuditEvent({
      actorUid: req.auth!.uid,
      actorEmail: req.auth!.email,
      action: 'admin:grantPlatformAdmin',
      target: uid,
      metadata: { targetEmail },
    });

    res.json({ uid, email: targetEmail });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/revoke', async (req, res, next) => {
  try {
    const parsed = z
      .object({
        targetUid: z.string().min(1).optional(),
        targetEmail: z.string().email().optional(),
      })
      .refine((value) => Boolean(value.targetUid || value.targetEmail), {
        message: 'Provide a target UID or email address.',
      })
      .safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'invalid_payload', 'Invalid revoke payload.', parsed.error.flatten());
    }

    const { targetUid, targetEmail } = parsed.data;
    const result = targetUid
      ? await query<{ id: string; email: string | null }>(
          'UPDATE users SET platform_admin = false, updated_at = now() WHERE id = $1 RETURNING id, email',
          [targetUid],
        )
      : await query<{ id: string; email: string | null }>(
          'UPDATE users SET platform_admin = false, updated_at = now() WHERE email = $1 RETURNING id, email',
          [targetEmail!.trim().toLowerCase()],
        );

    if (result.rows.length === 0) {
      throw new ApiError(404, 'not_found', 'No user found for the provided identifier.');
    }

    const target = result.rows[0];
    await recordAuditEvent({
      actorUid: req.auth!.uid,
      actorEmail: req.auth!.email,
      action: 'admin:revokePlatformAdmin',
      target: target.id,
      metadata: { targetUid: target.id, targetEmail: target.email },
    });

    res.json({ uid: target.id, email: target.email });
  } catch (error) {
    next(error);
  }
});
