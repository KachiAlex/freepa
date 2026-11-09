import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { query } from '../db/pool';
import { ApiError } from '../lib/errors';

export type AuthContext = {
  uid: string;
  email: string | null;
  platformAdmin: boolean;
  organizations: string[];
  orgRoles: Record<string, string>;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      apiContext?: { type: 'token'; uid: string; email?: string | null } | { type: 'apiKey' };
    }
  }
}

export function signToken(uid: string): string {
  return jwt.sign({ uid }, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as jwt.SignOptions);
}

async function loadAuthContext(uid: string): Promise<AuthContext | null> {
  const userResult = await query<{
    id: string;
    email: string | null;
    platform_admin: boolean;
  }>('SELECT id, email, platform_admin FROM users WHERE id = $1', [uid]);

  const user = userResult.rows[0];
  if (!user) {
    return null;
  }

  const memberships = await query<{ organization_id: string; role: string }>(
    'SELECT organization_id, role FROM members WHERE user_id = $1',
    [uid],
  );

  const organizations: string[] = [];
  const orgRoles: Record<string, string> = {};
  for (const row of memberships.rows) {
    organizations.push(row.organization_id);
    orgRoles[row.organization_id] = row.role;
  }

  return {
    uid: user.id,
    email: user.email,
    platformAdmin: user.platform_admin,
    organizations,
    orgRoles,
  };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      throw new ApiError(401, 'missing_auth_token', 'Authorization header missing.');
    }

    const decoded = jwt.verify(token, config.jwtSecret) as { uid?: string };
    if (!decoded.uid) {
      throw new ApiError(401, 'invalid_token', 'Unable to verify token.');
    }

    const context = await loadAuthContext(decoded.uid);
    if (!context) {
      throw new ApiError(401, 'invalid_token', 'Unable to verify token.');
    }

    req.auth = context;
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) {
    next(new ApiError(401, 'unauthenticated', 'Authentication required.'));
    return;
  }
  if (req.auth.platformAdmin !== true) {
    next(new ApiError(403, 'permission-denied', 'Platform admin privileges required.'));
    return;
  }
  next();
}

export function assertOrgAccess(auth: AuthContext | undefined, organizationId: string) {
  if (!auth) {
    throw new ApiError(401, 'unauthenticated', 'Authentication required.');
  }
  if (auth.platformAdmin) {
    return;
  }
  if (!auth.organizations.includes(organizationId)) {
    throw new ApiError(403, 'permission-denied', 'Missing organization access.');
  }
}

export function assertOrgRole(
  auth: AuthContext | undefined,
  organizationId: string,
  allowedRoles: string[],
) {
  if (!auth) {
    throw new ApiError(401, 'unauthenticated', 'Authentication required.');
  }
  if (auth.platformAdmin) {
    return;
  }
  const role = auth.orgRoles[organizationId];
  if (!role || !allowedRoles.includes(role)) {
    throw new ApiError(403, 'permission-denied', 'Insufficient role for operation.');
  }
}
