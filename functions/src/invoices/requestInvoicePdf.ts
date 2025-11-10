import * as functions from 'firebase-functions';
import { z } from 'zod';
import { assertUserHasRole, assertUserInOrg } from '../lib/auth';
import { FieldValue, getFirestore } from '../lib/firebase';
import { recordAuditEvent } from '../lib/audit';

const db = getFirestore();

const requestPdfSchema = z.object({
  organizationId: z.string().min(1),
  invoiceId: z.string().min(1),
  type: z.enum(['invoice', 'receipt']).default('invoice'),
});

export const requestInvoicePdf = functions.https.onCall(async (data, context) => {
  const payload = requestPdfSchema.safeParse(data);
  if (!payload.success) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid PDF request payload.', payload.error.flatten());
  }

  const { organizationId, invoiceId, type } = payload.data;

  await assertUserInOrg(context, organizationId);
  assertUserHasRole(context, organizationId, ['owner', 'admin', 'manager', 'editor']);

  const invoiceRef = db.collection('organizations').doc(organizationId).collection('invoices').doc(invoiceId);
  const snapshot = await invoiceRef.get();
  if (!snapshot.exists) {
    throw new functions.https.HttpsError('not-found', 'Invoice not found.');
  }

  if (type === 'receipt' && snapshot.data()?.status !== 'paid') {
    throw new functions.https.HttpsError('failed-precondition', 'Receipt can only be generated for paid invoices.');
  }

  const placeholderUrl =
    type === 'receipt'
      ? `https://placehold.co/600x800.png?text=Receipt+${invoiceId}`
      : `https://placehold.co/600x800.png?text=Invoice+${invoiceId}`;

  const fieldPrefix = type === 'receipt' ? 'receiptPdf' : 'pdf';

  await invoiceRef.set(
    {
      [`${fieldPrefix}Status`]: 'ready',
      [`${fieldPrefix}Url`]: placeholderUrl,
      [`${fieldPrefix}UpdatedAt`]: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await recordAuditEvent({
    actorUid: context.auth?.uid ?? 'system',
    actorEmail: context.auth?.token.email as string | undefined,
    action: type === 'receipt' ? 'invoice:generateReceipt' : 'invoice:generatePdf',
    target: `${organizationId}/${invoiceId}`,
    metadata: { placeholder: true, type },
  });

  return { invoiceId, organizationId, url: placeholderUrl, type };
});

