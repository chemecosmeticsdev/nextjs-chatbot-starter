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
      // Validate token format before attempting verification
      if (!token || typeof token !== 'string' || token.trim() === '') {
        return null;
      }

      // Check if token has the basic JWT structure (three parts separated by dots)
      const parts = token.split('.');
      if (parts.length !== 3) {
        console.warn('Invalid JWT format: token does not have 3 parts');
        return null;
      }

      const { payload } = await jwtVerify(token, secret);
      return payload as SessionData;
    } catch (error: any) {
      // Only log actual verification errors, not format errors we already handled
      if (error?.code !== 'ERR_JWS_INVALID') {
        console.error('Token verification failed:', error);
      }
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

  static async verifyRequest(request: Request): Promise<SessionData | null> {
    try {
      // Extract token from Authorization header
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        if (token && this.isValidJWTFormat(token)) {
          const session = await this.verifySession(token);
          if (session) return session;
        }
      }

      // Extract token from cookies as fallback
      const cookieHeader = request.headers.get('cookie');
      if (cookieHeader) {
        try {
          const cookies = this.parseCookies(cookieHeader);
          const sessionToken = cookies['session'];

          if (sessionToken && sessionToken.trim() && this.isValidJWTFormat(sessionToken)) {
            const session = await this.verifySession(sessionToken);
            if (session) return session;
          }
        } catch (error) {
          // Cookie parsing errors are non-critical, continue to return null
        }
      }

      return null;
    } catch (error) {
      // Log unexpected errors but don't crash the request
      console.warn('Authentication error:', error);
      return null;
    }
  }

  private static isValidJWTFormat(token: string): boolean {
    if (!token || typeof token !== 'string') return false;

    // Basic JWT format check: should have exactly 3 parts separated by dots
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    // Each part should be non-empty base64-like string
    return parts.every(part => part.length > 0 && /^[A-Za-z0-9_-]+$/.test(part));
  }

  private static parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};

    cookieHeader.split(';').forEach(cookie => {
      const trimmedCookie = cookie.trim();
      const equalIndex = trimmedCookie.indexOf('=');

      if (equalIndex > 0) {
        const name = trimmedCookie.substring(0, equalIndex);
        const value = trimmedCookie.substring(equalIndex + 1);

        try {
          cookies[name] = decodeURIComponent(value);
        } catch {
          // If decoding fails, use raw value
          cookies[name] = value;
        }
      }
    });

    return cookies;
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