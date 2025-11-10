import * as functions from 'firebase-functions';
import { z } from 'zod';
import { assertUserHasRole, assertUserInOrg } from '../lib/auth';
import { FieldValue, getFirestore } from '../lib/firebase';
import { calculateTotals } from '../lib/invoiceTotals';
import { InvoiceLineItem } from '../types/invoice';
import { recordAuditEvent } from '../lib/audit';

const db = getFirestore();

const updateInvoiceSchema = z.object({
  organizationId: z.string().min(1),
  invoiceId: z.string().min(1),
  lineItems: z
    .array(
      z.object({
        description: z.string(),
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative(),
        taxRate: z.number().min(0),
      }),
    )
    .optional(),
  notes: z.string().optional(),
  status: z.enum(['draft', 'sent', 'paid', 'overdue', 'void', 'payment_pending']).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  paymentIntentUrl: z.string().optional(),
  pdfUrl: z.string().optional(),
});

export const updateInvoice = functions.https.onCall(async (data, context) => {
  const payload = updateInvoiceSchema.safeParse(data);
  if (!payload.success) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid invoice update payload.', payload.error.flatten());
  }

  const { organizationId, invoiceId, ...updates } = payload.data;

  await assertUserInOrg(context, organizationId);
  assertUserHasRole(context, organizationId, ['owner', 'admin', 'manager', 'editor', 'finance']);

  const invoiceRef = db.collection('organizations').doc(organizationId).collection('invoices').doc(invoiceId);
  const snap = await invoiceRef.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Invoice not found.');
  }

  const lineItems = (updates.lineItems as InvoiceLineItem[] | undefined) ?? (snap.data()?.lineItems ?? []);
  const totals = calculateTotals(lineItems as InvoiceLineItem[]);

  const updatePayload: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (updates.lineItems) {
    updatePayload.lineItems = lineItems;
    updatePayload.totals = totals;
  }

  if (typeof updates.notes === 'string') {
    updatePayload.notes = updates.notes;
  }

  if (updates.metadata) {
    updatePayload.metadata = updates.metadata;
  }

  if (updates.paymentIntentUrl) {
    updatePayload.paymentIntentUrl = updates.paymentIntentUrl;
  }

  if (updates.pdfUrl) {
    updatePayload.pdfUrl = updates.pdfUrl;
    updatePayload.pdfStatus = 'ready';
    updatePayload.pdfUpdatedAt = FieldValue.serverTimestamp();
  }

  if (updates.status) {
    updatePayload.status = updates.status;
    if (updates.status === 'sent') {
      updatePayload.sentAt = FieldValue.serverTimestamp();
    }
    if (updates.status === 'void') {
      updatePayload.voidedAt = FieldValue.serverTimestamp();
    }
  }

  await invoiceRef.set(updatePayload, { merge: true });

  await recordAuditEvent({
    actorUid: context.auth?.uid ?? 'system',
    actorEmail: context.auth?.token.email as string | undefined,
    action: 'invoice:update',
    target: `${organizationId}/${invoiceId}`,
    metadata: {
      status: updates.status ?? null,
      notesUpdated: updates.notes !== undefined,
      metadataUpdated: updates.metadata !== undefined,
      lineItemsUpdated: updates.lineItems !== undefined,
    },
  });

  return { invoiceId, organizationId, totals };
});

