import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/pool';
import { ApiError } from '../lib/errors';
import { requireAuth, signToken } from '../middleware/auth';

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

authRouter.post('/signup', async (req, res, next) => {
  try {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'invalid_payload', 'Invalid signup payload.', parsed.error.flatten());
    }

    const email = parsed.data.email.trim().toLowerCase();
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      throw new ApiError(409, 'email_in_use', 'An account already exists for this email.');
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const result = await query<{ id: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id`,
      [email, passwordHash],
    );

    res.status(201).json({ token: signToken(result.rows[0].id) });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/signin', async (req, res, next) => {
  try {
    const parsed = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'invalid_payload', 'Invalid signin payload.', parsed.error.flatten());
    }

    const email = parsed.data.email.trim().toLowerCase();
    const result = await query<{ id: string; password_hash: string }>(
      'SELECT id, password_hash FROM users WHERE email = $1',
      [email],
    );

    const user = result.rows[0];
    const passwordOk = user ? await bcrypt.compare(parsed.data.password, user.password_hash) : false;
    if (!user || !passwordOk) {
      throw new ApiError(401, 'invalid_credentials', 'Invalid email or password.');
    }

    res.json({ token: signToken(user.id) });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/reset-password', async (req, res, next) => {
  try {
    const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, 'invalid_payload', 'Invalid email provided.', parsed.error.flatten());
    }
    // No mail provider is configured in the self-hosted deployment. The account
    // existence check is intentionally skipped to avoid user enumeration; ask a
    // platform admin (or run a DB script) to rotate the password hash.
    console.info(`Password reset requested for ${parsed.data.email} — no mailer configured.`);
    res.status(202).json({ ok: true, message: 'Password reset is not configured on this deployment.' });
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', requireAuth, (req, res) => {
  const auth = req.auth!;
  res.json({
    user: { uid: auth.uid, email: auth.email },
    organizations: auth.organizations,
    orgRoles: auth.orgRoles,
    platformAdmin: auth.platformAdmin,
  });
});
