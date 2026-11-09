import { Router } from 'express';
import { query } from '../db/pool';
import { toIso, type InvoiceRow } from '../lib/invoiceMapper';
import { assertOrgAccess, requireAuth } from '../middleware/auth';

export const paymentsRouter = Router({ mergeParams: true });

paymentsRouter.use(requireAuth);

type PaymentBlob = {
  provider?: 'flutterwave' | 'paystack';
  reference?: string;
  updatedAt?: string;
  reconciledAt?: string;
  reconciliation?: unknown;
  raw?: unknown;
  amount?: number;
};

// Payments are derived from invoices that carry an embedded `payment` blob.
paymentsRouter.get('/', async (req, res, next) => {
  try {
    const { organizationId } = req.params as { organizationId: string };
    assertOrgAccess(req.auth, organizationId);

    const result = await query<InvoiceRow>(
      `SELECT * FROM invoices
       WHERE organization_id = $1 AND payment IS NOT NULL
       ORDER BY updated_at DESC`,
      [organizationId],
    );

    const payments = result.rows.map((row) => {
      const payment = (row.payment ?? {}) as PaymentBlob;
      const totals = (row.totals ?? {}) as { total?: number };
      return {
        id: `${row.id}-${payment.reference ?? 'payment'}`,
        organizationId,
        invoiceId: row.id,
        invoiceNumber: row.number,
        provider: payment.provider,
        reference: payment.reference,
        status: row.status === 'paid' ? 'settled' : 'pending',
        amount: {
          amount: totals.total ?? payment.amount ?? 0,
          currency: row.currency,
        },
        createdAt: toIso(payment.updatedAt as string) ?? toIso(row.created_at),
        settledAt: toIso(payment.reconciledAt as string),
        raw: (payment.reconciliation ?? payment.raw) as Record<string, unknown> | undefined,
        updatedAt: toIso(payment.updatedAt as string) ?? toIso(row.updated_at),
      };
    });

    res.json(payments);
  } catch (error) {
    next(error);
  }
});
