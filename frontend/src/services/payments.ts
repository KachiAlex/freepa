import { apiFetch, apiJson } from '../api/client';
import { mockPayments, mockInvoices } from '../mocks/data';
import type { Payment } from '../types/payment';
import type { Invoice } from '../types/invoice';
import { toMoney } from '../utils/money';

type ApiPayment = {
  id: string
  organizationId: string
  invoiceId: string
  invoiceNumber?: string
  provider?: Payment['provider']
  reference?: string
  status?: string
  amount?: { amount?: number; currency?: string }
  createdAt?: string
  updatedAt?: string
  settledAt?: string
  raw?: Record<string, unknown>
}

function resolvePaymentUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const record = payload as Record<string, unknown>
  const data = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : undefined

  const candidates: unknown[] = [
    data?.link,
    data?.authorization_url,
    data?.redirect_url,
    record.link,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate
    }
  }

  return null
}

export async function listPayments(organizationId: string): Promise<Payment[]> {
  try {
    const payments = await apiFetch<ApiPayment[]>(`/api/organizations/${organizationId}/payments`);

    return payments.map((payment) => {
      const fallback = mockInvoices.find(
        (mock) => mock.organizationId === organizationId && mock.id === payment.invoiceId,
      );
      const amountValue = payment.amount?.amount ?? fallback?.total.amount ?? 0;
      const currency = payment.amount?.currency ?? fallback?.total.currency ?? 'USD';

      return {
        id: payment.id,
        organizationId,
        invoiceId: payment.invoiceId,
        invoiceNumber: payment.invoiceNumber ?? payment.invoiceId.toUpperCase(),
        provider: payment.provider ?? 'flutterwave',
        reference: payment.reference ?? '',
        status: (payment.status ?? 'pending') as Payment['status'],
        amount: toMoney(amountValue, currency),
        createdAt: payment.createdAt ?? new Date().toISOString(),
        settledAt: payment.settledAt,
        raw: payment.raw,
        updatedAt: payment.updatedAt ?? new Date().toISOString(),
      } satisfies Payment;
    });
  } catch (error) {
    console.warn('Falling back to mocked payments', error);
    return mockPayments.filter((payment) => payment.organizationId === organizationId);
  }
}

export async function createPaymentIntent(params: {
  organizationId: string;
  invoice: Invoice;
  provider: 'flutterwave' | 'paystack';
  customerEmail: string;
}): Promise<string | null> {
  const response = await apiJson<unknown>(
    'POST',
    `/api/organizations/${params.organizationId}/invoices/${params.invoice.id}/payment-intent`,
    {
      provider: params.provider,
      amount: params.invoice.total.amount,
      currency: params.invoice.currency,
      customerEmail: params.customerEmail,
      metadata: {
        clientName: params.invoice.clientName,
        invoiceNumber: params.invoice.number,
        customerEmail: params.customerEmail,
      },
    },
  );

  const paymentUrl = resolvePaymentUrl(response);

  if (paymentUrl) {
    await apiJson(
      'PATCH',
      `/api/organizations/${params.organizationId}/invoices/${params.invoice.id}`,
      {
        paymentIntentUrl: paymentUrl,
        status: params.invoice.status === 'paid' ? params.invoice.status : 'payment_pending',
      },
    );
  }

  return paymentUrl;
}
