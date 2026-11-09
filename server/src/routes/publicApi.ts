import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config';
import { query, withTransaction } from '../db/pool';
import { ApiError } from '../lib/errors';
import { calculateTotals } from '../lib/invoiceTotals';
import { mapInvoiceRow, type InvoiceRow } from '../lib/invoiceMapper';
import { recordAuditEvent } from '../lib/audit';
import { initializePayment } from '../services/paymentProviders';

// External REST API — formerly the `invoiceApi` Express function.
// Auth: `x-api-key` header matching INVOICE_API_KEY, or a platform-admin JWT.
export const publicApiRouter = Router();

const createInvoiceSchema = z.object({
  organizationId: z.string().min(1),
  clientId: z.string().min(1),
  clientName: z.string().min(1),
  currency: z.string().min(1),
  dueDate: z.string(),
  issueDate: z.string(),
  lineItems: z
    .array(
      z.object({
        description: z.string(),
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative(),
        taxRate: z.number().min(0),
      }),
    )
    .min(1),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const updateInvoiceSchema = z.object({
  status: z.enum(['draft', 'sent', 'paid', 'overdue', 'void', 'payment_pending']).optional(),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const paymentIntentSchema = z.object({
  provider: z.enum(['flutterwave', 'paystack']),
  customerEmail: z.string().email(),
  amount: z.number().optional(),
  currency: z.string().optional(),
});

type ApiContext = { type: 'token'; uid: string; email?: string | null } | { type: 'apiKey' };

async function authenticate(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
  try {
    const apiKeyHeader = req.headers['x-api-key'];
    if (config.invoiceApiKey && typeof apiKeyHeader === 'string') {
      if (apiKeyHeader === config.invoiceApiKey) {
        req.apiContext = { type: 'apiKey' };
        next();
        return;
      }
      res.status(401).json({ error: 'invalid_api_key', message: 'Invalid API key.' });
      return;
    }

    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: 'missing_auth_token', message: 'Authorization header missing.' });
      return;
    }

    const decoded = jwt.verify(token, config.jwtSecret) as { uid?: string };
    const userResult = await query<{ id: string; email: string | null; platform_admin: boolean }>(
      'SELECT id, email, platform_admin FROM users WHERE id = $1',
      [decoded.uid],
    );
    const user = userResult.rows[0];
    if (!user || !user.platform_admin) {
      res.status(403).json({ error: 'forbidden', message: 'Platform admin privileges required.' });
      return;
    }

    req.apiContext = { type: 'token', uid: user.id, email: user.email } satisfies ApiContext;
    next();
  } catch (error) {
    console.error('API auth failed', error);
    res.status(401).json({ error: 'invalid_token', message: 'Unable to verify token.' });
  }
}

function getActorContext(req: import('express').Request) {
  const ctx = req.apiContext;
  if (!ctx) {
    return { uid: 'unknown', email: undefined as string | undefined | null, type: undefined };
  }
  if (ctx.type === 'token') {
    return { uid: ctx.uid, email: ctx.email, type: ctx.type };
  }
  return { uid: 'api-key', email: undefined as string | undefined | null, type: ctx.type };
}

function resolvePaymentLink(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const data =
    record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : undefined;
  const nested =
    data?.data && typeof data.data === 'object' ? (data.data as Record<string, unknown>) : undefined;

  const candidates: unknown[] = [
    data?.link,
    data?.authorization_url,
    nested?.authorization_url,
    record.link,
    record.authorization_url,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}

publicApiRouter.use(authenticate);

publicApiRouter.post('/invoices', async (req, res, next) => {
  try {
    const parsed = createInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_payload', details: parsed.error.flatten() });
      return;
    }

    const invoice = parsed.data;
    const totals = calculateTotals(invoice.lineItems);

    const result = await withTransaction(async (client) => {
      const counter = await client.query<{ current: string }>(
        `INSERT INTO counters (organization_id, name, current)
         VALUES ($1, 'invoices', 1)
         ON CONFLICT (organization_id, name)
         DO UPDATE SET current = counters.current + 1, updated_at = now()
         RETURNING current`,
        [invoice.organizationId],
      );

      const number = `INV-${String(Number(counter.rows[0].current)).padStart(6, '0')}`;
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO invoices
          (organization_id, number, client_id, client_name, status, issue_date, due_date,
           currency, line_items, totals, notes, metadata)
         VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          invoice.organizationId,
          number,
          invoice.clientId,
          invoice.clientName,
          invoice.issueDate,
          invoice.dueDate,
          invoice.currency,
          JSON.stringify(invoice.lineItems),
          JSON.stringify(totals),
          invoice.notes ?? null,
          JSON.stringify(invoice.metadata ?? {}),
        ],
      );
      return { id: inserted.rows[0].id, number };
    });

    const actor = getActorContext(req);
    await recordAuditEvent({
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: 'api:invoice:create',
      target: `${invoice.organizationId}/${result.id}`,
      metadata: {
        provider: actor.type,
        clientId: invoice.clientId,
        lineItemCount: invoice.lineItems.length,
      },
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

publicApiRouter.get('/invoices/:organizationId/:invoiceId', async (req, res, next) => {
  try {
    const { organizationId, invoiceId } = req.params;
    const result = await query<InvoiceRow>(
      'SELECT * FROM invoices WHERE id = $1 AND organization_id = $2',
      [invoiceId, organizationId],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Invoice not found.' });
      return;
    }
    res.json(mapInvoiceRow(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

publicApiRouter.patch('/invoices/:organizationId/:invoiceId', async (req, res, next) => {
  try {
    const { organizationId, invoiceId } = req.params;
    const parsed = updateInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_payload', details: parsed.error.flatten() });
      return;
    }

    const sets: string[] = ['updated_at = now()'];
    const params: unknown[] = [invoiceId, organizationId];
    const push = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (parsed.data.status) {
      sets.push(`status = ${push(parsed.data.status)}`);
      if (parsed.data.status === 'sent') sets.push('sent_at = now()');
      if (parsed.data.status === 'void') sets.push('voided_at = now()');
    }
    if (parsed.data.notes !== undefined) {
      sets.push(`notes = ${push(parsed.data.notes)}`);
    }
    if (parsed.data.metadata !== undefined) {
      sets.push(`metadata = ${push(JSON.stringify(parsed.data.metadata))}`);
    }

    const result = await query(
      `UPDATE invoices SET ${sets.join(', ')} WHERE id = $1 AND organization_id = $2 RETURNING id`,
      params,
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Invoice not found.' });
      return;
    }

    const actor = getActorContext(req);
    await recordAuditEvent({
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: 'api:invoice:update',
      target: `${organizationId}/${invoiceId}`,
      metadata: {
        status: parsed.data.status ?? null,
        notesUpdated: parsed.data.notes !== undefined,
        metadataUpdated: parsed.data.metadata !== undefined,
      },
    });

    const refreshed = await query<InvoiceRow>('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
    res.json(mapInvoiceRow(refreshed.rows[0]));
  } catch (error) {
    next(error);
  }
});

publicApiRouter.post('/invoices/:organizationId/:invoiceId/payment-intent', async (req, res, next) => {
  try {
    const { organizationId, invoiceId } = req.params;
    const parsed = paymentIntentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_payload', details: parsed.error.flatten() });
      return;
    }

    const invoiceResult = await query<InvoiceRow>(
      'SELECT * FROM invoices WHERE id = $1 AND organization_id = $2',
      [invoiceId, organizationId],
    );
    if (invoiceResult.rows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Invoice not found.' });
      return;
    }

    const invoice = invoiceResult.rows[0];
    const totals = (invoice.totals ?? {}) as { total?: number };
    const payload = parsed.data;

    const response = await initializePayment(payload.provider, {
      reference: `api_inv_${invoiceId}_${Date.now()}`,
      amount: payload.amount ?? totals.total ?? 0,
      currency: payload.currency ?? invoice.currency,
      customerEmail: payload.customerEmail,
      metadata: {
        organizationId,
        invoiceId,
        clientName: invoice.client_name,
      },
    });

    const link = resolvePaymentLink(response);

    await query(
      `UPDATE invoices
       SET payment_intent_url = $3, status = 'payment_pending', payment_intent = $4, updated_at = now()
       WHERE id = $1 AND organization_id = $2`,
      [invoiceId, organizationId, link, JSON.stringify(response ?? null)],
    );

    const actor = getActorContext(req);
    await recordAuditEvent({
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: 'api:invoice:createPaymentIntent',
      target: `${organizationId}/${invoiceId}`,
      metadata: { provider: payload.provider, customerEmail: payload.customerEmail },
    });

    res.json({ link, response });
  } catch (error) {
    next(error);
  }
});
