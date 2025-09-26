import { eq, sql, inArray } from 'drizzle-orm';
import { db } from './connection';
import {
  systemSettings,
  users,
  activityLogs,
  AdminSettingsKey,
  AdminSetting,
  SystemSetting,
  NewSystemSetting,
  NewActivityLog,
  AwsBedrockCredentials
} from './schema';

export class DrizzleSettingsService {
  /**
   * Mask sensitive values for display in UI
   */
  private static maskSensitiveValue(key: AdminSettingsKey, value: any): string | any {
    const sensitiveKeys: AdminSettingsKey[] = ['mistral_ocr_api_key', 'aws_bedrock_credentials'];

    if (!sensitiveKeys.includes(key)) {
      return value;
    }

    if (typeof value === 'string') {
      return value.length > 8 ?
        `${value.substring(0, 4)}${'*'.repeat(value.length - 8)}${value.substring(value.length - 4)}` :
        '*'.repeat(value.length);
    }

    if (typeof value === 'object' && value !== null) {
      const masked = { ...value };
      for (const [objKey, objValue] of Object.entries(masked)) {
        if (typeof objValue === 'string' && (objKey.toLowerCase().includes('key') || objKey.toLowerCase().includes('secret'))) {
          masked[objKey] = objValue.length > 8 ?
            `${objValue.substring(0, 4)}${'*'.repeat(objValue.length - 8)}${objValue.substring(objValue.length - 4)}` :
            '*'.repeat(objValue.length);
        }
      }
      return masked;
    }

    return value;
  }

  /**
   * Get all admin settings with masked sensitive data
   */
  static async getAdminSettings(): Promise<AdminSetting[]> {
    try {
      const adminKeys: AdminSettingsKey[] = [
        'mistral_ocr_api_key',
        'aws_bedrock_credentials',
        'default_llm_model',
        's3_document_bucket',
        'embedding_model'
      ];

      const result = await db
        .select({
          key: systemSettings.key,
          value: systemSettings.value,
          description: systemSettings.description,
          isPublic: systemSettings.isPublic,
          updatedAt: systemSettings.updatedAt,
          updatedByName: users.fullName,
        })
        .from(systemSettings)
        .leftJoin(users, eq(systemSettings.updatedBy, users.id))
        .where(inArray(systemSettings.key, adminKeys))
        .orderBy(systemSettings.key);

      return result.map(row => {
        const key = row.key as AdminSettingsKey;
        const sensitiveKeys: AdminSettingsKey[] = ['mistral_ocr_api_key', 'aws_bedrock_credentials'];
        const is_sensitive = sensitiveKeys.includes(key);

        return {
          key,
          value: is_sensitive ? undefined : row.value,
          masked_value: is_sensitive ? this.maskSensitiveValue(key, row.value) : undefined,
          description: row.description || undefined,
          is_sensitive,
          updated_at: row.updatedAt!,
          updated_by_name: row.updatedByName || undefined
        };
      });

    } catch (error) {
      console.error('Get admin settings error:', error);
      throw new Error('Failed to retrieve admin settings');
    }
  }

  /**
   * Get a specific setting by key
   */
  static async getSetting(key: AdminSettingsKey): Promise<SystemSetting | null> {
    try {
      const result = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, key))
        .limit(1);

      return result.length > 0 ? result[0] : null;

    } catch (error) {
      console.error('Get setting error:', error);
      return null;
    }
  }

  /**
   * Create or update a setting (upsert)
   */
  static async createOrUpdateSetting(
    key: AdminSettingsKey,
    value: any,
    description?: string,
    isPublic: boolean = false,
    updatedBy?: string
  ): Promise<SystemSetting> {
    try {
      const settingData: NewSystemSetting = {
        key,
        value,
        description,
        isPublic,
        updatedBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await db
        .insert(systemSettings)
        .values(settingData)
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: {
            value: sql`EXCLUDED.value`,
            description: sql`EXCLUDED.description`,
            isPublic: sql`EXCLUDED.is_public`,
            updatedBy: sql`EXCLUDED.updated_by`,
            updatedAt: new Date(),
          }
        })
        .returning();

      return result[0];

    } catch (error) {
      console.error('Create/update setting error:', error);
      throw new Error('Failed to create or update setting');
    }
  }

  /**
   * Update an existing setting
   */
  static async updateSetting(
    key: AdminSettingsKey,
    value: any,
    description?: string,
    isPublic?: boolean,
    updatedBy?: string
  ): Promise<SystemSetting | null> {
    try {
      // First check if setting exists
      const existingSetting = await this.getSetting(key);
      if (!existingSetting) {
        return null;
      }

      // Build update object dynamically
      const updateData: Partial<SystemSetting> = {
        value,
        updatedAt: new Date(),
      };

      if (description !== undefined) {
        updateData.description = description;
      }

      if (isPublic !== undefined) {
        updateData.isPublic = isPublic;
      }

      if (updatedBy !== undefined) {
        updateData.updatedBy = updatedBy;
      }

      const result = await db
        .update(systemSettings)
        .set(updateData)
        .where(eq(systemSettings.key, key))
        .returning();

      return result.length > 0 ? result[0] : null;

    } catch (error) {
      console.error('Update setting error:', error);
      throw new Error('Failed to update setting');
    }
  }

  /**
   * Delete a setting
   */
  static async deleteSetting(key: AdminSettingsKey): Promise<boolean> {
    try {
      const result = await db
        .delete(systemSettings)
        .where(eq(systemSettings.key, key));

      return result.rowCount !== null && result.rowCount > 0;

    } catch (error) {
      console.error('Delete setting error:', error);
      throw new Error('Failed to delete setting');
    }
  }

  /**
   * Log setting activity to activity_logs table
   */
  static async logSettingActivity(
    userId: string,
    activityType: string,
    entityId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      const logData: NewActivityLog = {
        userId,
        activityType,
        entityType: 'system_setting',
        entityId,
        description: `Admin setting ${activityType.replace('setting_', '')}d: ${entityId}`,
        metadata: { setting_key: entityId },
        ipAddress,
        userAgent,
        createdAt: new Date(),
      };

      await db.insert(activityLogs).values(logData);

    } catch (error) {
      console.error('Log setting activity error:', error);
      // Don't throw error for logging failure to avoid breaking the main operation
    }
  }

  /**
   * Initialize default settings from environment variables
   */
  static async initializeDefaultSettings(): Promise<void> {
    try {
      // Get existing settings
      const adminKeysForInit: AdminSettingsKey[] = [
        'mistral_ocr_api_key',
        'aws_bedrock_credentials',
        'default_llm_model',
        's3_document_bucket',
        'embedding_model'
      ];

      const existingSettings = await db
        .select({ key: systemSettings.key })
        .from(systemSettings)
        .where(inArray(systemSettings.key, adminKeysForInit));

      const existingKeys = new Set(existingSettings.map(s => s.key));

      // Define default settings
      const defaultSettings: Array<{
        key: AdminSettingsKey;
        value: any;
        description: string;
      }> = [
        {
          key: 'aws_bedrock_credentials',
          value: {
            accessKeyId: process.env.BAWS_ACCESS_KEY_ID || '',
            secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY || '',
            region: process.env.BEDROCK_REGION || 'us-east-1'
          } as AwsBedrockCredentials,
          description: 'AWS Bedrock service credentials for LLM operations'
        },
        {
          key: 'default_llm_model',
          value: 'amazon.nova-micro-v1:0',
          description: 'Default LLM model for chatbot classification tasks'
        },
        {
          key: 's3_document_bucket',
          value: process.env.S3_DOCUMENT_BUCKET || 'chatbot-documents',
          description: 'S3 bucket for storing uploaded documents'
        },
        {
          key: 'embedding_model',
          value: 'amazon.titan-embed-text-v1',
          description: 'Embedding model for vector search (read-only)'
        },
        {
          key: 'mistral_ocr_api_key',
          value: process.env.MISTRAL_API_KEY || '',
          description: 'Mistral API key for OCR text extraction'
        }
      ];

      // Insert missing settings
      for (const setting of defaultSettings) {
        if (!existingKeys.has(setting.key)) {
          await this.createOrUpdateSetting(
            setting.key,
            setting.value,
            setting.description,
            false
          );
        }
      }

    } catch (error) {
      console.error('Initialize default settings error:', error);
      throw new Error('Failed to initialize default settings');
    }
  }
}