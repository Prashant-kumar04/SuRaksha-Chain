import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

const envSecret = process.env.JWT_SECRET;
const insecureSecrets = new Set(['suraksha-chain-dev-secret-local-only', 'secret', 'development-secret', 'jwt-secret', 'changeme']);
if (process.env.NODE_ENV === 'production' && (!envSecret || envSecret.length < 32 || insecureSecrets.has(envSecret))) {
  throw new Error('CRITICAL SECURITY CONFIGURATION: production JWT_SECRET must be a unique random value of at least 32 characters.');
}
export const JWT_SECRET = envSecret || 'suraksha-chain-dev-secret-local-only';

export interface AuthenticatedUser {
  user_id: string;
  name: string;
  role: string;
  department?: string;
  jurisdiction?: string;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token provided. Log in first.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Requires role: ${roles.join(' or ')}. Your role: ${req.user.role}.`,
      });
    }
    next();
  };
}
