import type { CurrencyCode, EntityMetadata, Money, Timestamp } from './core';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void' | 'payment_pending';

export type InvoiceLineItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  total: Money;
};

export type Invoice = EntityMetadata & {
  number: string;
  clientId: string;
  clientName: string;
  status: InvoiceStatus;
  issueDate: Timestamp;
  dueDate: Timestamp;
  currency: CurrencyCode;
  subtotal: Money;
  taxTotal: Money;
  total: Money;
  notes?: string;
  lineItems: InvoiceLineItem[];
  paymentIntentUrl?: string;
  pdfStatus?: 'processing' | 'ready' | 'error';
  pdfUrl?: string;
  pdfUpdatedAt?: Timestamp;
  receiptPdfStatus?: 'processing' | 'ready' | 'error';
  receiptPdfUrl?: string;
  receiptPdfUpdatedAt?: Timestamp;
  metadata?: Record<string, unknown>;
  sentAt?: Timestamp;
  voidedAt?: Timestamp;
};

