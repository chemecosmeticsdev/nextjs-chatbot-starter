export interface RateLimitRule {
  maxRequests: number;
  windowMs: number;
  blockDuration?: number; // How long to block after limit exceeded (ms)
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

export enum RateLimitType {
  MESSAGE_SEND = 'message_send',
  ROOM_JOIN = 'room_join',
  CONNECTION = 'connection',
  ANALYTICS_REQUEST = 'analytics_request',
  ADMIN_ACTION = 'admin_action'
}

export class WebSocketRateLimiter {
  private limits = new Map<string, { count: number; resetTime: number; blockedUntil?: number }>();
  private rules: Map<RateLimitType, RateLimitRule>;

  constructor() {
    this.rules = new Map([
      [RateLimitType.MESSAGE_SEND, { maxRequests: 100, windowMs: 60000 }], // 100 messages per minute
      [RateLimitType.ROOM_JOIN, { maxRequests: 50, windowMs: 60000 }], // 50 room joins per minute
      [RateLimitType.CONNECTION, { maxRequests: 10, windowMs: 60000, blockDuration: 300000 }], // 10 connections per minute, 5 min block
      [RateLimitType.ANALYTICS_REQUEST, { maxRequests: 200, windowMs: 60000 }], // 200 analytics requests per minute
      [RateLimitType.ADMIN_ACTION, { maxRequests: 500, windowMs: 60000 }] // 500 admin actions per minute
    ]);

    // Start cleanup process
    this.startCleanup();
  }

  /**
   * Check if a request is allowed under rate limiting
   */
  checkLimit(
    identifier: string,
    limitType: RateLimitType,
    userRole: string = 'user'
  ): RateLimitResult {
    const key = `${limitType}:${identifier}`;
    const rule = this.getRuleForUser(limitType, userRole);
    const now = Date.now();

    // Get or create limit entry
    let limitEntry = this.limits.get(key);

    // Check if currently blocked
    if (limitEntry?.blockedUntil && now < limitEntry.blockedUntil) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: limitEntry.resetTime,
        retryAfter: limitEntry.blockedUntil - now
      };
    }

    // Initialize or reset if window expired
    if (!limitEntry || now >= limitEntry.resetTime) {
      limitEntry = {
        count: 0,
        resetTime: now + rule.windowMs
      };
    }

    // Check if limit exceeded
    if (limitEntry.count >= rule.maxRequests) {
      // Apply block duration if specified
      if (rule.blockDuration) {
        limitEntry.blockedUntil = now + rule.blockDuration;
      }

      this.limits.set(key, limitEntry);

      return {
        allowed: false,
        remaining: 0,
        resetTime: limitEntry.resetTime,
        retryAfter: rule.blockDuration
      };
    }

    // Increment counter and allow
    limitEntry.count++;
    this.limits.set(key, limitEntry);

    return {
      allowed: true,
      remaining: rule.maxRequests - limitEntry.count,
      resetTime: limitEntry.resetTime
    };
  }

  /**
   * Get rate limit rule based on user role
   */
  private getRuleForUser(limitType: RateLimitType, userRole: string): RateLimitRule {
    const baseRule = this.rules.get(limitType)!;

    // Adjust limits for different user roles
    switch (userRole) {
      case 'super_admin':
        return {
          ...baseRule,
          maxRequests: baseRule.maxRequests * 10 // 10x limit for super admins
        };

      case 'admin':
        return {
          ...baseRule,
          maxRequests: baseRule.maxRequests * 5 // 5x limit for admins
        };

      case 'premium_user':
        return {
          ...baseRule,
          maxRequests: Math.floor(baseRule.maxRequests * 1.5) // 1.5x limit for premium users
        };

      default:
        return baseRule;
    }
  }

  /**
   * Check multiple limits at once (useful for complex operations)
   */
  checkMultipleLimits(
    identifier: string,
    limitTypes: RateLimitType[],
    userRole: string = 'user'
  ): { allowed: boolean; failedLimits: RateLimitType[]; results: Map<RateLimitType, RateLimitResult> } {
    const results = new Map<RateLimitType, RateLimitResult>();
    const failedLimits: RateLimitType[] = [];

    for (const limitType of limitTypes) {
      const result = this.checkLimit(identifier, limitType, userRole);
      results.set(limitType, result);

      if (!result.allowed) {
        failedLimits.push(limitType);
      }
    }

    return {
      allowed: failedLimits.length === 0,
      failedLimits,
      results
    };
  }

  /**
   * Get current limit status for an identifier
   */
  getLimitStatus(identifier: string, limitType: RateLimitType): {
    current: number;
    limit: number;
    resetTime: number;
    isBlocked: boolean;
    blockedUntil?: number;
  } {
    const key = `${limitType}:${identifier}`;
    const rule = this.rules.get(limitType)!;
    const limitEntry = this.limits.get(key);
    const now = Date.now();

    if (!limitEntry || now >= limitEntry.resetTime) {
      return {
        current: 0,
        limit: rule.maxRequests,
        resetTime: now + rule.windowMs,
        isBlocked: false
      };
    }

    return {
      current: limitEntry.count,
      limit: rule.maxRequests,
      resetTime: limitEntry.resetTime,
      isBlocked: limitEntry.blockedUntil ? now < limitEntry.blockedUntil : false,
      blockedUntil: limitEntry.blockedUntil
    };
  }

  /**
   * Reset limits for a specific identifier (admin function)
   */
  resetLimits(identifier: string, limitType?: RateLimitType): boolean {
    if (limitType) {
      const key = `${limitType}:${identifier}`;
      return this.limits.delete(key);
    } else {
      // Reset all limits for identifier
      let resetCount = 0;
      for (const key of this.limits.keys()) {
        if (key.endsWith(`:${identifier}`)) {
          this.limits.delete(key);
          resetCount++;
        }
      }
      return resetCount > 0;
    }
  }

  /**
   * Temporarily whitelist an identifier (admin function)
   */
  whitelist(identifier: string, limitType: RateLimitType, durationMs: number): void {
    const key = `${limitType}:${identifier}`;
    const now = Date.now();

    this.limits.set(key, {
      count: 0,
      resetTime: now + durationMs,
      blockedUntil: undefined
    });
  }

  /**
   * Update rate limit rules
   */
  updateRule(limitType: RateLimitType, rule: RateLimitRule): void {
    this.rules.set(limitType, rule);
  }

  /**
   * Get statistics about current rate limiting
   */
  getStats(): {
    totalTrackedLimits: number;
    activeLimits: number;
    blockedLimits: number;
    limitsByType: Map<RateLimitType, number>;
  } {
    const now = Date.now();
    let activeLimits = 0;
    let blockedLimits = 0;
    const limitsByType = new Map<RateLimitType, number>();

    this.limits.forEach((entry, key) => {
      if (now < entry.resetTime) {
        activeLimits++;

        if (entry.blockedUntil && now < entry.blockedUntil) {
          blockedLimits++;
        }

        // Count by type
        const limitType = key.split(':')[0] as RateLimitType;
        limitsByType.set(limitType, (limitsByType.get(limitType) || 0) + 1);
      }
    });

    return {
      totalTrackedLimits: this.limits.size,
      activeLimits,
      blockedLimits,
      limitsByType
    };
  }

  /**
   * Start cleanup process for expired limits
   */
  private startCleanup(): void {
    setInterval(() => {
      this.cleanup();
    }, 60000); // Cleanup every minute
  }

  /**
   * Clean up expired limit entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.limits.entries()) {
      // Remove if both window and block period have expired
      if (now >= entry.resetTime && (!entry.blockedUntil || now >= entry.blockedUntil)) {
        this.limits.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.debug(`Rate limiter cleaned up ${cleanedCount} expired entries`);
    }
  }

  /**
   * Get all current limits (for debugging/monitoring)
   */
  getAllLimits(): Array<{
    key: string;
    count: number;
    limit: number;
    resetTime: number;
    isBlocked: boolean;
    timeUntilReset: number;
  }> {
    const now = Date.now();
    const results: Array<{
      key: string;
      count: number;
      limit: number;
      resetTime: number;
      isBlocked: boolean;
      timeUntilReset: number;
    }> = [];

    this.limits.forEach((entry, key) => {
      const limitType = key.split(':')[0] as RateLimitType;
      const rule = this.rules.get(limitType);

      if (rule) {
        results.push({
          key,
          count: entry.count,
          limit: rule.maxRequests,
          resetTime: entry.resetTime,
          isBlocked: entry.blockedUntil ? now < entry.blockedUntil : false,
          timeUntilReset: Math.max(0, entry.resetTime - now)
        });
      }
    });

    return results.sort((a, b) => a.key.localeCompare(b.key));
  }
}

// Global rate limiter instance
export const webSocketRateLimiter = new WebSocketRateLimiter();