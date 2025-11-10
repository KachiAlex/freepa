import axios from 'axios';
import { createHmac } from 'crypto';
import { getEnv, getOptionalEnv } from '../config';

const FLUTTERWAVE_API_BASE = 'https://api.flutterwave.com/v3';
const PAYSTACK_API_BASE = 'https://api.paystack.co';

export type PaymentProvider = 'flutterwave' | 'paystack';

export type PaymentIntentPayload = {
  reference: string;
  amount: number;
  currency: string;
  customerEmail: string;
  metadata: Record<string, unknown>;
};

export async function initializePayment(
  provider: PaymentProvider,
  payload: PaymentIntentPayload,
): Promise<unknown> {
  if (provider === 'flutterwave') {
    const secret = getEnv('FLUTTERWAVE_SECRET_KEY');
    const response = await axios.post(
      `${FLUTTERWAVE_API_BASE}/payments`,
      {
        tx_ref: payload.reference,
        amount: payload.amount,
        currency: payload.currency,
        customer: { email: payload.customerEmail },
        redirect_url: payload.metadata['redirect_url'] ?? getOptionalEnv('PAYMENT_SUCCESS_REDIRECT') ?? 'https://example.com/payments/success',
        meta: payload.metadata,
      },
      {
        headers: { Authorization: `Bearer ${secret}` },
      },
    );
    return response.data;
  }

  const secret = getEnv('PAYSTACK_SECRET_KEY');
  const response = await axios.post(
    `${PAYSTACK_API_BASE}/transaction/initialize`,
    {
      reference: payload.reference,
      amount: Math.round(payload.amount * 100),
      currency: payload.currency,
      email: payload.customerEmail,
      metadata: payload.metadata,
        callback_url: payload.metadata['redirect_url'] ?? getOptionalEnv('PAYMENT_SUCCESS_REDIRECT') ?? 'https://example.com/payments/success',
    },
    {
      headers: { Authorization: `Bearer ${secret}` },
    },
  );
  return response.data;
}

export async function verifyPayment(provider: PaymentProvider, reference: string): Promise<unknown> {
  if (provider === 'flutterwave') {
    const secret = getEnv('FLUTTERWAVE_SECRET_KEY');
    const response = await axios.get(`${FLUTTERWAVE_API_BASE}/transactions/${reference}/verify`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    return response.data;
  }

  const secret = getEnv('PAYSTACK_SECRET_KEY');
  const response = await axios.get(`${PAYSTACK_API_BASE}/transaction/verify/${reference}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  return response.data;
}

export function verifyWebhookSignature(provider: PaymentProvider, rawBody: string, signature?: string) {
  if (!signature) {
    return false;
  }

  if (provider === 'flutterwave') {
    const secret = getEnv('FLUTTERWAVE_WEBHOOK_SECRET');
    const hash = createHmac('sha256', secret).update(rawBody).digest('hex');
    return hash === signature;
  }

  const secret = getEnv('PAYSTACK_WEBHOOK_SECRET');
    const hash = createHmac('sha512', secret).update(rawBody).digest('hex');
  return hash === signature;
}

