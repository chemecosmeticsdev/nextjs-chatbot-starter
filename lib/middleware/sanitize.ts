import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createValidator } from '@/lib/security/validation';

export interface SanitizationOptions {
  maxBodySize?: number; // Maximum request body size in bytes
  allowedContentTypes?: string[]; // Allowed content types
  validateSchema?: z.ZodSchema<any>; // Zod schema for validation
  sanitizeHeaders?: boolean; // Whether to sanitize headers
  logViolations?: boolean; // Whether to log security violations
}

interface SecurityViolation {
  type: 'oversized_request' | 'invalid_content_type' | 'validation_error' | 'malicious_header';
  details: string;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Request sanitization and validation middleware
 */
export function withSanitization(options: SanitizationOptions = {}) {
  const {
    maxBodySize = 10 * 1024 * 1024, // 10MB default
    allowedContentTypes = [
      'application/json',
      'application/x-www-form-urlencoded',
      'multipart/form-data',
      'text/plain'
    ],
    validateSchema,
    sanitizeHeaders = true,
    logViolations = true,
  } = options;

  return async function sanitizationMiddleware(
    request: NextRequest,
    next: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    const violations: SecurityViolation[] = [];

    try {
      // 1. Check content length
      const contentLength = request.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > maxBodySize) {
        violations.push({
          type: 'oversized_request',
          details: `Request size ${contentLength} exceeds limit ${maxBodySize}`,
          severity: 'medium'
        });

        return createSecurityResponse('Request too large', 413, violations, logViolations);
      }

      // 2. Validate content type for non-GET requests
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        const contentType = request.headers.get('content-type');
        if (contentType && !isAllowedContentType(contentType, allowedContentTypes)) {
          violations.push({
            type: 'invalid_content_type',
            details: `Content type ${contentType} not allowed`,
            severity: 'medium'
          });

          return createSecurityResponse('Unsupported content type', 415, violations, logViolations);
        }
      }

      // 3. Sanitize headers if enabled
      if (sanitizeHeaders) {
        const headerViolations = validateHeaders(request);
        violations.push(...headerViolations);

        if (headerViolations.some(v => v.severity === 'high')) {
          return createSecurityResponse('Malicious headers detected', 400, violations, logViolations);
        }
      }

      // 4. Parse and validate request body if schema provided
      if (validateSchema && hasBody(request)) {
        try {
          const body = await request.json();
          const validator = createValidator(validateSchema);
          const validation = await validator(body);

          if (!validation.success) {
            violations.push({
              type: 'validation_error',
              details: validation.error,
              severity: 'medium'
            });

            return createSecurityResponse('Validation failed', 400, violations, logViolations);
          }

          // Create new request with validated body
          const sanitizedRequest = new NextRequest(request.url, {
            method: request.method,
            headers: request.headers,
            body: JSON.stringify(validation.data),
          });

          // Continue with sanitized request
          return await next();
        } catch (error) {
          violations.push({
            type: 'validation_error',
            details: 'Invalid JSON body',
            severity: 'medium'
          });

          return createSecurityResponse('Invalid request body', 400, violations, logViolations);
        }
      }

      // Log any minor violations but continue
      if (violations.length > 0 && logViolations) {
        console.warn('Security violations detected:', violations);
      }

      return await next();

    } catch (error) {
      console.error('Sanitization middleware error:', error);
      return NextResponse.json(
        { error: 'Request processing failed', code: 'SANITIZATION_ERROR' },
        { status: 500 }
      );
    }
  };
}

/**
 * Check if content type is allowed
 */
function isAllowedContentType(contentType: string, allowedTypes: string[]): boolean {
  const baseType = contentType.split(';')[0].trim().toLowerCase();
  return allowedTypes.some(allowed => baseType === allowed.toLowerCase());
}

/**
 * Validate request headers for security issues
 */
function validateHeaders(request: NextRequest): SecurityViolation[] {
  const violations: SecurityViolation[] = [];
  const headers = request.headers;

  // Check for suspicious header values
  const suspiciousPatterns = [
    /\<script/i,
    /javascript:/i,
    /vbscript:/i,
    /on\w+\s*=/i,
    /\${.*}/,
    /\.\.[\/\\]/,
    /\x00/,
  ];

  headers.forEach((value, name) => {
    // Skip certain headers that might naturally contain these patterns
    const skipHeaders = ['user-agent', 'referer', 'accept', 'accept-encoding'];
    if (skipHeaders.includes(name.toLowerCase())) {
      return;
    }

    // Check for suspicious patterns
    if (suspiciousPatterns.some(pattern => pattern.test(value))) {
      violations.push({
        type: 'malicious_header',
        details: `Suspicious pattern in header ${name}: ${value.substring(0, 100)}`,
        severity: 'high'
      });
    }

    // Check for oversized headers
    if (value.length > 8192) { // 8KB limit
      violations.push({
        type: 'malicious_header',
        details: `Oversized header ${name}: ${value.length} bytes`,
        severity: 'medium'
      });
    }
  });

  // Check for too many headers (potential DoS)
  const headerCount = Array.from(headers.keys()).length;
  if (headerCount > 100) {
    violations.push({
      type: 'malicious_header',
      details: `Too many headers: ${headerCount}`,
      severity: 'medium'
    });
  }

  return violations;
}

/**
 * Check if request has a body
 */
function hasBody(request: NextRequest): boolean {
  const method = request.method.toLowerCase();
  return ['post', 'put', 'patch'].includes(method);
}

/**
 * Create a security violation response
 */
function createSecurityResponse(
  message: string,
  status: number,
  violations: SecurityViolation[],
  logViolations: boolean
): NextResponse {
  if (logViolations) {
    console.warn(`Security violation: ${message}`, violations);
  }

  return NextResponse.json(
    {
      error: message,
      code: 'SECURITY_VIOLATION',
      violations: violations.map(v => ({
        type: v.type,
        severity: v.severity,
        // Don't expose full details in production
        details: process.env.NODE_ENV === 'development' ? v.details : undefined
      }))
    },
    { status }
  );
}

/**
 * Create validation middleware for specific schemas
 */
export function createSchemaValidator<T>(schema: z.ZodSchema<T>) {
  return withSanitization({
    validateSchema: schema,
    logViolations: true,
  });
}

/**
 * Strict sanitization for public endpoints
 */
export function strictSanitization() {
  return withSanitization({
    maxBodySize: 1024 * 1024, // 1MB for public endpoints
    allowedContentTypes: ['application/json'],
    sanitizeHeaders: true,
    logViolations: true,
  });
}

/**
 * Relaxed sanitization for admin endpoints
 */
export function adminSanitization() {
  return withSanitization({
    maxBodySize: 50 * 1024 * 1024, // 50MB for admin uploads
    allowedContentTypes: [
      'application/json',
      'multipart/form-data',
      'application/x-www-form-urlencoded',
      'text/plain',
      'application/pdf',
      'image/jpeg',
      'image/png'
    ],
    sanitizeHeaders: true,
    logViolations: true,
  });
}

/**
 * File upload sanitization
 */
export function fileUploadSanitization() {
  return withSanitization({
    maxBodySize: 50 * 1024 * 1024, // 50MB
    allowedContentTypes: ['multipart/form-data'],
    sanitizeHeaders: true,
    logViolations: true,
  });
}

/**
 * Chat message sanitization
 */
export function chatSanitization() {
  return withSanitization({
    maxBodySize: 64 * 1024, // 64KB for chat messages
    allowedContentTypes: ['application/json'],
    sanitizeHeaders: true,
    logViolations: true,
  });
}

/**
 * Simple input sanitization function for API routes
 * Removes potentially dangerous content from input objects
 */
export function sanitizeInput(input: any): any {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    return sanitizeString(input);
  }

  if (Array.isArray(input)) {
    return input.map(item => sanitizeInput(item));
  }

  if (typeof input === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      // Sanitize both key and value
      const sanitizedKey = sanitizeString(key);
      sanitized[sanitizedKey] = sanitizeInput(value);
    }
    return sanitized;
  }

  return input;
}

/**
 * Sanitize string content
 */
function sanitizeString(str: string): string {
  if (typeof str !== 'string') return str;

  return str
    // Remove null bytes
    .replace(/\x00/g, '')
    // Remove potential script tags
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove javascript: and vbscript: protocols
    .replace(/javascript:/gi, '')
    .replace(/vbscript:/gi, '')
    // Remove event handlers
    .replace(/\son\w+\s*=/gi, '')
    // Limit string length to prevent DoS
    .substring(0, 10000)
    // Trim whitespace
    .trim();
}