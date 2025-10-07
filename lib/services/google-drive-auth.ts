import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { GoogleDriveCredentials, GoogleDriveService } from './google-drive';

/**
 * Google Drive Authentication Service
 * Handles secure storage and retrieval of Google Drive OAuth credentials
 */
export class GoogleDriveAuthService {
  private static encryptionKey = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
  private static algorithm = 'aes-256-gcm';

  /**
   * Encrypt sensitive credential data
   */
  private static encrypt(text: string): string {
    try {
      const iv = crypto.randomBytes(16);
      const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
      const cipher = crypto.createCipherGCM(this.algorithm, key, iv);

      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();
      return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    } catch (error) {
      console.error('Error encrypting credential:', error);
      throw new Error('Failed to encrypt credential');
    }
  }

  /**
   * Decrypt sensitive credential data
   */
  private static decrypt(encryptedText: string): string {
    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted text format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];

      const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
      const decipher = crypto.createDecipherGCM(this.algorithm, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error('Error decrypting credential:', error);
      throw new Error('Failed to decrypt credential');
    }
  }

  /**
   * Store Google Drive credentials for a user
   */
  static async storeCredentials(userId: string, credentials: GoogleDriveCredentials): Promise<void> {
    try {
      console.log(`[GoogleDriveAuth] Storing credentials for user ${userId}`);

      // Encrypt sensitive tokens
      const encryptedAccessToken = credentials.access_token ? this.encrypt(credentials.access_token) : null;
      const encryptedRefreshToken = credentials.refresh_token ? this.encrypt(credentials.refresh_token) : null;

      // Calculate token expiry if provided
      let tokenExpiry: Date | null = null;
      if (credentials.expiry_date) {
        tokenExpiry = new Date(credentials.expiry_date);
      }

      // Update user record with encrypted credentials
      await db
        .update(users)
        .set({
          googleDriveAccessToken: encryptedAccessToken,
          googleDriveRefreshToken: encryptedRefreshToken,
          googleDriveTokenExpiry: tokenExpiry,
          googleDriveScopes: credentials.scope || 'https://www.googleapis.com/auth/drive.readonly',
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));

      console.log(`[GoogleDriveAuth] Successfully stored credentials for user ${userId}`);
    } catch (error) {
      console.error(`[GoogleDriveAuth] Error storing credentials for user ${userId}:`, error);
      throw new Error('Failed to store Google Drive credentials');
    }
  }

  /**
   * Retrieve Google Drive credentials for a user
   */
  static async getCredentials(userId: string): Promise<GoogleDriveCredentials | null> {
    try {
      console.log(`[GoogleDriveAuth] Retrieving credentials for user ${userId}`);

      // Get user record with Google Drive credentials
      const userResult = await db
        .select({
          googleDriveAccessToken: users.googleDriveAccessToken,
          googleDriveRefreshToken: users.googleDriveRefreshToken,
          googleDriveTokenExpiry: users.googleDriveTokenExpiry,
          googleDriveScopes: users.googleDriveScopes
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (userResult.length === 0) {
        console.log(`[GoogleDriveAuth] User ${userId} not found`);
        return null;
      }

      const user = userResult[0];

      // Check if user has Google Drive credentials
      if (!user.googleDriveAccessToken) {
        console.log(`[GoogleDriveAuth] No Google Drive credentials found for user ${userId}`);
        return null;
      }

      // Decrypt credentials
      const accessToken = this.decrypt(user.googleDriveAccessToken);
      const refreshToken = user.googleDriveRefreshToken ? this.decrypt(user.googleDriveRefreshToken) : undefined;

      const credentials: GoogleDriveCredentials = {
        access_token: accessToken,
        refresh_token: refreshToken,
        scope: user.googleDriveScopes || undefined,
        token_type: 'Bearer',
        expiry_date: user.googleDriveTokenExpiry ? user.googleDriveTokenExpiry.getTime() : undefined
      };

      console.log(`[GoogleDriveAuth] Successfully retrieved credentials for user ${userId}`);
      return credentials;
    } catch (error) {
      console.error(`[GoogleDriveAuth] Error retrieving credentials for user ${userId}:`, error);
      throw new Error('Failed to retrieve Google Drive credentials');
    }
  }

  /**
   * Create an authenticated GoogleDriveService instance for a user
   */
  static async createAuthenticatedService(userId: string): Promise<GoogleDriveService | null> {
    try {
      const credentials = await this.getCredentials(userId);

      if (!credentials) {
        console.log(`[GoogleDriveAuth] No credentials available for user ${userId}, cannot create authenticated service`);
        return null;
      }

      // Check if token is expired (with 5 minute buffer)
      if (credentials.expiry_date) {
        const expiryTime = new Date(credentials.expiry_date);
        const bufferTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

        if (expiryTime < bufferTime) {
          console.log(`[GoogleDriveAuth] Token for user ${userId} is expired or expiring soon, attempting refresh`);

          if (credentials.refresh_token) {
            // Attempt to refresh the token
            const refreshedCredentials = await this.refreshToken(userId, credentials.refresh_token);
            if (refreshedCredentials) {
              return new GoogleDriveService(refreshedCredentials);
            }
          }

          console.warn(`[GoogleDriveAuth] Unable to refresh token for user ${userId}`);
          return null;
        }
      }

      console.log(`[GoogleDriveAuth] Creating authenticated GoogleDriveService for user ${userId}`);
      return new GoogleDriveService(credentials);
    } catch (error) {
      console.error(`[GoogleDriveAuth] Error creating authenticated service for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Refresh expired Google Drive token
   */
  private static async refreshToken(userId: string, refreshToken: string): Promise<GoogleDriveCredentials | null> {
    try {
      console.log(`[GoogleDriveAuth] Refreshing token for user ${userId}`);

      // Create a temporary service to refresh the token
      const tempService = new GoogleDriveService({
        access_token: 'temp', // Will be replaced by refresh
        refresh_token: refreshToken
      });

      // Use Google's OAuth2 client to refresh
      const oauth2Client = (tempService as any).oauth2Client;
      const { credentials } = await oauth2Client.refreshAccessToken();

      const newCredentials: GoogleDriveCredentials = {
        access_token: credentials.access_token!,
        refresh_token: credentials.refresh_token || refreshToken, // Keep existing if not provided
        scope: credentials.scope,
        token_type: credentials.token_type,
        expiry_date: credentials.expiry_date
      };

      // Store the refreshed credentials
      await this.storeCredentials(userId, newCredentials);

      console.log(`[GoogleDriveAuth] Successfully refreshed token for user ${userId}`);
      return newCredentials;
    } catch (error) {
      console.error(`[GoogleDriveAuth] Error refreshing token for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Clear Google Drive credentials for a user
   */
  static async clearCredentials(userId: string): Promise<void> {
    try {
      console.log(`[GoogleDriveAuth] Clearing credentials for user ${userId}`);

      await db
        .update(users)
        .set({
          googleDriveAccessToken: null,
          googleDriveRefreshToken: null,
          googleDriveTokenExpiry: null,
          googleDriveScopes: null,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));

      console.log(`[GoogleDriveAuth] Successfully cleared credentials for user ${userId}`);
    } catch (error) {
      console.error(`[GoogleDriveAuth] Error clearing credentials for user ${userId}:`, error);
      throw new Error('Failed to clear Google Drive credentials');
    }
  }

  /**
   * Check if user has valid Google Drive credentials
   */
  static async hasValidCredentials(userId: string): Promise<boolean> {
    try {
      const credentials = await this.getCredentials(userId);
      return credentials !== null;
    } catch (error) {
      console.error(`[GoogleDriveAuth] Error checking credentials for user ${userId}:`, error);
      return false;
    }
  }
}