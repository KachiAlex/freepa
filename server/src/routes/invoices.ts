import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool';
import { ApiError } from '../lib/errors';
import { calculateTotals } from '../lib/invoiceTotals';
import { mapInvoiceRow, type InvoiceRow } from '../lib/invoiceMapper';
import { recordAuditEvent } from '../lib/audit';
import { initializePayment } from '../services/paymentProviders';
import { config } from '../config';
import { assertOrgAccess, assertOrgRole, requireAuth } from '../middleware/auth';

export const invoicesRouter = Router({ mergeParams: true });

invoicesRouter.use(requireAuth);

const lineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  taxRate: z.number().min(0),
});

const createInvoiceSchema = z.object({
  clientId: z.string().min(1),
  clientName: z.string().min(1),
  currency: z.string().min(1),
  dueDate: z.string(),
  issueDate: z.string(),
  lineItems: z.array(lineItemSchema),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const updateInvoiceSchema = z.object({
  lineItems: z.array(lineItemSchema).optional(),
  notes: z.string().optional(),
  status: z.enum(['draft', 'sent', 'paid', 'overdue', 'void', 'payment_pending']).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  paymentIntentUrl: z.string().optional(),
  pdfUrl: z.string().optional(),
});

const statusSchema = z.enum(['draft', 'sent', 'paid', 'overdue', 'void', 'payment_pending']);

async function getInvoiceOr404(organizationId: string, invoiceId: string): Promise<InvoiceRow> {
  const result = await query<InvoiceRow>(
    'SELECT * FROM invoices WHERE id = $1 AND organization_id = $2',
    [invoiceId, organizationId],
  );
  if (result.rows.length === 0) {
    throw new ApiError(404, 'not_found', 'Invoice not found.');
  }
  return result.rows[0];
}

invoicesRouter.get('/', async (req, res, next) => {
  try {
    const { organizationId } = req.params as { organizationId: string };
    assertOrgAccess(req.auth, organizationId);

    const result = await query<InvoiceRow>(
      'SELECT * FROM invoices WHERE organization_id = $1 ORDER BY created_at DESC',
      [organizationId],
    );
    res.json(result.rows.map(mapInvoiceRow));
  } catch (error) {
    next(error);
  }
});

invoicesRouter.post('/', async (req, res, next) => {
  try {
    const { organizationId } = req.params as { organizationId: string };
    const parsed = createInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'invalid_payload', 'Invalid invoice payload.', parsed.error.flatten());
    }

    assertOrgAccess(req.auth, organizationId);
    assertOrgRole(req.auth, organizationId, ['owner', 'admin', 'manager', 'editor']);

    const invoice = parsed.data;
    const totals = calculateTotals(invoice.lineItems);

    const result = await withTransaction(async (client) => {
      const counter = await client.query<{ current: string }>(
        `INSERT INTO counters (organization_id, name, current)
         VALUES ($1, 'invoices', 1)
         ON CONFLICT (organization_id, name)
         DO UPDATE SET current = counters.current + 1, updated_at = now()
         RETURNING current`,
        [organizationId],
      );

      const nextNumber = Number(counter.rows[0].current);
      const number = `INV-${String(nextNumber).padStart(6, '0')}`;

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO invoices
          (organization_id, number, client_id, client_name, status, issue_date, due_date,
           currency, line_items, totals, notes, metadata)
         VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          organizationId,
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

    await recordAuditEvent({
      actorUid: req.auth!.uid,
      actorEmail: req.auth!.email,
      action: 'invoice:create',
      target: `${organizationId}/${result.id}`,
      metadata: {
        clientId: invoice.clientId,
        lineItemCount: invoice.lineItems.length,
        currency: invoice.currency,
      },
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

invoicesRouter.get('/:invoiceId', async (req, res, next) => {
  try {
    const { organizationId, invoiceId } = req.params as {
      organizationId: string;
      invoiceId: string;
    };
    assertOrgAccess(req.auth, organizationId);
    const row = await getInvoiceOr404(organizationId, invoiceId);
    res.json(mapInvoiceRow(row));
  } catch (error) {
    next(error);
  }
});

invoicesRouter.patch('/:invoiceId', async (req, res, next) => {
  try {
    const { organizationId, invoiceId } = req.params as {
      organizationId: string;
      invoiceId: string;
    };
    const parsed = updateInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'invalid_payload', 'Invalid invoice update payload.', parsed.error.flatten());
    }

    assertOrgAccess(req.auth, organizationId);
    assertOrgRole(req.auth, organizationId, ['owner', 'admin', 'manager', 'editor', 'finance']);

    const existing = await getInvoiceOr404(organizationId, invoiceId);
    const updates = parsed.data;

    const lineItems = updates.lineItems ?? (existing.line_items as unknown[]);
    const totals = calculateTotals(lineItems as Parameters<typeof calculateTotals>[0]);

    const sets: string[] = ['updated_at = now()'];
    const params: unknown[] = [invoiceId, organizationId];
    const push = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (updates.lineItems) {
      sets.push(`line_items = ${push(JSON.stringify(lineItems))}`);
      sets.push(`totals = ${push(JSON.stringify(totals))}`);
    }
    if (typeof updates.notes === 'string') {
      sets.push(`notes = ${push(updates.notes)}`);
    }
    if (updates.metadata) {
      sets.push(`metadata = ${push(JSON.stringify(updates.metadata))}`);
    }
    if (updates.paymentIntentUrl) {
      sets.push(`payment_intent_url = ${push(updates.paymentIntentUrl)}`);
    }
    if (updates.pdfUrl) {
      sets.push(`pdf_url = ${push(updates.pdfUrl)}`);
      sets.push(`pdf_status = 'ready'`);
      sets.push(`pdf_updated_at = now()`);
    }
    if (updates.status) {
      sets.push(`status = ${push(updates.status)}`);
      if (updates.status === 'sent') sets.push('sent_at = now()');
      if (updates.status === 'void') sets.push('voided_at = now()');
    }

    await query(`UPDATE invoices SET ${sets.join(', ')} WHERE id = $1 AND organization_id = $2`, params);

    await recordAuditEvent({
      actorUid: req.auth!.uid,
      actorEmail: req.auth!.email,
      action: 'invoice:update',
      target: `${organizationId}/${invoiceId}`,
      metadata: {
        status: updates.status ?? null,
        notesUpdated: updates.notes !== undefined,
        metadataUpdated: updates.metadata !== undefined,
        lineItemsUpdated: updates.lineItems !== undefined,
      },
    });

    res.json({ invoiceId, organizationId, totals });
  } catch (error) {
    next(error);
  }
});

// Dedicated status endpoint (mirrors updateInvoice with just a status change).
invoicesRouter.post('/:invoiceId/status', async (req, res, next) => {
  try {
    const { organizationId, invoiceId } = req.params as {
      organizationId: string;
      invoiceId: string;
    };
    const parsed = z.object({ status: statusSchema }).safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'invalid_payload', 'Invalid status payload.', parsed.error.flatten());
    }

    assertOrgAccess(req.auth, organizationId);
    assertOrgRole(req.auth, organizationId, ['owner', 'admin', 'manager', 'editor', 'finance']);
    await getInvoiceOr404(organizationId, invoiceId);

    const extra =
      parsed.data.status === 'sent'
        ? ', sent_at = now()'
        : parsed.data.status === 'void'
          ? ', voided_at = now()'
          : '';

    await query(
      `UPDATE invoices SET status = $3, updated_at = now()${extra}
       WHERE id = $1 AND organization_id = $2`,
      [invoiceId, organizationId, parsed.data.status],
    );

    await recordAuditEvent({
      actorUid: req.auth!.uid,
      actorEmail: req.auth!.email,
      action: 'invoice:update',
      target: `${organizationId}/${invoiceId}`,
      metadata: { status: parsed.data.status },
    });

    res.json({ invoiceId, organizationId, status: parsed.data.status });
  } catch (error) {
    next(error);
  }
});

// requestInvoicePdf — placeholder generation (no real PDF renderer yet).
invoicesRouter.post('/:invoiceId/pdf', async (req, res, next) => {
  try {
    const { organizationId, invoiceId } = req.params as {
      organizationId: string;
      invoiceId: string;
    };
    const parsed = z
      .object({ type: z.enum(['invoice', 'receipt']).default('invoice') })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ApiError(400, 'invalid_payload', 'Invalid PDF request payload.', parsed.error.flatten());
    }

    assertOrgAccess(req.auth, organizationId);
    assertOrgRole(req.auth, organizationId, ['owner', 'admin', 'manager', 'editor']);

    const invoice = await getInvoiceOr404(organizationId, invoiceId);
    const { type } = parsed.data;

    if (type === 'receipt' && invoice.status !== 'paid') {
      throw new ApiError(400, 'failed_precondition', 'Receipt can only be generated for paid invoices.');
    }

    const placeholderUrl =
      type === 'receipt'
        ? `https://placehold.co/600x800.png?text=Receipt+${invoiceId}`
        : `https://placehold.co/600x800.png?text=Invoice+${invoiceId}`;

    const prefix = type === 'receipt' ? 'receipt_pdf' : 'pdf';
    await query(
      `UPDATE invoices
       SET ${prefix}_status = 'ready', ${prefix}_url = $3, ${prefix}_updated_at = now(), updated_at = now()
       WHERE id = $1 AND organization_id = $2`,
      [invoiceId, organizationId, placeholderUrl],
    );

    await recordAuditEvent({
      actorUid: req.auth!.uid,
      actorEmail: req.auth!.email,
      action: type === 'receipt' ? 'invoice:generateReceipt' : 'invoice:generatePdf',
      target: `${organizationId}/${invoiceId}`,
      metadata: { placeholder: true, type },
    });

    res.json({ invoiceId, organizationId, url: placeholderUrl, type });
  } catch (error) {
    next(error);
  }
});

// submitPaymentIntent — initialize a payment with Flutterwave or Paystack.
invoicesRouter.post('/:invoiceId/payment-intent', async (req, res, next) => {
  try {
    const { organizationId, invoiceId } = req.params as {
      organizationId: string;
      invoiceId: string;
    };
    const parsed = z
      .object({
        provider: z.enum(['flutterwave', 'paystack']),
        amount: z.number().positive(),
        currency: z.string().min(1),
        customerEmail: z.string().email(),
        metadata: z.record(z.string(), z.any()).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'invalid_payload', 'Invalid payment intent payload.', parsed.error.flatten());
    }

    assertOrgAccess(req.auth, organizationId);
    assertOrgRole(req.auth, organizationId, ['owner', 'admin', 'manager', 'finance']);

    const payload = parsed.data;
    const response = await initializePayment(payload.provider, {
      reference: `inv_${invoiceId}_${Date.now()}`,
      amount: payload.amount,
      currency: payload.currency,
      customerEmail: payload.customerEmail,
      metadata: {
        organizationId,
        invoiceId,
        redirect_url: config.paymentSuccessRedirect,
        ...(payload.metadata ?? {}),
      },
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
});
