import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { calculateTotals } from '../lib/invoiceTotals';
import { FieldValue, getFirestore } from '../lib/firebase';
import { initializePayment } from '../services/paymentProviders';
import { getOptionalEnv } from '../config';
import { recordAuditEvent } from '../lib/audit';

const db = getFirestore();
const externalApiKey = getOptionalEnv('INVOICE_API_KEY');

type AdminContext =
  | { type: 'token'; uid: string; email?: string }
  | { type: 'apiKey'; keyId?: string };

interface AdminRequest extends express.Request {
  adminContext?: AdminContext;
}

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

async function authenticateAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const apiKeyHeader = req.headers['x-api-key'] ?? req.headers['x-api-key'.toLowerCase()];
    if (externalApiKey && typeof apiKeyHeader === 'string') {
      if (apiKeyHeader === externalApiKey) {
        (req as AdminRequest).adminContext = { type: 'apiKey' };
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

    const decoded = await admin.auth().verifyIdToken(token);
    if (!decoded.platformAdmin) {
      res.status(403).json({ error: 'forbidden', message: 'Platform admin privileges required.' });
      return;
    }

    (req as AdminRequest).adminContext = { type: 'token', uid: decoded.uid, email: decoded.email };
    next();
  } catch (error) {
    console.error('Admin auth failed', error);
    res.status(401).json({ error: 'invalid_token', message: 'Unable to verify token.' });
  }
}

function getActorContext(req: express.Request) {
  const ctx = (req as AdminRequest).adminContext;
  if (!ctx) {
    return { uid: 'unknown', email: undefined, context: ctx };
  }
  if (ctx.type === 'token') {
    return { uid: ctx.uid, email: ctx.email, context: ctx };
  }
  return { uid: 'api-key', email: undefined, context: ctx };
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

function resolvePaymentLink(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const data =
    record.data && typeof record.data === 'object'
      ? (record.data as Record<string, unknown>)
      : undefined;
  const nested =
    data?.data && typeof data.data === 'object'
      ? (data.data as Record<string, unknown>)
      : undefined;

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
app.use(authenticateAdmin);

app.post('/invoices', async (req, res) => {
  const parsed = createInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload', details: parsed.error.flatten() });
    return;
  }

  const invoice = parsed.data;
  try {
    const counterRef = db
      .collection('organizations')
      .doc(invoice.organizationId)
      .collection('counters')
      .doc('invoices');

    const result = await db.runTransaction(async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      const nextNumber = (counterSnap.data()?.current ?? 0) + 1;
      transaction.set(
        counterRef,
        { current: nextNumber, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );

      const invoiceRef = db
        .collection('organizations')
        .doc(invoice.organizationId)
        .collection('invoices')
        .doc();

      const totals = calculateTotals(invoice.lineItems);
      const payload = {
        ...invoice,
        number: `INV-${String(nextNumber).padStart(6, '0')}`,
        totals,
        status: 'draft',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      transaction.set(invoiceRef, payload);
      return { id: invoiceRef.id, number: payload.number };
    });

    const actor = getActorContext(req);
    await recordAuditEvent({
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: 'api:invoice:create',
      target: `${invoice.organizationId}/${result.id}`,
      metadata: {
        provider: actor.context?.type,
        clientId: invoice.clientId,
        lineItemCount: invoice.lineItems.length,
      },
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating invoice via API', error);
    res.status(500).json({ error: 'internal', message: 'Failed to create invoice.' });
  }
});

app.get('/invoices/:organizationId/:invoiceId', async (req, res) => {
  const { organizationId, invoiceId } = req.params;
  try {
    const invoiceSnap = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('invoices')
      .doc(invoiceId)
      .get();

    if (!invoiceSnap.exists) {
      res.status(404).json({ error: 'not_found', message: 'Invoice not found.' });
      return;
    }

    res.json({ id: invoiceSnap.id, ...invoiceSnap.data() });
  } catch (error) {
    console.error('Error fetching invoice', error);
    res.status(500).json({ error: 'internal', message: 'Failed to fetch invoice.' });
  }
});

app.patch('/invoices/:organizationId/:invoiceId', async (req, res) => {
  const { organizationId, invoiceId } = req.params;
  const parsed = updateInvoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload', details: parsed.error.flatten() });
    return;
  }

  try {
    const invoiceRef = db.collection('organizations').doc(organizationId).collection('invoices').doc(invoiceId);
    const updatePayload: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (parsed.data.status) {
      updatePayload.status = parsed.data.status;
      if (parsed.data.status === 'sent') {
        updatePayload.sentAt = FieldValue.serverTimestamp();
      }
      if (parsed.data.status === 'void') {
        updatePayload.voidedAt = FieldValue.serverTimestamp();
      }
    }

    if (parsed.data.notes !== undefined) {
      updatePayload.notes = parsed.data.notes;
    }

    if (parsed.data.metadata !== undefined) {
      updatePayload.metadata = parsed.data.metadata;
    }

    await invoiceRef.set(updatePayload, { merge: true });
    const refreshed = await invoiceRef.get();

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

    res.json({ id: invoiceId, ...refreshed.data() });
  } catch (error) {
    console.error('Error updating invoice', error);
    res.status(500).json({ error: 'internal', message: 'Failed to update invoice.' });
  }
});

app.post('/invoices/:organizationId/:invoiceId/payment-intent', async (req, res) => {
  const { organizationId, invoiceId } = req.params;
  const parsed = paymentIntentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_payload', details: parsed.error.flatten() });
    return;
  }

  try {
    const invoiceSnap = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('invoices')
      .doc(invoiceId)
      .get();
    if (!invoiceSnap.exists) {
      res.status(404).json({ error: 'not_found', message: 'Invoice not found.' });
      return;
    }

    const invoiceData = invoiceSnap.data() as {
      total: { amount: number; currency: string };
      clientName?: string;
    };

    const payload = parsed.data;
    const response = await initializePayment(payload.provider, {
      reference: `api_inv_${invoiceId}_${Date.now()}`,
      amount: payload.amount ?? invoiceData.total.amount,
      currency: payload.currency ?? invoiceData.total.currency,
      customerEmail: payload.customerEmail,
      metadata: {
        organizationId,
        invoiceId,
        clientName: invoiceData.clientName,
      },
    });

    const link = resolvePaymentLink(response);

    await invoiceSnap.ref.set(
      {
        paymentIntentUrl: link,
        status: 'payment_pending',
        paymentIntent: response,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    const actor = getActorContext(req);
    await recordAuditEvent({
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: 'api:invoice:createPaymentIntent',
      target: `${organizationId}/${invoiceId}`,
      metadata: {
        provider: payload.provider,
        customerEmail: payload.customerEmail,
      },
    });

    res.json({ link, response });
  } catch (error) {
    console.error('Error creating payment intent', error);
    res.status(500).json({ error: 'internal', message: 'Failed to create payment intent.' });
  }
});

export const invoiceApi = functions.https.onRequest(app);

