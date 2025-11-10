export type InvoiceLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
};

export type InvoiceDocument = {
  organizationId: string;
  clientId: string;
  currency: string;
  dueDate: string;
  issueDate: string;
  lineItems: InvoiceLineItem[];
  notes?: string;
  metadata?: Record<string, unknown>;
  number: string;
  totals: {
    subtotal: number;
    tax: number;
    total: number;
  };
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'void' | 'payment_pending';
  createdAt: FirebaseFirestore.FieldValue;
  updatedAt: FirebaseFirestore.FieldValue;
};

export type InvoiceCounterDocument = {
  current: number;
  updatedAt: FirebaseFirestore.FieldValue;
};

