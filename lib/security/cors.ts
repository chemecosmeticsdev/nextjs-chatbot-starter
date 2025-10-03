import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/index';
import { corsWhitelist } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export interface CorsOptions {
  allowedOrigins?: string[] | '*';
  allowedMethods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
  dynamicOrigins?: boolean; // Check database for allowed origins
  devMode?: boolean; // Allow localhost in development
}

export interface CorsResult {
  allowed: boolean;
  headers: Record<string, string>;
  origin?: string;
}

/**
 * CORS configuration service
 */
export class CorsService {
  private static cache = new Map<string, { allowed: boolean; timestamp: number }>();
  private static cacheTimeout = 5 * 60 * 1000; // 5 minutes

  /**
   * Get CORS headers for a request
   */
  static async getCorsHeaders(
    request: NextRequest,
    options: CorsOptions = {}
  ): Promise<CorsResult> {
    const {
      allowedOrigins = [],
      allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders = [
        'Accept',
        'Accept-Language',
        'Content-Language',
        'Content-Type',
        'Authorization',
        'X-API-Key',
        'X-Requested-With'
      ],
      exposedHeaders = ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
      credentials = true,
      maxAge = 86400, // 24 hours
      dynamicOrigins = true,
      devMode = process.env.NODE_ENV === 'development'
    } = options;

    const origin = request.headers.get('origin');

    if (!origin) {
      // No origin header (likely same-origin request)
      return {
        allowed: true,
        headers: this.getBasicHeaders(allowedMethods, allowedHeaders, exposedHeaders, maxAge)
      };
    }

    // Check if origin is allowed
    const isAllowed = await this.isOriginAllowed(
      origin,
      allowedOrigins,
      dynamicOrigins,
      devMode
    );

    if (!isAllowed) {
      return {
        allowed: false,
        headers: {},
        origin
      };
    }

    const headers = {
      ...this.getBasicHeaders(allowedMethods, allowedHeaders, exposedHeaders, maxAge),
      'Access-Control-Allow-Origin': origin,
    };

    if (credentials) {
      headers['Access-Control-Allow-Credentials'] = 'true';
    }

    return {
      allowed: true,
      headers,
      origin
    };
  }

  /**
   * Check if origin is allowed
   */
  private static async isOriginAllowed(
    origin: string,
    allowedOrigins: string[] | '*',
    dynamicOrigins: boolean,
    devMode: boolean
  ): Promise<boolean> {
    // Allow all origins if specified
    if (allowedOrigins === '*') {
      return true;
    }

    // Check development mode localhost
    if (devMode && this.isLocalhost(origin)) {
      return true;
    }

    // Check static allowed origins
    if (Array.isArray(allowedOrigins) && allowedOrigins.length > 0) {
      if (this.matchesOrigin(origin, allowedOrigins)) {
        return true;
      }
    }

    // Check database whitelist if enabled
    if (dynamicOrigins) {
      return await this.isDatabaseOriginAllowed(origin);
    }

    return false;
  }

  /**
   * Check if origin matches any in the allowed list
   */
  private static matchesOrigin(origin: string, allowedOrigins: string[]): boolean {
    const normalizedOrigin = this.normalizeOrigin(origin);

    return allowedOrigins.some(allowed => {
      const normalizedAllowed = this.normalizeOrigin(allowed);

      // Exact match
      if (normalizedOrigin === normalizedAllowed) {
        return true;
      }

      // Wildcard subdomain match (*.example.com)
      if (normalizedAllowed.startsWith('*.')) {
        const domain = normalizedAllowed.substring(2);
        return normalizedOrigin.endsWith('.' + domain) || normalizedOrigin === domain;
      }

      return false;
    });
  }

  /**
   * Check if origin is allowed in database
   */
  private static async isDatabaseOriginAllowed(origin: string): Promise<boolean> {
    try {
      const domain = this.extractDomain(origin);

      // Check cache first
      const cacheKey = `cors:${domain}`;
      const cached = this.cache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.allowed;
      }

      // Query database
      const allowed = await db
        .select()
        .from(corsWhitelist)
        .where(eq(corsWhitelist.domain, domain))
        .limit(1);

      const isAllowed = allowed.length > 0 && allowed[0].isActive;

      // Cache result
      this.cache.set(cacheKey, {
        allowed: isAllowed,
        timestamp: Date.now()
      });

      return isAllowed;
    } catch (error) {
      console.error('Database CORS check error:', error);
      return false;
    }
  }

  /**
   * Get basic CORS headers
   */
  private static getBasicHeaders(
    methods: string[],
    headers: string[],
    exposedHeaders: string[],
    maxAge: number
  ): Record<string, string> {
    return {
      'Access-Control-Allow-Methods': methods.join(', '),
      'Access-Control-Allow-Headers': headers.join(', '),
      'Access-Control-Expose-Headers': exposedHeaders.join(', '),
      'Access-Control-Max-Age': maxAge.toString(),
      'Vary': 'Origin',
    };
  }

  /**
   * Normalize origin for comparison
   */
  private static normalizeOrigin(origin: string): string {
    try {
      const url = new URL(origin);
      return `${url.protocol}//${url.host}`.toLowerCase();
    } catch {
      return origin.toLowerCase();
    }
  }

  /**
   * Extract domain from origin
   */
  private static extractDomain(origin: string): string {
    try {
      return new URL(origin).hostname.toLowerCase();
    } catch {
      return origin.toLowerCase();
    }
  }

  /**
   * Check if origin is localhost (for development)
   */
  private static isLocalhost(origin: string): boolean {
    try {
      const url = new URL(origin);
      const hostname = url.hostname.toLowerCase();
      return hostname === 'localhost' ||
             hostname === '127.0.0.1' ||
             hostname === '::1' ||
             hostname.endsWith('.local');
    } catch {
      return false;
    }
  }

  /**
   * Add domain to CORS whitelist
   */
  static async addDomain(
    domain: string,
    description: string,
    addedBy: string
  ): Promise<boolean> {
    try {
      await db.insert(corsWhitelist).values({
        domain: domain.toLowerCase(),
        description,
        isActive: true,
        addedBy,
      });

      // Clear cache for this domain
      this.cache.delete(`cors:${domain.toLowerCase()}`);

      return true;
    } catch (error) {
      console.error('Error adding CORS domain:', error);
      return false;
    }
  }

  /**
   * Remove domain from CORS whitelist
   */
  static async removeDomain(domain: string): Promise<boolean> {
    try {
      await db
        .update(corsWhitelist)
        .set({ isActive: false })
        .where(eq(corsWhitelist.domain, domain.toLowerCase()));

      // Clear cache for this domain
      this.cache.delete(`cors:${domain.toLowerCase()}`);

      return true;
    } catch (error) {
      console.error('Error removing CORS domain:', error);
      return false;
    }
  }

  /**
   * Clear CORS cache
   */
  static clearCache(): void {
    this.cache.clear();
  }
}

/**
 * CORS middleware for API routes
 */
export function withCors(options: CorsOptions = {}) {
  return async function corsMiddleware(
    request: NextRequest,
    next: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      const corsResult = await CorsService.getCorsHeaders(request, options);

      if (!corsResult.allowed) {
        return new NextResponse(null, {
          status: 403,
          statusText: 'Forbidden - CORS policy violation'
        });
      }

      return new NextResponse(null, {
        status: 200,
        headers: corsResult.headers
      });
    }

    // Process actual request
    const corsResult = await CorsService.getCorsHeaders(request, options);

    if (!corsResult.allowed) {
      return new NextResponse(null, {
        status: 403,
        statusText: 'Forbidden - CORS policy violation'
      });
    }

    const response = await next();

    // Add CORS headers to response
    Object.entries(corsResult.headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  };
}

/**
 * Strict CORS for admin endpoints
 */
export function adminCors() {
  return withCors({
    allowedOrigins: process.env.NODE_ENV === 'development'
      ? ['http://localhost:3000', 'https://localhost:3000']
      : [], // Only specific domains in production
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
    dynamicOrigins: false,
  });
}

/**
 * Public CORS for widget embedding
 */
export function publicCors() {
  return withCors({
    allowedOrigins: '*', // Allow any origin for public widgets
    allowedMethods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'X-API-Key',
      'X-Requested-With'
    ],
    credentials: false,
    dynamicOrigins: true, // Check database whitelist
  });
}

/**
 * API CORS for external integrations
 */
export function apiCors() {
  return withCors({
    allowedOrigins: [], // Must be explicitly allowed
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-API-Key',
      'X-Requested-With'
    ],
    credentials: false,
    dynamicOrigins: true,
  });
}