import { Router, raw } from 'express';
import { query } from '../db/pool';
import { verifyWebhookSignature } from '../services/paymentProviders';

export const webhooksRouter = Router();

// Raw body is required for HMAC signature verification.
webhooksRouter.use(raw({ type: 'application/json' }));

function parseBody(req: { body: unknown }): Record<string, unknown> {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');
  return JSON.parse(rawBody) as Record<string, unknown>;
}

webhooksRouter.post('/flutterwave', async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const isValid = verifyWebhookSignature('flutterwave', rawBody, req.header('verif-hash'));
  if (!isValid) {
    res.status(400).send('Invalid signature');
    return;
  }

  try {
    const event = parseBody(req) as {
      data?: { status?: string; id?: string | number; meta?: { organizationId?: string; invoiceId?: string } };
    };
    const organizationId = event.data?.meta?.organizationId;
    const invoiceId = event.data?.meta?.invoiceId;

    if (!organizationId || !invoiceId) {
      res.status(400).send('Missing metadata');
      return;
    }

    await query(
      `UPDATE invoices
       SET status = $3,
           payment = jsonb_build_object(
             'provider', 'flutterwave',
             'reference', $4,
             'raw', $5::jsonb,
             'updatedAt', to_jsonb(now())
           ),
           updated_at = now()
       WHERE id = $1 AND organization_id = $2`,
      [
        invoiceId,
        organizationId,
        event.data?.status === 'successful' ? 'paid' : 'payment_pending',
        String(event.data?.id ?? ''),
        JSON.stringify(event),
      ],
    );

    res.status(200).send('ok');
  } catch (error) {
    console.error('Flutterwave webhook failed', error);
    res.status(400).send('Invalid payload');
  }
});

webhooksRouter.post('/paystack', async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const isValid = verifyWebhookSignature('paystack', rawBody, req.header('x-paystack-signature'));
  if (!isValid) {
    res.status(400).send('Invalid signature');
    return;
  }

  try {
    const event = parseBody(req) as {
      event?: string;
      data?: { reference?: string; metadata?: { organizationId?: string; invoiceId?: string } };
    };
    const organizationId = event.data?.metadata?.organizationId;
    const invoiceId = event.data?.metadata?.invoiceId;

    if (!organizationId || !invoiceId) {
      res.status(400).send('Missing metadata');
      return;
    }

    await query(
      `UPDATE invoices
       SET status = $3,
           payment = jsonb_build_object(
             'provider', 'paystack',
             'reference', $4,
             'raw', $5::jsonb,
             'updatedAt', to_jsonb(now())
           ),
           updated_at = now()
       WHERE id = $1 AND organization_id = $2`,
      [
        invoiceId,
        organizationId,
        event.event === 'charge.success' ? 'paid' : 'payment_pending',
        event.data?.reference ?? '',
        JSON.stringify(event),
      ],
    );

    res.status(200).send('ok');
  } catch (error) {
    console.error('Paystack webhook failed', error);
    res.status(400).send('Invalid payload');
  }
});
