import { SignJWT, jwtVerify } from 'jose';
import { DatabaseUser } from './user-sync';

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-secret-key-change-in-production'
);

export interface SessionData {
  userId: string;
  email: string;
  role: string;
  isAuthenticated: boolean;
  [key: string]: unknown;
}

export class AuthTokenService {
  static async createSession(user: DatabaseUser): Promise<string> {
    const payload: SessionData = {
      userId: user.id,
      email: user.email,
      role: user.role,
      isAuthenticated: true,
    };

    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret);

    return token;
  }

  static async verifySession(token: string): Promise<SessionData | null> {
    try {
      const { payload } = await jwtVerify(token, secret);
      return payload as SessionData;
    } catch (error) {
      console.error('Token verification failed:', error);
      return null;
    }
  }

  static async refreshSession(currentToken: string): Promise<string | null> {
    const session = await this.verifySession(currentToken);
    if (!session) {
      return null;
    }

    // Create new token with same data but extended expiry
    const token = await new SignJWT(session)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret);

    return token;
  }
}

export function getSessionCookieOptions() {
  return {
    name: 'session',
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  };
}

export function clearSessionCookie() {
  return {
    ...getSessionCookieOptions(),
    value: '',
    maxAge: 0,
  };
}