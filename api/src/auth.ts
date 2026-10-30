import type { NextFunction, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import type pg from 'pg';

export type AppRole = 'admin' | 'mc' | 'pd' | 'viewer';

export interface User {
  id: number;
  nickname: string;
  email: string;
  role: AppRole;
  position: 'mc' | 'pd' | 'operation';
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
  }
}

/**
 * iap: Cloud Run sits behind IAP, which signs every request. The signed JWT is
 *      checked against IAP_AUDIENCE, so a forged email header gets nowhere.
 * dev: no Google sign-in. The web app's user switcher sends X-Dev-User (an email);
 *      without it the first active admin is used.
 */
export type AuthConfig = { mode: 'iap'; audience: string } | { mode: 'dev' };

export function authConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const mode = env.AUTH_MODE ?? (env.NODE_ENV === 'production' ? 'iap' : 'dev');
  if (mode === 'dev') return { mode: 'dev' };
  if (mode !== 'iap') throw new Error(`AUTH_MODE must be iap or dev, not ${mode}`);
  if (!env.IAP_AUDIENCE) {
    throw new Error('AUTH_MODE=iap needs IAP_AUDIENCE (/projects/<number>/locations/<region>/services/<service>)');
  }
  return { mode: 'iap', audience: env.IAP_AUDIENCE };
}

const IAP_ISSUER = 'https://cloud.google.com/iap';
const oauth = new OAuth2Client();

async function iapEmail(req: Request, audience: string): Promise<string | undefined> {
  const jwt = req.header('x-goog-iap-jwt-assertion');
  if (!jwt) return undefined;
  try {
    const { pubkeys } = await oauth.getIapPublicKeys(); // cached by the library
    const ticket = await oauth.verifySignedJwtWithCertsAsync(jwt, pubkeys, audience, [IAP_ISSUER]);
    return ticket.getPayload()?.email;
  } catch {
    return undefined;
  }
}

const userSelect = `SELECT id::int, nickname, email, app_role AS role, position FROM people WHERE is_active`;

export async function findUser(db: Pick<pg.Pool, 'query'>, email: string): Promise<User | undefined> {
  const { rows } = await db.query(`${userSelect} AND lower(email) = lower($1)`, [email]);
  return rows[0];
}

export function authenticate(pool: pg.Pool, config: AuthConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    let user: User | undefined;
    let email: string | undefined;
    if (config.mode === 'iap') {
      email = await iapEmail(req, config.audience);
      if (!email) {
        res.status(401).json({ error: 'not_signed_in' });
        return;
      }
      user = await findUser(pool, email);
    } else {
      email = req.header('x-dev-user');
      if (email) user = await findUser(pool, email);
      else {
        const { rows } = await pool.query(`${userSelect} AND app_role = 'admin' AND email IS NOT NULL ORDER BY id LIMIT 1`);
        user = rows[0];
      }
    }
    if (!user) {
      // Signed in with Google but not on the team list (or the list has no email for them).
      res.status(403).json({ error: 'not_registered', email: email ?? null });
      return;
    }
    req.user = user;
    next();
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role === 'admin') next();
  else res.status(403).json({ error: 'admin_only' });
}
