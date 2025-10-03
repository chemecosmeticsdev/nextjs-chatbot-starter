import { z } from 'zod';

// Common validation schemas

// Basic string validation with XSS protection
export const sanitizedString = z.string().transform((val) => sanitizeString(val));

// Email validation
export const emailSchema = z
  .string()
  .email('Invalid email format')
  .max(255, 'Email too long')
  .transform((val) => val.toLowerCase().trim());

// URL validation with protocol restriction
export const urlSchema = z
  .string()
  .url('Invalid URL format')
  .refine((url) => {
    const allowed = ['http:', 'https:'];
    return allowed.includes(new URL(url).protocol);
  }, 'Only HTTP and HTTPS URLs are allowed');

// UUID validation
export const uuidSchema = z
  .string()
  .uuid('Invalid UUID format');

// API key validation
export const apiKeySchema = z
  .string()
  .regex(/^cb_live_[a-f0-9]{64}$/, 'Invalid API key format');

// Content validation for chat messages
export const chatContentSchema = z
  .string()
  .min(1, 'Message cannot be empty')
  .max(10000, 'Message too long')
  .transform((val) => sanitizeString(val))
  .refine((val) => !containsProhibitedContent(val), {
    message: 'Message contains prohibited content'
  });

// File upload validation
export const fileUploadSchema = z.object({
  filename: z
    .string()
    .min(1, 'Filename required')
    .max(255, 'Filename too long')
    .transform((val) => sanitizeFilename(val)),
  mimeType: z
    .string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_.]*$/, 'Invalid MIME type'),
  fileSize: z
    .number()
    .min(1, 'File must have content')
    .max(50 * 1024 * 1024, 'File too large (max 50MB)'), // 50MB limit
});

// Configuration validation
export const chatbotConfigSchema = z.object({
  name: z.string().min(1).max(255).transform((val) => sanitizeString(val)),
  description: z.string().max(1000).transform((val) => sanitizeString(val)).optional(),
  model: z.enum(['gpt-4', 'gpt-3.5-turbo', 'claude-3', 'nova-micro']),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().min(1).max(4000),
  language: z.enum(['en', 'th', 'zh-CN', 'ja', 'ko']),
  responseTimeout: z.number().min(5).max(120),
});

// API key creation validation
export const apiKeyCreateSchema = z.object({
  name: z.string().min(1).max(255).transform((val) => sanitizeString(val)),
  scopes: z.array(z.string()).min(1, 'At least one scope required'),
  expiresAt: z.string().datetime().optional(),
});

// User input validation for authentication
export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain uppercase, lowercase, and number'),
});

// Search query validation
export const searchQuerySchema = z.object({
  query: z.string().min(1).max(500).transform((val) => sanitizeString(val)),
  filters: z
    .object({
      category: z.string().transform((val) => sanitizeString(val)).optional(),
      supplier: z.string().transform((val) => sanitizeString(val)).optional(),
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
    })
    .optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
});

// Pagination validation
export const paginationSchema = z.object({
  page: z.number().min(1).optional().default(1),
  limit: z.number().min(1).max(100).optional().default(20),
  sortBy: z.string().transform((val) => sanitizeString(val)).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

// Analytics filters validation
export const analyticsFilterSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  chatbotId: uuidSchema.optional(),
  groupBy: z.enum(['day', 'week', 'month']).optional().default('day'),
});

// System settings validation
export const systemSettingSchema = z.object({
  key: z.string().min(1).max(255).transform((val) => sanitizeString(val)),
  value: z.any(), // Can be any valid JSON
  description: z.string().max(500).transform((val) => sanitizeString(val)).optional(),
  isPublic: z.boolean().optional().default(false),
});

/**
 * Sanitize string input to prevent XSS attacks
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    .trim()
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters except tabs, newlines, and carriage returns
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Remove potential script tags and event handlers
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:(?!image\/(?:png|jpe?g|gif|webp|svg\+xml))/gi, '')
    // Limit consecutive whitespace
    .replace(/\s+/g, ' ');
}

/**
 * Sanitize filename to prevent directory traversal and other attacks
 */
export function sanitizeFilename(filename: string): string {
  if (typeof filename !== 'string') {
    return 'unknown';
  }

  return filename
    .trim()
    // Remove path traversal attempts
    .replace(/[.\/\\:*?"<>|]/g, '')
    // Remove null bytes and control characters
    .replace(/[\x00-\x1F\x7F]/g, '')
    // Limit length and ensure extension
    .substring(0, 255)
    || 'unnamed_file';
}

/**
 * Check for prohibited content in user messages
 */
export function containsProhibitedContent(content: string): boolean {
  const prohibitedPatterns = [
    // Potential SQL injection patterns
    /('|(\\\')|(\-\-)|(\;)|(\|)|(\*)|(\%))/i,
    // Script injection patterns
    /<script|javascript:|vbscript:|data:/i,
    // Command injection patterns
    /(\$\()|(`)|(\${)|(\|\s*[a-z])/i,
    // Path traversal patterns
    /(\.\.[\/\\])|(\~[\/\\])/i,
  ];

  return prohibitedPatterns.some(pattern => pattern.test(content));
}

/**
 * Validate allowed MIME types for file uploads
 */
export const allowedMimeTypes = new Set([
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',

  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',

  // Archives (limited)
  'application/zip',
  'application/x-zip-compressed',
]);

/**
 * Validate file type based on MIME type and extension
 */
export function validateFileType(filename: string, mimeType: string): boolean {
  // Check MIME type
  if (!allowedMimeTypes.has(mimeType)) {
    return false;
  }

  // Extract file extension
  const extension = filename.toLowerCase().split('.').pop();
  if (!extension) {
    return false;
  }

  // Map MIME types to allowed extensions
  const mimeToExtensions: Record<string, string[]> = {
    'application/pdf': ['pdf'],
    'application/msword': ['doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
    'text/plain': ['txt'],
    'text/csv': ['csv'],
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/gif': ['gif'],
    'image/webp': ['webp'],
    'application/zip': ['zip'],
  };

  const allowedExtensions = mimeToExtensions[mimeType];
  return allowedExtensions ? allowedExtensions.includes(extension) : false;
}

/**
 * Rate limiting validation schemas
 */
export const rateLimitConfigSchema = z.object({
  windowMs: z.number().min(1000).max(24 * 60 * 60 * 1000), // 1 second to 24 hours
  maxRequests: z.number().min(1).max(10000),
});

/**
 * IP address validation
 */
export const ipAddressSchema = z
  .string()
  .refine((ip) => {
    // IPv4 regex
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    // IPv6 regex (simplified)
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }, 'Invalid IP address format');

/**
 * Domain validation for CORS whitelist
 */
export const domainSchema = z
  .string()
  .regex(/^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/, 'Invalid domain format')
  .max(253, 'Domain too long');

/**
 * Webhook URL validation
 */
export const webhookUrlSchema = z
  .string()
  .url('Invalid webhook URL')
  .refine((url) => {
    const parsed = new URL(url);
    return ['https:'].includes(parsed.protocol);
  }, 'Webhook URLs must use HTTPS');

/**
 * JSON schema validation for configuration objects
 */
export const jsonConfigSchema = z
  .record(z.any())
  .refine((obj) => {
    try {
      JSON.stringify(obj);
      return true;
    } catch {
      return false;
    }
  }, 'Invalid JSON configuration');

/**
 * Create a validation middleware that can be used with API routes
 */
export function createValidator<T>(schema: z.ZodSchema<T>) {
  return async (data: unknown): Promise<{ success: true; data: T } | { success: false; error: string }> => {
    try {
      const validatedData = await schema.parseAsync(data);
      return { success: true, data: validatedData };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessage = error.errors
          .map(err => `${err.path.join('.')}: ${err.message}`)
          .join(', ');
        return { success: false, error: `Validation error: ${errorMessage}` };
      }
      return { success: false, error: 'Validation failed' };
    }
  };
}