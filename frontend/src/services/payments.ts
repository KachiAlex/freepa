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
import { collection, getDocs, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { mockPayments, mockInvoices } from '../mocks/data';
import type { Payment } from '../types/payment';
import type { Invoice } from '../types/invoice';
import { getFirestoreInstance, getFunctionsInstance } from '../firebase/config';
import { toMoney } from '../utils/money';

type FirestorePayment = {
  provider: Payment['provider']
  reference: string
  reconciliation?: unknown
  reconciledAt?: Timestamp | string
  updatedAt?: Timestamp | string
}

type FirestoreInvoiceWithPayment = {
  number: string
  total?: { amount: number; currency: string }
  totals?: { total: number }
  currency?: string
  payment?: FirestorePayment
  status?: string
  createdAt?: Timestamp | string
}

function toIso(value?: Timestamp | string): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return value
  return value.toDate().toISOString()
}

export async function listPayments(organizationId: string): Promise<Payment[]> {
  const db = getFirestoreInstance();
  try {
    const invoicesRef = collection(db, 'organizations', organizationId, 'invoices');
    const snapshot = await getDocs(invoicesRef);

    const payments: Payment[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as FirestoreInvoiceWithPayment;
      if (!data.payment) {
        return;
      }

      const amountValue =
        data.total?.amount ??
        data.totals?.total ??
        mockInvoices.find((mock) => mock.organizationId === organizationId && mock.id === docSnap.id)?.total.amount ??
        0;
      const currency =
        data.total?.currency ??
        data.currency ??
        mockInvoices.find((mock) => mock.organizationId === organizationId && mock.id === docSnap.id)?.total.currency ??
        'USD';

      payments.push({
        id: `${docSnap.id}-${data.payment.reference}`,
        organizationId,
        invoiceId: docSnap.id,
        invoiceNumber: data.number ?? docSnap.id.toUpperCase(),
        provider: data.payment.provider,
        reference: data.payment.reference,
        status: (data.status === 'paid' ? 'settled' : 'pending') as Payment['status'],
        amount: toMoney(amountValue, currency),
        createdAt: toIso(data.payment.updatedAt) ?? new Date().toISOString(),
        settledAt: toIso(data.payment.reconciledAt),
        raw: data.payment.reconciliation as Record<string, unknown> | undefined,
        updatedAt: toIso(data.payment.updatedAt) ?? new Date().toISOString(),
      });
    });

    return payments.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
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
  const functions = getFunctionsInstance();
  const callable = httpsCallable(functions, 'submitPaymentIntent');

  const response = await callable({
    organizationId: params.organizationId,
    invoiceId: params.invoice.id,
    provider: params.provider,
    amount: params.invoice.total.amount,
    currency: params.invoice.currency,
    customerEmail: params.customerEmail,
    metadata: {
      clientName: params.invoice.clientName,
      invoiceNumber: params.invoice.number,
      customerEmail: params.customerEmail,
    },
  });

  const paymentUrl = resolvePaymentUrl(response.data);

  if (paymentUrl) {
    const updateInvoice = httpsCallable(functions, 'updateInvoice');
    await updateInvoice({
      organizationId: params.organizationId,
      invoiceId: params.invoice.id,
      paymentIntentUrl: paymentUrl,
      status: params.invoice.status === 'paid' ? params.invoice.status : 'payment_pending',
    });
  }

  return paymentUrl;
}

