import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { mockInvoices } from '../mocks/data';
import { getFirestoreInstance, getFunctionsInstance } from '../firebase/config';
import type { Invoice, InvoiceLineItem } from '../types/invoice';
import type { CurrencyCode, Money } from '../types/core';

type FirestoreInvoice = {
  clientId: string
  clientName: string
  currency: string
  dueDate: string
  issueDate: string
  lineItems?: Array<
    InvoiceLineItem & {
      id?: string
    }
  >
  notes?: string
  metadata?: Record<string, unknown>
  number: string
  organizationId: string
  status: Invoice['status']
  totals?: {
    subtotal: number
    tax: number
    total: number
  }
  paymentIntentUrl?: string
  pdfStatus?: string
  pdfUrl?: string
  pdfUpdatedAt?: Timestamp | string
  receiptPdfStatus?: string
  receiptPdfUrl?: string
  receiptPdfUpdatedAt?: Timestamp | string
  sentAt?: Timestamp | string
  voidedAt?: Timestamp | string
  createdAt?: Timestamp | string
  updatedAt?: Timestamp | string
}

const SUPPORTED_CURRENCIES: CurrencyCode[] = ['USD', 'NGN', 'GHS', 'KES', 'GBP', 'EUR'];

function normalizeCurrency(value?: string): CurrencyCode {
  const upper = value?.toUpperCase() as CurrencyCode | undefined;
  if (upper && SUPPORTED_CURRENCIES.includes(upper)) {
    return upper;
  }
  return 'USD';
}

function toMoney(amount: number, currency: CurrencyCode): Money {
  return { amount, currency };
}

function toIsoString(value?: Timestamp | string): string {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  return value.toDate().toISOString();
}

function calculateLineTotals(items: InvoiceLineItem[]) {
  return items.reduce(
    (acc, item) => {
      const subtotal = item.quantity * item.unitPrice;
      const tax = subtotal * (item.taxRate / 100);
      return {
        subtotal: acc.subtotal + subtotal,
        tax: acc.tax + tax,
        total: acc.total + subtotal + tax,
      };
    },
    { subtotal: 0, tax: 0, total: 0 },
  );
}

function mapInvoice(docId: string, data: FirestoreInvoice): Invoice {
  const currency = normalizeCurrency(data.currency);
  const lineItems: InvoiceLineItem[] = (data.lineItems ?? []).map((item, index) => {
    const subtotal = item.quantity * item.unitPrice;
    const tax = subtotal * (item.taxRate / 100);
    const total = subtotal + tax;
    return {
      id: item.id ?? String(index + 1),
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxRate: item.taxRate,
      total: toMoney(total, currency),
    };
  });

  const totals = data.totals ?? calculateLineTotals(lineItems);

  return {
    id: docId,
    organizationId: data.organizationId,
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
    number: data.number,
    clientId: data.clientId,
    clientName: data.clientName,
    status: data.status,
    issueDate: data.issueDate,
    dueDate: data.dueDate,
    currency,
    subtotal: toMoney(totals.subtotal, currency),
    taxTotal: toMoney(totals.tax, currency),
    total: toMoney(totals.total, currency),
    notes: data.notes,
    lineItems,
    paymentIntentUrl: data.paymentIntentUrl,
    metadata: data.metadata,
    pdfStatus: (data.pdfStatus as Invoice['pdfStatus']) ?? undefined,
    pdfUrl: data.pdfUrl,
    pdfUpdatedAt: data.pdfUpdatedAt ? toIsoString(data.pdfUpdatedAt) : undefined,
    receiptPdfStatus: (data.receiptPdfStatus as Invoice['receiptPdfStatus']) ?? undefined,
    receiptPdfUrl: data.receiptPdfUrl,
    receiptPdfUpdatedAt: data.receiptPdfUpdatedAt ? toIsoString(data.receiptPdfUpdatedAt) : undefined,
    sentAt: data.sentAt ? toIsoString(data.sentAt) : undefined,
    voidedAt: data.voidedAt ? toIsoString(data.voidedAt) : undefined,
  };
}

function fallbackInvoices(organizationId: string): Invoice[] {
  return mockInvoices.filter((invoice) => invoice.organizationId === organizationId);
}

export async function listInvoices(organizationId: string): Promise<Invoice[]> {
  const db = getFirestoreInstance();
  try {
    const invoicesRef = collection(db, 'organizations', organizationId, 'invoices');
    const snapshot = await getDocs(query(invoicesRef, orderBy('createdAt', 'desc')));

    return snapshot.docs.map((docSnap) => mapInvoice(docSnap.id, docSnap.data() as FirestoreInvoice));
  } catch (error) {
    console.warn('Falling back to mocked invoices', error);
    return fallbackInvoices(organizationId);
  }
}

export async function getInvoiceById(
  organizationId: string,
  invoiceId: string,
): Promise<Invoice | undefined> {
  const db = getFirestoreInstance();
  try {
    const invoiceRef = doc(db, 'organizations', organizationId, 'invoices', invoiceId);
    const snapshot = await getDoc(invoiceRef);
    if (!snapshot.exists()) {
      return undefined;
    }
    return mapInvoice(snapshot.id, snapshot.data() as FirestoreInvoice);
  } catch (error) {
    console.warn('Falling back to mocked invoice', error);
    return fallbackInvoices(organizationId).find((invoice) => invoice.id === invoiceId);
  }
}

export async function saveInvoice(payload: Partial<Invoice> & { organizationId: string }): Promise<Invoice> {
  const { organizationId } = payload;
  const currency = normalizeCurrency(payload.currency);

  const normalizedLineItems: InvoiceLineItem[] = (payload.lineItems ?? []).map((item, index) => ({
    id: item.id ?? String(index + 1),
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    taxRate: item.taxRate,
    total:
      item.total ??
      toMoney((item.quantity * item.unitPrice * (100 + item.taxRate)) / 100, currency),
  }));

  let targetInvoiceId = payload.id ?? null;

  if (!payload.id) {
    try {
      const functions = getFunctionsInstance();
      const createInvoice = httpsCallable(functions, 'createInvoice');
      const result = await createInvoice({
        organizationId,
        clientId: payload.clientId,
        clientName: payload.clientName,
        currency,
        dueDate: payload.dueDate,
        issueDate: payload.issueDate,
        lineItems: normalizedLineItems.map(({ total: _total, ...rest }) => rest),
        notes: payload.notes,
        metadata: payload.metadata,
      });
      if (result.data && typeof result.data === 'object' && result.data !== null) {
        const parsed = result.data as { id?: string };
        if (parsed.id) {
          targetInvoiceId = parsed.id;
        }
      }
    } catch (error) {
      console.warn('Falling back to mocked invoice creation', error);
      return createMockInvoice({ ...payload, currency });
    }
  } else {
    try {
      const functions = getFunctionsInstance();
      const updateInvoice = httpsCallable(functions, 'updateInvoice');
      await updateInvoice({
        organizationId,
        invoiceId: payload.id,
        lineItems: normalizedLineItems.map(({ total: _total, ...rest }) => rest),
        notes: payload.notes,
        status: payload.status,
        metadata: payload.metadata,
        paymentIntentUrl: payload.paymentIntentUrl,
      });
    } catch (error) {
      console.warn('Falling back to mocked invoice update', error);
      return updateMockInvoice({ ...payload, currency });
    }
  }

  const refreshed = await getInvoiceById(
    organizationId,
    targetInvoiceId ?? payload.id ?? '',
  );

  if (refreshed) {
    return refreshed;
  }

  return createMockInvoice({ ...payload, currency });
}

function createMockInvoice(payload: Partial<Invoice> & { organizationId: string }): Invoice {
  const next: Invoice = {
    id: `inv-${mockInvoices.length + 1}`,
    organizationId: payload.organizationId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    number: payload.number ?? `INV-${String(mockInvoices.length + 1).padStart(5, '0')}`,
    clientId: payload.clientId ?? 'client-1',
    clientName: payload.clientName ?? 'Acme Corporation',
    status: payload.status ?? 'draft',
    issueDate: payload.issueDate ?? new Date().toISOString(),
    dueDate: payload.dueDate ?? new Date().toISOString(),
    currency: payload.currency ?? 'USD',
    subtotal: payload.subtotal ?? toMoney(0, payload.currency ?? 'USD'),
    taxTotal: payload.taxTotal ?? toMoney(0, payload.currency ?? 'USD'),
    total: payload.total ?? toMoney(0, payload.currency ?? 'USD'),
    notes: payload.notes,
    lineItems: payload.lineItems ?? [],
    paymentIntentUrl: payload.paymentIntentUrl,
    metadata: payload.metadata,
    pdfStatus: payload.pdfStatus,
    pdfUrl: payload.pdfUrl,
    pdfUpdatedAt: payload.pdfUpdatedAt,
    receiptPdfStatus: payload.receiptPdfStatus,
    receiptPdfUrl: payload.receiptPdfUrl,
    receiptPdfUpdatedAt: payload.receiptPdfUpdatedAt,
  }

  mockInvoices.push(next)
  return next
}

function updateMockInvoice(payload: Partial<Invoice> & { organizationId: string }): Invoice {
  const existingIndex = mockInvoices.findIndex(
    (invoice) => invoice.organizationId === payload.organizationId && invoice.id === payload.id,
  )
  const existing = existingIndex >= 0 ? mockInvoices[existingIndex] : createMockInvoice(payload)
  const updated: Invoice = {
    ...existing,
    ...payload,
    updatedAt: new Date().toISOString(),
  }
  mockInvoices[existingIndex] = updated
  return updated
}

export async function updateInvoiceStatus(params: {
  organizationId: string
  invoiceId: string
  status: Invoice['status']
}): Promise<void> {
  const functions = getFunctionsInstance()
  const updateInvoice = httpsCallable(functions, 'updateInvoice')
  await updateInvoice({
    organizationId: params.organizationId,
    invoiceId: params.invoiceId,
    status: params.status,
  })
}

export async function requestInvoicePdf(params: {
  organizationId: string
  invoiceId: string
  type?: 'invoice' | 'receipt'
}): Promise<void> {
  const functions = getFunctionsInstance()
  const callable = httpsCallable(functions, 'requestInvoicePdf')
  await callable({
    organizationId: params.organizationId,
    invoiceId: params.invoiceId,
    type: params.type ?? 'invoice',
  })
}

