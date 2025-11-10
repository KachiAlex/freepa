import * as functions from 'firebase-functions';
import { z } from 'zod';
import { assertUserHasRole, assertUserInOrg } from '../lib/auth';
import { FieldValue, getFirestore } from '../lib/firebase';
import { calculateTotals } from '../lib/invoiceTotals';
import { InvoiceLineItem } from '../types/invoice';
import { recordAuditEvent } from '../lib/audit';

const invoiceSchema = z.object({
  organizationId: z.string().min(1),
  clientId: z.string().min(1),
  clientName: z.string().min(1),
  currency: z.string().min(1),
  dueDate: z.string(),
  issueDate: z.string(),
  lineItems: z.array(
    z.object({
      description: z.string(),
      quantity: z.number().positive(),
      unitPrice: z.number().nonnegative(),
      taxRate: z.number().min(0),
    }),
  ),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

type InvoiceInput = z.infer<typeof invoiceSchema>;

const db = getFirestore();

export const createInvoice = functions.https.onCall(async (data, context) => {
  const parsedInvoice = invoiceSchema.safeParse(data);
  if (!parsedInvoice.success) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid invoice payload.',
      parsedInvoice.error.flatten(),
    );
  }

  const invoice = parsedInvoice.data;
  await assertUserInOrg(context, invoice.organizationId);
  assertUserHasRole(context, invoice.organizationId, ['owner', 'admin', 'manager', 'editor']);

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

    const totals = calculateTotals(invoice.lineItems as InvoiceLineItem[]);

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

  await recordAuditEvent({
    actorUid: context.auth?.uid ?? 'system',
    actorEmail: context.auth?.token.email as string | undefined,
    action: 'invoice:create',
    target: `${invoice.organizationId}/${result.id}`,
    metadata: {
      clientId: invoice.clientId,
      lineItemCount: invoice.lineItems.length,
      currency: invoice.currency,
    },
  });

  return result;
});

