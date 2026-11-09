import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { config } from './config';
import { pool } from './db/pool';
import { runMigrations } from './db/migrate';
import { ApiError, toApiError } from './lib/errors';
import { authRouter } from './routes/auth';
import { organizationsRouter } from './routes/organizations';
import { invoicesRouter } from './routes/invoices';
import { clientsRouter } from './routes/clients';
import { paymentsRouter } from './routes/payments';
import { uploadsRouter } from './routes/uploads';
import { adminRouter } from './routes/admin';
import { publicApiRouter } from './routes/publicApi';
import { webhooksRouter } from './routes/webhooks';
import { startReconcileJob } from './jobs/reconcilePayments';

const app = express();

app.use(cors({ origin: true }));

// Webhooks need the raw body for signature verification — mount before JSON.
app.use('/webhooks', webhooksRouter);

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api/organizations', organizationsRouter);
app.use('/api/organizations/:organizationId/invoices', invoicesRouter);
app.use('/api/organizations/:organizationId/clients', clientsRouter);
app.use('/api/organizations/:organizationId/payments', paymentsRouter);
app.use('/api/organizations/:organizationId/uploads', uploadsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/v1', publicApiRouter);

app.use('/uploads', express.static(config.uploadDir));

// Static frontend + SPA fallback.
if (fs.existsSync(config.frontendDist)) {
  app.use(express.static(config.frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/webhooks/') || req.path.startsWith('/uploads/')) {
      next();
      return;
    }
    res.sendFile(path.join(config.frontendDist, 'index.html'));
  });
}

// 404 for unmatched API routes.
app.use((req, res) => {
  res.status(404).json({ error: 'not_found', message: `No route for ${req.method} ${req.path}` });
});

// Central error handler.
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof multer.MulterError) {
      const apiError =
        error.code === 'LIMIT_FILE_SIZE'
          ? new ApiError(400, 'file_too_large', 'File exceeds the 3MB limit.')
          : new ApiError(400, 'upload_failed', error.message);
      res.status(apiError.statusCode).json({ error: apiError.code, message: apiError.message });
      return;
    }

    const apiError = toApiError(error);
    if (apiError.statusCode >= 500) {
      console.error('Unhandled API error', error);
    }
    res
      .status(apiError.statusCode)
      .json({ error: apiError.code, message: apiError.message, details: apiError.details });
  },
);

async function main() {
  await runMigrations();
  fs.mkdirSync(config.uploadDir, { recursive: true });
  startReconcileJob();

  app.listen(config.port, () => {
    console.log(`FreePA server listening on http://localhost:${config.port}`);
  });
}

main().catch(async (error) => {
  console.error('Failed to start server', error);
  await pool.end();
  process.exit(1);
});
