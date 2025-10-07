import { Client } from 'pg';
import { CognitoUser } from './cognito';

export interface DatabaseUser {
  id: string;
  email: string;
  full_name: string;
  role: 'super_admin' | 'admin' | 'user';
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at?: Date;
}

export class UserSyncService {
  private static async getDbClient(): Promise<Client> {
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
    });
    await client.connect();
    return client;
  }

  static async syncUser(cognitoUser: CognitoUser): Promise<DatabaseUser> {
    const client = await this.getDbClient();

    try {
      // Check if user already exists
      const existingUserQuery = `
        SELECT id, email, full_name, role, is_active, created_at, updated_at, last_login_at
        FROM users
        WHERE email = $1
      `;

      const existingUserResult = await client.query(existingUserQuery, [cognitoUser.email]);

      if (existingUserResult.rows.length > 0) {
        // User exists, update last login time
        const updateQuery = `
          UPDATE users
          SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE email = $1
          RETURNING id, email, full_name, role, is_active, created_at, updated_at, last_login_at
        `;

        const updateResult = await client.query(updateQuery, [cognitoUser.email]);
        return updateResult.rows[0] as DatabaseUser;
      } else {
        // User doesn't exist, create new user
        const insertQuery = `
          INSERT INTO users (email, password_hash, full_name, role, is_active, last_login_at)
          VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
          RETURNING id, email, full_name, role, is_active, created_at, updated_at, last_login_at
        `;

        // Use a placeholder password hash since authentication is handled by Cognito
        const passwordHash = 'cognito_managed';
        const fullName = cognitoUser.name || cognitoUser.email || 'Unknown User';

        // Determine role based on email (super admin check)
        const role = cognitoUser.email === process.env.SUPER_ADMIN_EMAIL ? 'super_admin' : 'user';

        const insertResult = await client.query(insertQuery, [
          cognitoUser.email,
          passwordHash,
          fullName,
          role,
          true
        ]);

        return insertResult.rows[0] as DatabaseUser;
      }
    } catch (error) {
      console.error('Database sync error:', error);
      throw new Error('Failed to sync user with database');
    } finally {
      await client.end();
    }
  }

  static async getUserById(userId: string): Promise<DatabaseUser | null> {
    const client = await this.getDbClient();

    try {
      const query = `
        SELECT id, email, full_name, role, is_active, created_at, updated_at, last_login_at
        FROM users
        WHERE id = $1 AND is_active = true
      `;

      const result = await client.query(query, [userId]);

      if (result.rows.length > 0) {
        return result.rows[0] as DatabaseUser;
      }

      return null;
    } catch (error) {
      console.error('Get user by ID error:', error);
      return null;
    } finally {
      await client.end();
    }
  }

  static async getUserByEmail(email: string): Promise<DatabaseUser | null> {
    const client = await this.getDbClient();

    try {
      const query = `
        SELECT id, email, full_name, role, is_active, created_at, updated_at, last_login_at
        FROM users
        WHERE email = $1 AND is_active = true
      `;

      const result = await client.query(query, [email]);

      if (result.rows.length > 0) {
        return result.rows[0] as DatabaseUser;
      }

      return null;
    } catch (error) {
      console.error('Get user by email error:', error);
      return null;
    } finally {
      await client.end();
    }
  }

  static async updateUserActivity(userId: string): Promise<void> {
    const client = await this.getDbClient();

    try {
      const query = `
        UPDATE users
        SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `;

      await client.query(query, [userId]);
    } catch (error) {
      console.error('Update user activity error:', error);
    } finally {
      await client.end();
    }
  }

  static async getAllUsers(options: {
    limit?: number;
    offset?: number;
    includeInactive?: boolean;
    searchTerm?: string;
    roleFilter?: string;
  } = {}): Promise<{ users: DatabaseUser[]; total: number }> {
    const client = await this.getDbClient();
    const { limit = 50, offset = 0, includeInactive = true, searchTerm, roleFilter } = options;

    try {
      // Build WHERE conditions
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (!includeInactive) {
        conditions.push(`is_active = $${paramIndex}`);
        params.push(true);
        paramIndex++;
      }

      if (searchTerm) {
        conditions.push(`(full_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
        params.push(`%${searchTerm}%`);
        paramIndex++;
      }

      if (roleFilter) {
        conditions.push(`role = $${paramIndex}`);
        params.push(roleFilter);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM users
        ${whereClause}
      `;

      const countResult = await client.query(countQuery, params);
      const total = parseInt(countResult.rows[0].total);

      // Get users with pagination
      const usersQuery = `
        SELECT id, email, full_name, role, is_active, created_at, updated_at, last_login_at
        FROM users
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      const usersResult = await client.query(usersQuery, [...params, limit, offset]);

      return {
        users: usersResult.rows as DatabaseUser[],
        total
      };
    } catch (error) {
      console.error('Get all users error:', error);
      return { users: [], total: 0 };
    } finally {
      await client.end();
    }
  }
}