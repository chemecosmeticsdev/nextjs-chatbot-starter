import { IncomingMessage } from 'http';
import { AuthTokenService } from '@/lib/auth';
import { URL } from 'url';

export interface WebSocketAuthResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    role: string;
    fullName?: string;
  };
  error?: string;
  connectionId?: string;
}

export class WebSocketAuthMiddleware {
  /**
   * Authenticate WebSocket connection using token from query params or headers
   */
  static async authenticate(request: IncomingMessage): Promise<WebSocketAuthResult> {
    try {
      // Extract token from query parameters or Authorization header
      const token = this.extractToken(request);

      if (!token) {
        return {
          success: false,
          error: 'No authentication token provided'
        };
      }

      // Verify the JWT token
      const user = await AuthTokenService.verifySession(token);

      if (!user) {
        return {
          success: false,
          error: 'Invalid or expired token'
        };
      }

      // Generate unique connection ID
      const connectionId = this.generateConnectionId(user.userId);

      return {
        success: true,
        user: {
          id: user.userId,
          email: user.email,
          role: user.role,
          fullName: user.fullName || undefined
        },
        connectionId
      };

    } catch (error) {
      console.error('WebSocket authentication error:', error);
      return {
        success: false,
        error: 'Authentication failed'
      };
    }
  }

  /**
   * Extract authentication token from request
   */
  private static extractToken(request: IncomingMessage): string | null {
    // First, try to get token from query parameters
    if (request.url) {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const tokenFromQuery = url.searchParams.get('token');
      if (tokenFromQuery) {
        return tokenFromQuery;
      }
    }

    // Then try Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Try custom WebSocket headers
    const wsToken = request.headers['sec-websocket-protocol'] as string;
    if (wsToken && wsToken.startsWith('auth-')) {
      return wsToken.substring(5);
    }

    return null;
  }

  /**
   * Generate unique connection ID
   */
  private static generateConnectionId(userId: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `${userId}-${timestamp}-${random}`;
  }

  /**
   * Validate connection permissions for specific actions
   */
  static validatePermissions(
    user: { id: string; role: string },
    action: WebSocketAction,
    resource?: string
  ): boolean {
    switch (action) {
      case WebSocketAction.ADMIN_ROOM_ACCESS:
        return user.role === 'super_admin' || user.role === 'admin';

      case WebSocketAction.ANALYTICS_ACCESS:
        return user.role === 'super_admin' || user.role === 'admin';

      case WebSocketAction.CHATBOT_MANAGEMENT:
        return user.role === 'super_admin';

      case WebSocketAction.USER_CHAT:
        return true; // All authenticated users can chat

      case WebSocketAction.SYSTEM_MONITORING:
        return user.role === 'super_admin';

      default:
        return false;
    }
  }

  /**
   * Rate limiting check for WebSocket connections
   */
  static checkRateLimit(
    userId: string,
    action: WebSocketAction = WebSocketAction.MESSAGE_SEND
  ): { allowed: boolean; remaining?: number; resetTime?: number } {
    const rateLimits = this.getRateLimits();
    const key = `ws:${action}:${userId}`;
    const limit = rateLimits[action];

    if (!limit) {
      return { allowed: true };
    }

    // Get current count (in production, use Redis)
    const currentCount = this.getCurrentCount(key);

    if (currentCount >= limit.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + limit.windowMs
      };
    }

    // Increment count
    this.incrementCount(key, limit.windowMs);

    return {
      allowed: true,
      remaining: limit.maxRequests - currentCount - 1
    };
  }

  /**
   * Get rate limit configuration
   */
  private static getRateLimits(): Record<WebSocketAction, { maxRequests: number; windowMs: number }> {
    return {
      [WebSocketAction.MESSAGE_SEND]: { maxRequests: 100, windowMs: 60000 }, // 100 messages per minute
      [WebSocketAction.ROOM_JOIN]: { maxRequests: 50, windowMs: 60000 }, // 50 room joins per minute
      [WebSocketAction.ANALYTICS_ACCESS]: { maxRequests: 200, windowMs: 60000 }, // 200 analytics requests per minute
      [WebSocketAction.ADMIN_ROOM_ACCESS]: { maxRequests: 1000, windowMs: 60000 }, // 1000 admin actions per minute
      [WebSocketAction.CHATBOT_MANAGEMENT]: { maxRequests: 100, windowMs: 60000 }, // 100 management actions per minute
      [WebSocketAction.USER_CHAT]: { maxRequests: 150, windowMs: 60000 }, // 150 chat messages per minute
      [WebSocketAction.SYSTEM_MONITORING]: { maxRequests: 500, windowMs: 60000 } // 500 monitoring requests per minute
    };
  }

  /**
   * Get current rate limit count (in-memory implementation)
   * In production, this should use Redis
   */
  private static rateLimitCounts = new Map<string, { count: number; resetTime: number }>();

  private static getCurrentCount(key: string): number {
    const entry = this.rateLimitCounts.get(key);
    if (!entry || Date.now() > entry.resetTime) {
      return 0;
    }
    return entry.count;
  }

  private static incrementCount(key: string, windowMs: number): void {
    const entry = this.rateLimitCounts.get(key);
    const now = Date.now();

    if (!entry || now > entry.resetTime) {
      this.rateLimitCounts.set(key, { count: 1, resetTime: now + windowMs });
    } else {
      entry.count++;
    }

    // Cleanup old entries periodically
    if (Math.random() < 0.01) { // 1% chance to cleanup
      this.cleanupRateLimitCounts();
    }
  }

  private static cleanupRateLimitCounts(): void {
    const now = Date.now();
    for (const [key, entry] of this.rateLimitCounts.entries()) {
      if (now > entry.resetTime) {
        this.rateLimitCounts.delete(key);
      }
    }
  }

  /**
   * Extract connection metadata from request
   */
  static extractConnectionMetadata(request: IncomingMessage): Record<string, any> {
    return {
      ip: this.getClientIP(request),
      userAgent: request.headers['user-agent'] || 'Unknown',
      origin: request.headers.origin || 'Unknown',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get client IP address from request
   */
  private static getClientIP(request: IncomingMessage): string {
    const forwarded = request.headers['x-forwarded-for'] as string;
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }

    const real = request.headers['x-real-ip'] as string;
    if (real) {
      return real;
    }

    return request.socket.remoteAddress || 'Unknown';
  }
}

// WebSocket action types for permission checking
export enum WebSocketAction {
  MESSAGE_SEND = 'message_send',
  ROOM_JOIN = 'room_join',
  ANALYTICS_ACCESS = 'analytics_access',
  ADMIN_ROOM_ACCESS = 'admin_room_access',
  CHATBOT_MANAGEMENT = 'chatbot_management',
  USER_CHAT = 'user_chat',
  SYSTEM_MONITORING = 'system_monitoring'
}

// Connection security configuration
export const WebSocketSecurityConfig = {
  // Maximum connections per user (increased for development)
  maxConnectionsPerUser: 20,

  // Maximum message size (bytes)
  maxMessageSize: 10 * 1024, // 10KB

  // Connection timeout (ms)
  connectionTimeout: 60000, // 60 seconds

  // Heartbeat interval (ms)
  heartbeatInterval: 30000, // 30 seconds

  // Maximum rooms per connection
  maxRoomsPerConnection: 50,

  // CORS allowed origins
  allowedOrigins: [
    'http://localhost:3000',
    'https://master.d8z7xlyl8bjeg.amplifyapp.com',
    process.env.NEXT_PUBLIC_APP_URL
  ].filter(Boolean) as string[]
};