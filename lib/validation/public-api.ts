import { z } from 'zod';

/**
 * Validation schemas for public API endpoints
 */
export class PublicApiValidator {
  /**
   * Validate chat message request
   */
  static validateChatMessage(data: any): { success: boolean; data?: any; errors?: string[] } {
    const schema = z.object({
      message: z.string()
        .min(1, 'Message cannot be empty')
        .max(2000, 'Message too long (max 2000 characters)'),
      sessionId: z.string()
        .min(1, 'Session ID required')
        .max(100, 'Session ID too long')
        .optional(),
      userId: z.string()
        .min(1, 'User ID cannot be empty')
        .max(100, 'User ID too long')
        .optional(),
      metadata: z.record(z.any()).optional(),
      context: z.object({
        previousMessages: z.number().min(0).max(10).optional(),
        includeVectorSearch: z.boolean().optional(),
        maxTokens: z.number().min(1).max(4000).optional(),
        temperature: z.number().min(0).max(2).optional()
      }).optional()
    });

    try {
      const result = schema.parse(data);
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        };
      }
      return { success: false, errors: ['Invalid data format'] };
    }
  }

  /**
   * Validate conversation history request
   */
  static validateConversationRequest(data: any): { success: boolean; data?: any; errors?: string[] } {
    const schema = z.object({
      sessionId: z.string().min(1, 'Session ID required'),
      userId: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
      includeMetadata: z.boolean().optional()
    });

    try {
      const result = schema.parse(data);
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        };
      }
      return { success: false, errors: ['Invalid data format'] };
    }
  }

  /**
   * Validate webhook payload
   */
  static validateWebhookPayload(data: any): { success: boolean; data?: any; errors?: string[] } {
    const schema = z.object({
      event: z.enum(['message', 'session_start', 'session_end', 'error']),
      data: z.object({
        sessionId: z.string(),
        userId: z.string().optional(),
        message: z.string().optional(),
        metadata: z.record(z.any()).optional(),
        timestamp: z.string().datetime().optional()
      }),
      signature: z.string().optional(),
      version: z.string().optional()
    });

    try {
      const result = schema.parse(data);
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        };
      }
      return { success: false, errors: ['Invalid webhook payload'] };
    }
  }

  /**
   * Validate API key creation request
   */
  static validateApiKeyRequest(data: any): { success: boolean; data?: any; errors?: string[] } {
    const schema = z.object({
      name: z.string().min(1, 'API key name required').max(100, 'Name too long'),
      description: z.string().max(500, 'Description too long').optional(),
      scopes: z.array(z.enum(['read', 'write', 'public', 'admin']))
        .min(1, 'At least one scope required'),
      expiresAt: z.string().datetime().optional(),
      usageLimits: z.object({
        requestsPerHour: z.number().min(1).max(10000).optional(),
        requestsPerDay: z.number().min(1).max(100000).optional(),
        requestsPerMonth: z.number().min(1).max(1000000).optional(),
        tokensPerHour: z.number().min(1).max(1000000).optional(),
        tokensPerDay: z.number().min(1).max(10000000).optional(),
        tokensPerMonth: z.number().min(1).max(100000000).optional()
      }).optional()
    });

    try {
      const result = schema.parse(data);
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        };
      }
      return { success: false, errors: ['Invalid API key request'] };
    }
  }

  /**
   * Validate usage analytics request
   */
  static validateUsageAnalyticsRequest(data: any): { success: boolean; data?: any; errors?: string[] } {
    const schema = z.object({
      period: z.enum(['hour', 'day', 'week', 'month']).optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      groupBy: z.enum(['hour', 'day', 'endpoint', 'user']).optional(),
      metrics: z.array(z.enum(['requests', 'tokens', 'responseTime', 'errors'])).optional(),
      filters: z.object({
        endpoint: z.string().optional(),
        userId: z.string().optional(),
        chatbotId: z.string().optional(),
        statusCode: z.number().optional()
      }).optional()
    });

    try {
      const result = schema.parse(data);
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        };
      }
      return { success: false, errors: ['Invalid analytics request'] };
    }
  }

  /**
   * Validate bulk operations request
   */
  static validateBulkRequest(data: any): { success: boolean; data?: any; errors?: string[] } {
    const schema = z.object({
      operations: z.array(z.object({
        operation: z.enum(['send_message', 'get_conversation', 'delete_session']),
        data: z.record(z.any())
      })).min(1, 'At least one operation required').max(100, 'Too many operations (max 100)'),
      options: z.object({
        failFast: z.boolean().optional(),
        timeout: z.number().min(1000).max(60000).optional(),
        retries: z.number().min(0).max(3).optional()
      }).optional()
    });

    try {
      const result = schema.parse(data);
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        };
      }
      return { success: false, errors: ['Invalid bulk request'] };
    }
  }
}

/**
 * Common validation utilities
 */
export class ValidationUtils {
  /**
   * Validate UUID format
   */
  static isValidUUID(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  /**
   * Validate API key format
   */
  static isValidApiKey(value: string): boolean {
    // API keys should start with 'cb_live_' or 'cb_test_' followed by 32 characters
    const apiKeyRegex = /^cb_(live|test)_[a-zA-Z0-9]{32}$/;
    return apiKeyRegex.test(value);
  }

  /**
   * Sanitize and validate session ID
   */
  static sanitizeSessionId(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 100);
  }

  /**
   * Validate and sanitize user ID
   */
  static sanitizeUserId(value: string): string {
    return value.replace(/[^a-zA-Z0-9_@.-]/g, '').substring(0, 100);
  }

  /**
   * Check if message contains potentially harmful content
   */
  static containsHarmfulContent(message: string): boolean {
    const harmfulPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /data:text\/html/gi,
      /vbscript:/gi,
      /on\w+\s*=/gi
    ];

    return harmfulPatterns.some(pattern => pattern.test(message));
  }

  /**
   * Extract and validate IP address
   */
  static extractClientIp(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const cloudflareIp = request.headers.get('cf-connecting-ip');

    const ip = cloudflareIp || forwarded?.split(',')[0] || realIp || 'unknown';

    // Basic IP validation
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

    if (ipv4Regex.test(ip) || ipv6Regex.test(ip)) {
      return ip;
    }

    return 'unknown';
  }
}