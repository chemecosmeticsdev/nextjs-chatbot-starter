import { randomBytes, createHash } from 'crypto';
import { db } from '@/lib/db/index';
import { apiKeys, type ApiKey } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export interface ApiKeyData {
  id: string;
  name: string;
  keyHash: string;
  userId: string;
  scopes: string[];
  expiresAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
}

export interface CreateApiKeyRequest {
  name: string;
  userId: string;
  scopes: string[];
  expiresAt?: Date;
}

export interface ApiKeyValidationResult {
  valid: boolean;
  apiKey?: ApiKeyData;
  error?: string;
}

export enum ApiKeyScope {
  // Read permissions
  READ_CHATBOTS = 'read:chatbots',
  READ_CONVERSATIONS = 'read:conversations',
  READ_ANALYTICS = 'read:analytics',
  READ_KNOWLEDGE_BASE = 'read:knowledge-base',

  // Write permissions
  WRITE_CHATBOTS = 'write:chatbots',
  WRITE_CONVERSATIONS = 'write:conversations',
  WRITE_KNOWLEDGE_BASE = 'write:knowledge-base',

  // Admin permissions
  ADMIN_USERS = 'admin:users',
  ADMIN_SETTINGS = 'admin:settings',
  ADMIN_API_KEYS = 'admin:api-keys',

  // Public widget access
  PUBLIC_CHAT = 'public:chat',
  PUBLIC_WIDGET = 'public:widget',
}

export class ApiKeyService {
  /**
   * Generate a new API key
   */
  static generateKey(): string {
    // Format: cb_live_1234567890abcdef1234567890abcdef12345678 (44 chars total)
    const prefix = 'cb_live_';
    const keyData = randomBytes(32).toString('hex'); // 64 hex chars
    return prefix + keyData;
  }

  /**
   * Hash API key for storage
   */
  static hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  /**
   * Create a new API key
   */
  static async createApiKey(data: CreateApiKeyRequest): Promise<{ key: string; apiKey: ApiKeyData }> {
    const key = this.generateKey();
    const keyHash = this.hashKey(key);
    const id = randomBytes(16).toString('hex');

    const apiKeyData: Omit<ApiKey, 'lastUsedAt'> = {
      id,
      name: data.name,
      keyHash,
      userId: data.userId,
      scopes: data.scopes,
      expiresAt: data.expiresAt || null,
      createdAt: new Date(),
    };

    await db.insert(apiKeys).values(apiKeyData);

    const savedApiKey: ApiKeyData = {
      ...apiKeyData,
      lastUsedAt: undefined,
    };

    return { key, apiKey: savedApiKey };
  }

  /**
   * Validate an API key
   */
  static async validateApiKey(key: string): Promise<ApiKeyValidationResult> {
    try {
      if (!key || !key.startsWith('cb_live_')) {
        return { valid: false, error: 'Invalid API key format' };
      }

      const keyHash = this.hashKey(key);

      const apiKey = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.keyHash, keyHash))
        .limit(1);

      if (apiKey.length === 0) {
        return { valid: false, error: 'API key not found' };
      }

      const keyData = apiKey[0];

      // Check if key is expired
      if (keyData.expiresAt && new Date() > keyData.expiresAt) {
        return { valid: false, error: 'API key expired' };
      }

      // Update last used timestamp
      await db
        .update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, keyData.id));

      const result: ApiKeyData = {
        id: keyData.id,
        name: keyData.name,
        keyHash: keyData.keyHash,
        userId: keyData.userId,
        scopes: keyData.scopes || [],
        expiresAt: keyData.expiresAt || undefined,
        lastUsedAt: new Date(),
        createdAt: keyData.createdAt,
      };

      return { valid: true, apiKey: result };
    } catch (error) {
      console.error('API key validation error:', error);
      return { valid: false, error: 'Validation failed' };
    }
  }

  /**
   * Check if API key has required scope
   */
  static hasScope(apiKey: ApiKeyData, requiredScope: string): boolean {
    return apiKey.scopes.includes(requiredScope);
  }

  /**
   * Check if API key has any of the required scopes
   */
  static hasAnyScope(apiKey: ApiKeyData, requiredScopes: string[]): boolean {
    return requiredScopes.some(scope => apiKey.scopes.includes(scope));
  }

  /**
   * Get API keys for a user
   */
  static async getUserApiKeys(userId: string): Promise<Omit<ApiKeyData, 'keyHash'>[]> {
    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        userId: apiKeys.userId,
        scopes: apiKeys.scopes,
        expiresAt: apiKeys.expiresAt,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId));

    return keys.map(key => ({
      id: key.id,
      name: key.name,
      keyHash: '', // Don't return hash
      userId: key.userId,
      scopes: key.scopes || [],
      expiresAt: key.expiresAt || undefined,
      lastUsedAt: key.lastUsedAt || undefined,
      createdAt: key.createdAt,
    }));
  }

  /**
   * Revoke an API key
   */
  static async revokeApiKey(keyId: string, userId: string): Promise<boolean> {
    try {
      const result = await db
        .delete(apiKeys)
        .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)));

      return true;
    } catch (error) {
      console.error('API key revocation error:', error);
      return false;
    }
  }

  /**
   * Update API key (name, scopes, expiry)
   */
  static async updateApiKey(
    keyId: string,
    userId: string,
    updates: Partial<Pick<ApiKeyData, 'name' | 'scopes' | 'expiresAt'>>
  ): Promise<boolean> {
    try {
      await db
        .update(apiKeys)
        .set(updates)
        .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)));

      return true;
    } catch (error) {
      console.error('API key update error:', error);
      return false;
    }
  }

  /**
   * Clean up expired API keys
   */
  static async cleanupExpiredKeys(): Promise<number> {
    try {
      const result = await db
        .delete(apiKeys)
        .where(and(
          eq(apiKeys.expiresAt, new Date()),
          // Only delete keys that expired more than 7 days ago
        ));

      return 0; // TODO: Return actual count when drizzle supports it
    } catch (error) {
      console.error('API key cleanup error:', error);
      return 0;
    }
  }

  /**
   * Get default scopes for different user roles
   */
  static getDefaultScopesForRole(role: string): string[] {
    switch (role) {
      case 'super_admin':
        return [
          ApiKeyScope.READ_CHATBOTS,
          ApiKeyScope.READ_CONVERSATIONS,
          ApiKeyScope.READ_ANALYTICS,
          ApiKeyScope.READ_KNOWLEDGE_BASE,
          ApiKeyScope.WRITE_CHATBOTS,
          ApiKeyScope.WRITE_CONVERSATIONS,
          ApiKeyScope.WRITE_KNOWLEDGE_BASE,
          ApiKeyScope.ADMIN_USERS,
          ApiKeyScope.ADMIN_SETTINGS,
          ApiKeyScope.ADMIN_API_KEYS,
        ];

      case 'admin':
        return [
          ApiKeyScope.READ_CHATBOTS,
          ApiKeyScope.READ_CONVERSATIONS,
          ApiKeyScope.READ_ANALYTICS,
          ApiKeyScope.READ_KNOWLEDGE_BASE,
          ApiKeyScope.WRITE_CHATBOTS,
          ApiKeyScope.WRITE_CONVERSATIONS,
          ApiKeyScope.WRITE_KNOWLEDGE_BASE,
        ];

      case 'user':
        return [
          ApiKeyScope.READ_CHATBOTS,
          ApiKeyScope.READ_CONVERSATIONS,
          ApiKeyScope.PUBLIC_CHAT,
        ];

      default:
        return [ApiKeyScope.PUBLIC_CHAT];
    }
  }

  /**
   * Validate scope requirements for an endpoint
   */
  static validateScopeAccess(
    method: string,
    path: string,
    userScopes: string[]
  ): { allowed: boolean; requiredScopes: string[] } {
    const requiredScopes = this.getScopesForEndpoint(method, path);

    const allowed = requiredScopes.length === 0 ||
                   requiredScopes.some(scope => userScopes.includes(scope));

    return { allowed, requiredScopes };
  }

  /**
   * Get required scopes for API endpoint
   */
  private static getScopesForEndpoint(method: string, path: string): string[] {
    // Define scope requirements for different endpoints
    const endpointScopes: Record<string, string[]> = {
      // Chatbot endpoints
      'GET:/api/v1/chatbots': [ApiKeyScope.READ_CHATBOTS],
      'POST:/api/v1/chatbots': [ApiKeyScope.WRITE_CHATBOTS],
      'PUT:/api/v1/chatbots/*': [ApiKeyScope.WRITE_CHATBOTS],
      'DELETE:/api/v1/chatbots/*': [ApiKeyScope.WRITE_CHATBOTS],

      // Conversation endpoints
      'GET:/api/v1/conversations': [ApiKeyScope.READ_CONVERSATIONS],
      'POST:/api/v1/conversations': [ApiKeyScope.WRITE_CONVERSATIONS],

      // Knowledge base endpoints
      'GET:/api/v1/knowledge-base/*': [ApiKeyScope.READ_KNOWLEDGE_BASE],
      'POST:/api/v1/knowledge-base/*': [ApiKeyScope.WRITE_KNOWLEDGE_BASE],

      // Analytics endpoints
      'GET:/api/v1/analytics/*': [ApiKeyScope.READ_ANALYTICS],

      // Public endpoints
      'POST:/api/v1/public/chat/*': [ApiKeyScope.PUBLIC_CHAT],

      // Admin endpoints
      'GET:/api/v1/admin/users': [ApiKeyScope.ADMIN_USERS],
      'GET:/api/v1/admin/api-keys': [ApiKeyScope.ADMIN_API_KEYS],
    };

    const key = `${method}:${path}`;

    // Check for exact match first
    if (endpointScopes[key]) {
      return endpointScopes[key];
    }

    // Check for wildcard matches
    for (const [pattern, scopes] of Object.entries(endpointScopes)) {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace('*', '[^/]+'));
        if (regex.test(key)) {
          return scopes;
        }
      }
    }

    // Default: no special scopes required (protected by authentication only)
    return [];
  }
}