import { Client } from 'pg';

export interface SystemSetting {
  key: string;
  value: any;
  description?: string;
  is_public: boolean;
  updated_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface AdminSetting {
  key: string;
  value: any;
  description?: string;
  is_sensitive: boolean;
  masked_value?: string;
  updated_at: Date;
  updated_by_name?: string;
}

export type AdminSettingsKey =
  | 'mistral_ocr_api_key'
  | 'aws_bedrock_credentials'
  | 'default_llm_model'
  | 's3_document_bucket'
  | 'embedding_model';

export class SystemSettingsService {
  private static async getDbClient(): Promise<Client> {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
    });
    await client.connect();
    return client;
  }

  private static maskSensitiveValue(key: AdminSettingsKey, value: any): string | any {
    const sensitiveKeys = ['mistral_ocr_api_key', 'aws_bedrock_credentials'];

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
        if (typeof objValue === 'string' && objKey.toLowerCase().includes('key') || objKey.toLowerCase().includes('secret')) {
          masked[objKey] = objValue.length > 8 ?
            `${objValue.substring(0, 4)}${'*'.repeat(objValue.length - 8)}${objValue.substring(objValue.length - 4)}` :
            '*'.repeat(objValue.length);
        }
      }
      return masked;
    }

    return value;
  }

  private static encryptSensitiveValue(key: AdminSettingsKey, value: any): any {
    const sensitiveKeys = ['mistral_ocr_api_key', 'aws_bedrock_credentials'];

    if (!sensitiveKeys.includes(key)) {
      return value;
    }

    // For now, we'll store as-is in JSONB, but in production you'd use pgcrypto
    // Example: SELECT pgp_sym_encrypt($1, $2) for encryption
    return value;
  }

  private static decryptSensitiveValue(key: AdminSettingsKey, value: any): any {
    const sensitiveKeys = ['mistral_ocr_api_key', 'aws_bedrock_credentials'];

    if (!sensitiveKeys.includes(key)) {
      return value;
    }

    // For now, return as-is, but in production you'd decrypt
    // Example: SELECT pgp_sym_decrypt($1, $2) for decryption
    return value;
  }

  static async getAdminSettings(): Promise<AdminSetting[]> {
    const client = await this.getDbClient();

    try {
      const query = `
        SELECT
          ss.key,
          ss.value,
          ss.description,
          ss.is_public,
          ss.updated_at,
          u.full_name as updated_by_name
        FROM system_settings ss
        LEFT JOIN users u ON ss.updated_by = u.id
        WHERE ss.key IN ($1, $2, $3, $4, $5)
        ORDER BY ss.key
      `;

      const adminKeys: AdminSettingsKey[] = [
        'mistral_ocr_api_key',
        'aws_bedrock_credentials',
        'default_llm_model',
        's3_document_bucket',
        'embedding_model'
      ];

      const result = await client.query(query, adminKeys);

      return result.rows.map(row => {
        const key = row.key as AdminSettingsKey;
        const sensitiveKeys = ['mistral_ocr_api_key', 'aws_bedrock_credentials'];
        const is_sensitive = sensitiveKeys.includes(key);
        const decryptedValue = this.decryptSensitiveValue(key, row.value);

        return {
          key,
          value: is_sensitive ? undefined : decryptedValue,
          masked_value: is_sensitive ? this.maskSensitiveValue(key, decryptedValue) : undefined,
          description: row.description,
          is_sensitive,
          updated_at: row.updated_at,
          updated_by_name: row.updated_by_name
        };
      });

    } catch (error) {
      console.error('Get admin settings error:', error);
      throw new Error('Failed to retrieve admin settings');
    } finally {
      await client.end();
    }
  }

  static async getSetting(key: AdminSettingsKey): Promise<SystemSetting | null> {
    const client = await this.getDbClient();

    try {
      const query = `
        SELECT key, value, description, is_public, updated_by, created_at, updated_at
        FROM system_settings
        WHERE key = $1
      `;

      const result = await client.query(query, [key]);

      if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
          ...row,
          value: this.decryptSensitiveValue(key, row.value)
        };
      }

      return null;
    } catch (error) {
      console.error('Get setting error:', error);
      return null;
    } finally {
      await client.end();
    }
  }

  static async createOrUpdateSetting(
    key: AdminSettingsKey,
    value: any,
    description?: string,
    is_public: boolean = false,
    updated_by?: string
  ): Promise<SystemSetting> {
    const client = await this.getDbClient();

    try {
      const encryptedValue = this.encryptSensitiveValue(key, value);

      const query = `
        INSERT INTO system_settings (key, value, description, is_public, updated_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (key)
        DO UPDATE SET
          value = EXCLUDED.value,
          description = EXCLUDED.description,
          is_public = EXCLUDED.is_public,
          updated_by = EXCLUDED.updated_by,
          updated_at = CURRENT_TIMESTAMP
        RETURNING key, value, description, is_public, updated_by, created_at, updated_at
      `;

      const result = await client.query(query, [
        key,
        JSON.stringify(encryptedValue),
        description,
        is_public,
        updated_by
      ]);

      const row = result.rows[0];
      return {
        ...row,
        value: this.decryptSensitiveValue(key, JSON.parse(row.value))
      };

    } catch (error) {
      console.error('Create/update setting error:', error);
      throw new Error('Failed to create or update setting');
    } finally {
      await client.end();
    }
  }

  static async updateSetting(
    key: AdminSettingsKey,
    value: any,
    description?: string,
    is_public?: boolean,
    updated_by?: string
  ): Promise<SystemSetting | null> {
    const client = await this.getDbClient();

    try {
      // First check if setting exists
      const existsQuery = 'SELECT key FROM system_settings WHERE key = $1';
      const existsResult = await client.query(existsQuery, [key]);

      if (existsResult.rows.length === 0) {
        return null;
      }

      const encryptedValue = this.encryptSensitiveValue(key, value);

      // Build dynamic update query
      const updates = [];
      const values = [];
      let paramIndex = 2;

      updates.push('value = $' + paramIndex++);
      values.push(JSON.stringify(encryptedValue));

      if (description !== undefined) {
        updates.push('description = $' + paramIndex++);
        values.push(description);
      }

      if (is_public !== undefined) {
        updates.push('is_public = $' + paramIndex++);
        values.push(is_public);
      }

      if (updated_by !== undefined) {
        updates.push('updated_by = $' + paramIndex++);
        values.push(updated_by);
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');

      const query = `
        UPDATE system_settings
        SET ${updates.join(', ')}
        WHERE key = $1
        RETURNING key, value, description, is_public, updated_by, created_at, updated_at
      `;

      const result = await client.query(query, [key, ...values]);

      if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
          ...row,
          value: this.decryptSensitiveValue(key, JSON.parse(row.value))
        };
      }

      return null;

    } catch (error) {
      console.error('Update setting error:', error);
      throw new Error('Failed to update setting');
    } finally {
      await client.end();
    }
  }

  static async deleteSetting(key: AdminSettingsKey): Promise<boolean> {
    const client = await this.getDbClient();

    try {
      const query = 'DELETE FROM system_settings WHERE key = $1';
      const result = await client.query(query, [key]);

      return result.rowCount !== null && result.rowCount > 0;

    } catch (error) {
      console.error('Delete setting error:', error);
      throw new Error('Failed to delete setting');
    } finally {
      await client.end();
    }
  }

  static async logSettingActivity(
    user_id: string,
    activity_type: string,
    entity_id: string,
    ip_address?: string,
    user_agent?: string
  ): Promise<void> {
    const client = await this.getDbClient();

    try {
      const query = `
        INSERT INTO activity_logs (
          user_id,
          activity_type,
          entity_type,
          entity_id,
          description,
          metadata,
          ip_address,
          user_agent,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      `;

      await client.query(query, [
        user_id,
        activity_type,
        'system_setting',
        entity_id,
        `Admin setting ${activity_type.replace('setting_', '')}d: ${entity_id}`,
        JSON.stringify({ setting_key: entity_id }),
        ip_address,
        user_agent
      ]);

    } catch (error) {
      console.error('Log setting activity error:', error);
      // Don't throw error for logging failure
    } finally {
      await client.end();
    }
  }

  static async initializeDefaultSettings(): Promise<void> {
    const client = await this.getDbClient();

    try {
      // Check if settings already exist
      const existingQuery = `
        SELECT key FROM system_settings
        WHERE key IN ($1, $2, $3, $4, $5)
      `;

      const adminKeys: AdminSettingsKey[] = [
        'mistral_ocr_api_key',
        'aws_bedrock_credentials',
        'default_llm_model',
        's3_document_bucket',
        'embedding_model'
      ];

      const existingResult = await client.query(existingQuery, adminKeys);
      const existingKeys = existingResult.rows.map(row => row.key);

      // Initialize missing settings with default values from environment
      const defaultSettings = [
        {
          key: 'aws_bedrock_credentials' as AdminSettingsKey,
          value: {
            accessKeyId: process.env.BAWS_ACCESS_KEY_ID || '',
            secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY || '',
            region: process.env.BEDROCK_REGION || 'us-east-1'
          },
          description: 'AWS Bedrock service credentials for LLM operations'
        },
        {
          key: 'default_llm_model' as AdminSettingsKey,
          value: 'amazon.nova-micro-v1:0',
          description: 'Default LLM model for chatbot classification tasks'
        },
        {
          key: 's3_document_bucket' as AdminSettingsKey,
          value: process.env.S3_DOCUMENT_BUCKET || 'chatbot-documents',
          description: 'S3 bucket for storing uploaded documents'
        },
        {
          key: 'embedding_model' as AdminSettingsKey,
          value: 'amazon.titan-embed-text-v1',
          description: 'Embedding model for vector search (read-only)'
        },
        {
          key: 'mistral_ocr_api_key' as AdminSettingsKey,
          value: process.env.MISTRAL_OCR_API_KEY || '',
          description: 'Mistral API key for OCR text extraction'
        }
      ];

      for (const setting of defaultSettings) {
        if (!existingKeys.includes(setting.key)) {
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
    } finally {
      await client.end();
    }
  }
}