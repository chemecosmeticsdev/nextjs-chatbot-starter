import { db } from '@/lib/db/index';
import { securityEvents, activityLogs } from '@/lib/db/schema';

export interface SecurityEventData {
  userId?: string;
  eventType: SecurityEventType;
  severity: 'info' | 'warning' | 'critical';
  ipAddress?: string;
  userAgent?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  details?: Record<string, any>;
  blocked?: boolean;
}

export enum SecurityEventType {
  // Authentication events
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  LOGOUT = 'logout',
  TOKEN_REFRESH = 'token_refresh',
  SESSION_EXPIRED = 'session_expired',

  // API key events
  API_KEY_CREATED = 'api_key_created',
  API_KEY_USED = 'api_key_used',
  API_KEY_INVALID = 'api_key_invalid',
  API_KEY_EXPIRED = 'api_key_expired',
  API_KEY_REVOKED = 'api_key_revoked',

  // Rate limiting events
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  RATE_LIMIT_RESET = 'rate_limit_reset',

  // Security violations
  XSS_ATTEMPT = 'xss_attempt',
  SQL_INJECTION_ATTEMPT = 'sql_injection_attempt',
  MALICIOUS_REQUEST = 'malicious_request',
  INVALID_INPUT = 'invalid_input',
  OVERSIZED_REQUEST = 'oversized_request',

  // CORS violations
  CORS_VIOLATION = 'cors_violation',
  INVALID_ORIGIN = 'invalid_origin',

  // Access control
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  INSUFFICIENT_PERMISSIONS = 'insufficient_permissions',
  ADMIN_ACTION = 'admin_action',

  // System events
  CONFIG_CHANGE = 'config_change',
  SECURITY_SCAN = 'security_scan',
  VULNERABILITY_DETECTED = 'vulnerability_detected',
}

export interface ActivityLogData {
  userId: string;
  activityType: string;
  entityType?: string;
  entityId?: string;
  description: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Security audit logging service
 */
export class AuditLogger {
  /**
   * Log a security event
   */
  static async logSecurityEvent(data: SecurityEventData): Promise<void> {
    try {
      await db.insert(securityEvents).values({
        userId: data.userId || null,
        eventType: data.eventType,
        severity: data.severity,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
        endpoint: data.endpoint || null,
        method: data.method || null,
        statusCode: data.statusCode || null,
        details: data.details || {},
        blocked: data.blocked || false,
      });

      // Log critical events to console immediately
      if (data.severity === 'critical') {
        console.error('CRITICAL SECURITY EVENT:', {
          type: data.eventType,
          userId: data.userId,
          ipAddress: data.ipAddress,
          endpoint: data.endpoint,
          details: data.details,
        });
      }
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  /**
   * Log user activity
   */
  static async logActivity(data: ActivityLogData): Promise<void> {
    try {
      await db.insert(activityLogs).values({
        userId: data.userId,
        activityType: data.activityType,
        entityType: data.entityType || null,
        entityId: data.entityId || null,
        description: data.description,
        metadata: data.metadata || {},
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
      });
    } catch (error) {
      console.error('Failed to log activity:', error);
    }
  }

  /**
   * Log authentication events
   */
  static async logAuth(
    eventType: SecurityEventType,
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
    details?: Record<string, any>
  ): Promise<void> {
    const severity = eventType === SecurityEventType.LOGIN_FAILURE ? 'warning' : 'info';

    await this.logSecurityEvent({
      userId,
      eventType,
      severity,
      ipAddress,
      userAgent,
      details,
    });
  }

  /**
   * Log API key usage
   */
  static async logApiKeyUsage(
    eventType: SecurityEventType,
    keyId: string,
    userId: string,
    ipAddress?: string,
    endpoint?: string,
    method?: string,
    statusCode?: number
  ): Promise<void> {
    await this.logSecurityEvent({
      userId,
      eventType,
      severity: 'info',
      ipAddress,
      endpoint,
      method,
      statusCode,
      details: { apiKeyId: keyId },
    });
  }

  /**
   * Log rate limiting events
   */
  static async logRateLimit(
    ipAddress: string,
    endpoint: string,
    method: string,
    limit: number,
    current: number,
    userId?: string
  ): Promise<void> {
    await this.logSecurityEvent({
      userId,
      eventType: SecurityEventType.RATE_LIMIT_EXCEEDED,
      severity: 'warning',
      ipAddress,
      endpoint,
      method,
      blocked: true,
      details: {
        limit,
        current,
        exceeded: current >= limit,
      },
    });
  }

  /**
   * Log security violations
   */
  static async logSecurityViolation(
    eventType: SecurityEventType,
    ipAddress: string,
    endpoint: string,
    method: string,
    details: Record<string, any>,
    userId?: string
  ): Promise<void> {
    await this.logSecurityEvent({
      userId,
      eventType,
      severity: 'critical',
      ipAddress,
      endpoint,
      method,
      blocked: true,
      details,
    });
  }

  /**
   * Log admin actions
   */
  static async logAdminAction(
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    ipAddress?: string,
    userAgent?: string,
    details?: Record<string, any>
  ): Promise<void> {
    await this.logSecurityEvent({
      userId,
      eventType: SecurityEventType.ADMIN_ACTION,
      severity: 'info',
      ipAddress,
      userAgent,
      details: {
        action,
        entityType,
        entityId,
        ...details,
      },
    });

    await this.logActivity({
      userId,
      activityType: 'admin_action',
      entityType,
      entityId,
      description: `Admin action: ${action}`,
      metadata: details,
      ipAddress,
      userAgent,
    });
  }

  /**
   * Log CORS violations
   */
  static async logCorsViolation(
    origin: string,
    endpoint: string,
    method: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logSecurityEvent({
      eventType: SecurityEventType.CORS_VIOLATION,
      severity: 'warning',
      ipAddress,
      userAgent,
      endpoint,
      method,
      blocked: true,
      details: { origin },
    });
  }

  /**
   * Log configuration changes
   */
  static async logConfigChange(
    userId: string,
    configType: string,
    configKey: string,
    oldValue: any,
    newValue: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logSecurityEvent({
      userId,
      eventType: SecurityEventType.CONFIG_CHANGE,
      severity: 'info',
      ipAddress,
      userAgent,
      details: {
        configType,
        configKey,
        oldValue: this.sanitizeValue(oldValue),
        newValue: this.sanitizeValue(newValue),
      },
    });

    await this.logActivity({
      userId,
      activityType: 'config_change',
      entityType: configType,
      entityId: configKey,
      description: `Configuration changed: ${configKey}`,
      metadata: {
        configType,
        hasOldValue: oldValue !== undefined,
        hasNewValue: newValue !== undefined,
      },
      ipAddress,
      userAgent,
    });
  }

  /**
   * Get security event statistics
   */
  static async getSecurityStats(
    startDate: Date,
    endDate: Date
  ): Promise<Record<string, number>> {
    try {
      // This would be implemented with proper aggregation
      // For now, return empty stats
      return {};
    } catch (error) {
      console.error('Failed to get security stats:', error);
      return {};
    }
  }

  /**
   * Sanitize sensitive values for logging
   */
  private static sanitizeValue(value: any): any {
    if (typeof value !== 'object' || value === null) {
      return value;
    }

    const sensitiveKeys = ['password', 'secret', 'token', 'key', 'credential'];
    const sanitized = { ...value };

    for (const key in sanitized) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}

/**
 * Create audit logging middleware
 */
export function createAuditMiddleware() {
  return async function auditMiddleware(
    request: Request,
    userId?: string
  ): Promise<void> {
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                     request.headers.get('x-real-ip') ||
                     'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const url = new URL(request.url);
    const endpoint = url.pathname;
    const method = request.method;

    // Log API access
    await AuditLogger.logActivity({
      userId: userId || 'anonymous',
      activityType: 'api_access',
      description: `${method} ${endpoint}`,
      metadata: {
        endpoint,
        method,
        query: Object.fromEntries(url.searchParams),
      },
      ipAddress,
      userAgent,
    });
  };
}