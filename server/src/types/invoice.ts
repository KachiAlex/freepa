export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void' | 'payment_pending';

export type InvoiceLineItem = {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
};
