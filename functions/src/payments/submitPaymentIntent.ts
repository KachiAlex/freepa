import * as functions from 'firebase-functions';
import { z } from 'zod';
import { assertUserHasRole, assertUserInOrg } from '../lib/auth';
import { initializePayment } from '../services/paymentProviders';

const submitPaymentSchema = z.object({
  organizationId: z.string().min(1),
  invoiceId: z.string().min(1),
  provider: z.enum(['flutterwave', 'paystack']),
  amount: z.number().positive(),
  currency: z.string().min(1),
  customerEmail: z.string().email(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const submitPaymentIntent = functions.https.onCall(async (data, context) => {
  const parsed = submitPaymentSchema.safeParse(data);
  if (!parsed.success) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid payment intent payload.',
      parsed.error.flatten(),
    );
  }

  const payload = parsed.data;
  await assertUserInOrg(context, payload.organizationId);
  assertUserHasRole(context, payload.organizationId, ['owner', 'admin', 'manager', 'finance']);

  const reference = `inv_${payload.invoiceId}_${Date.now()}`;

  const response = await initializePayment(payload.provider, {
    reference,
    amount: payload.amount,
    currency: payload.currency,
    customerEmail: payload.customerEmail,
    metadata: {
      organizationId: payload.organizationId,
      invoiceId: payload.invoiceId,
      redirect_url: 'https://your-domain.com/payments/success',
      ...(payload.metadata ?? {}),
    },
  });

  return response;
});

