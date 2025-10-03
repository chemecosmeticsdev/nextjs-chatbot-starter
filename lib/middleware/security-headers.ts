import { NextRequest, NextResponse } from 'next/server';

export interface SecurityHeadersOptions {
  contentSecurityPolicy?: string | boolean;
  strictTransportSecurity?: string | boolean;
  xFrameOptions?: string | boolean;
  xContentTypeOptions?: boolean;
  xXssProtection?: string | boolean;
  referrerPolicy?: string;
  permissionsPolicy?: string;
  crossOriginEmbedderPolicy?: string;
  crossOriginOpenerPolicy?: string;
  crossOriginResourcePolicy?: string;
}

/**
 * Security headers middleware
 */
export function withSecurityHeaders(options: SecurityHeadersOptions = {}) {
  return async function securityHeadersMiddleware(
    request: NextRequest,
    next: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    const response = await next();

    // Apply security headers
    applySecurityHeaders(response, options);

    return response;
  };
}

/**
 * Apply security headers to response
 */
export function applySecurityHeaders(
  response: NextResponse,
  options: SecurityHeadersOptions = {}
): void {
  const {
    contentSecurityPolicy = getDefaultCSP(),
    strictTransportSecurity = 'max-age=31536000; includeSubDomains; preload',
    xFrameOptions = 'DENY',
    xContentTypeOptions = true,
    xXssProtection = '1; mode=block',
    referrerPolicy = 'strict-origin-when-cross-origin',
    permissionsPolicy = getDefaultPermissionsPolicy(),
    crossOriginEmbedderPolicy = 'require-corp',
    crossOriginOpenerPolicy = 'same-origin',
    crossOriginResourcePolicy = 'cross-origin',
  } = options;

  // Content Security Policy
  if (contentSecurityPolicy) {
    response.headers.set(
      'Content-Security-Policy',
      typeof contentSecurityPolicy === 'string'
        ? contentSecurityPolicy
        : getDefaultCSP()
    );
  }

  // HTTP Strict Transport Security
  if (strictTransportSecurity && process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      typeof strictTransportSecurity === 'string'
        ? strictTransportSecurity
        : 'max-age=31536000; includeSubDomains; preload'
    );
  }

  // X-Frame-Options
  if (xFrameOptions) {
    response.headers.set(
      'X-Frame-Options',
      typeof xFrameOptions === 'string' ? xFrameOptions : 'DENY'
    );
  }

  // X-Content-Type-Options
  if (xContentTypeOptions) {
    response.headers.set('X-Content-Type-Options', 'nosniff');
  }

  // X-XSS-Protection
  if (xXssProtection) {
    response.headers.set(
      'X-XSS-Protection',
      typeof xXssProtection === 'string' ? xXssProtection : '1; mode=block'
    );
  }

  // Referrer Policy
  if (referrerPolicy) {
    response.headers.set('Referrer-Policy', referrerPolicy);
  }

  // Permissions Policy
  if (permissionsPolicy) {
    response.headers.set('Permissions-Policy', permissionsPolicy);
  }

  // Cross-Origin Embedder Policy
  if (crossOriginEmbedderPolicy) {
    response.headers.set('Cross-Origin-Embedder-Policy', crossOriginEmbedderPolicy);
  }

  // Cross-Origin Opener Policy
  if (crossOriginOpenerPolicy) {
    response.headers.set('Cross-Origin-Opener-Policy', crossOriginOpenerPolicy);
  }

  // Cross-Origin Resource Policy
  if (crossOriginResourcePolicy) {
    response.headers.set('Cross-Origin-Resource-Policy', crossOriginResourcePolicy);
  }

  // Additional security headers
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set('X-Download-Options', 'noopen');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  response.headers.set('X-Powered-By', 'Chatbot System'); // Hide Next.js
}

/**
 * Get default Content Security Policy
 */
function getDefaultCSP(): string {
  const isDev = process.env.NODE_ENV === 'development';

  // Base policy
  const policy = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      isDev ? "'unsafe-eval'" : '', // Allow eval in development for hot reload
      "'unsafe-inline'", // Required for some React components
      'https://cdnjs.cloudflare.com',
      'https://unpkg.com',
    ].filter(Boolean),
    'style-src': [
      "'self'",
      "'unsafe-inline'", // Required for styled-components and CSS-in-JS
      'https://fonts.googleapis.com',
    ],
    'img-src': [
      "'self'",
      'data:',
      'blob:',
      'https:',
    ],
    'font-src': [
      "'self'",
      'https://fonts.gstatic.com',
    ],
    'connect-src': [
      "'self'",
      isDev ? 'ws://localhost:*' : '', // WebSocket for development
      isDev ? 'http://localhost:*' : '', // Development server
      'https://api.openai.com',
      'https://bedrock-runtime.*.amazonaws.com',
    ].filter(Boolean),
    'frame-ancestors': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-src': ["'none'"],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'media-src': ["'self'", 'data:', 'blob:'],
  };

  return Object.entries(policy)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');
}

/**
 * Get default Permissions Policy
 */
function getDefaultPermissionsPolicy(): string {
  return [
    'accelerometer=()',
    'ambient-light-sensor=()',
    'autoplay=()',
    'battery=()',
    'camera=()',
    'cross-origin-isolated=()',
    'display-capture=()',
    'document-domain=()',
    'encrypted-media=()',
    'execution-while-not-rendered=()',
    'execution-while-out-of-viewport=()',
    'fullscreen=()',
    'geolocation=()',
    'gyroscope=()',
    'keyboard-map=()',
    'magnetometer=()',
    'microphone=()',
    'midi=()',
    'navigation-override=()',
    'payment=()',
    'picture-in-picture=()',
    'publickey-credentials-get=()',
    'screen-wake-lock=()',
    'sync-xhr=()',
    'usb=()',
    'web-share=()',
    'xr-spatial-tracking=()',
  ].join(', ');
}

/**
 * Relaxed security headers for public widget endpoints
 */
export function publicWidgetHeaders() {
  return withSecurityHeaders({
    contentSecurityPolicy: getWidgetCSP(),
    xFrameOptions: false, // Allow embedding
    crossOriginResourcePolicy: 'cross-origin',
    crossOriginEmbedderPolicy: 'unsafe-none',
  });
}

/**
 * Get CSP for widget embedding
 */
function getWidgetCSP(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https:",
    "frame-ancestors *", // Allow embedding in any frame
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');
}

/**
 * Strict security headers for admin endpoints
 */
export function adminSecurityHeaders() {
  return withSecurityHeaders({
    contentSecurityPolicy: getAdminCSP(),
    xFrameOptions: 'DENY',
    crossOriginResourcePolicy: 'same-site',
    crossOriginEmbedderPolicy: 'require-corp',
    crossOriginOpenerPolicy: 'same-origin',
  });
}

/**
 * Get CSP for admin endpoints
 */
function getAdminCSP(): string {
  const isDev = process.env.NODE_ENV === 'development';

  return [
    "default-src 'self'",
    `script-src 'self' ${isDev ? "'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data:",
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src 'self' ${isDev ? 'ws://localhost:* http://localhost:*' : ''}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].filter(Boolean).join('; ');
}

/**
 * API security headers
 */
export function apiSecurityHeaders() {
  return withSecurityHeaders({
    contentSecurityPolicy: "default-src 'none'", // No content loading for API
    xFrameOptions: 'DENY',
    crossOriginResourcePolicy: 'cross-origin',
  });
}