export type InvoiceRow = {
  id: string;
  organization_id: string;
  number: string;
  client_id: string;
  client_name: string;
  status: string;
  issue_date: string;
  due_date: string;
  currency: string;
  line_items: unknown;
  totals: { subtotal?: number; tax?: number; total?: number } | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  payment: Record<string, unknown> | null;
  payment_intent: unknown;
  payment_intent_url: string | null;
  pdf_status: string | null;
  pdf_url: string | null;
  pdf_updated_at: Date | string | null;
  receipt_pdf_status: string | null;
  receipt_pdf_url: string | null;
  receipt_pdf_updated_at: Date | string | null;
  sent_at: Date | string | null;
  voided_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export function toIso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  return value.toISOString();
}

// Maps a Postgres invoice row to the JSON shape the React client expects
// (camelCase, identical to the previous Firestore document shape).
export function mapInvoiceRow(row: InvoiceRow) {
  const totals = row.totals ?? {};

  return {
    id: row.id,
    organizationId: row.organization_id,
    number: row.number,
    clientId: row.client_id,
    clientName: row.client_name,
    status: row.status,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    currency: row.currency,
    lineItems: row.line_items ?? [],
    totals: {
      subtotal: totals.subtotal ?? 0,
      tax: totals.tax ?? 0,
      total: totals.total ?? 0,
    },
    notes: row.notes ?? undefined,
    metadata: row.metadata ?? {},
    payment: row.payment ?? undefined,
    paymentIntentUrl: row.payment_intent_url ?? undefined,
    pdfStatus: row.pdf_status ?? undefined,
    pdfUrl: row.pdf_url ?? undefined,
    pdfUpdatedAt: toIso(row.pdf_updated_at),
    receiptPdfStatus: row.receipt_pdf_status ?? undefined,
    receiptPdfUrl: row.receipt_pdf_url ?? undefined,
    receiptPdfUpdatedAt: toIso(row.receipt_pdf_updated_at),
    sentAt: toIso(row.sent_at),
    voidedAt: toIso(row.voided_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}
