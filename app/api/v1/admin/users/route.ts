import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService } from '@/lib/auth';
import { UserSyncService, DatabaseUser } from '@/lib/user-sync';
import { AuditLogger, SecurityEventType } from '@/lib/security/audit-logger';

interface UserListResponse {
  id: string;
  email: string;
  full_name: string;
  role: 'user' | 'admin' | 'super_admin';
  status: 'active' | 'inactive' | 'suspended';
  created_at: string;
  last_login: string;
  avatar_url?: string;
  phone?: string;
  department?: string;
}

export async function GET(request: NextRequest) {
  try {
    // Verify authentication and require super_admin role
    const sessionData = await AuthTokenService.verifyRequest(request);

    if (!sessionData || !sessionData.userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get the requesting user to verify super_admin role
    const requestingUser = await UserSyncService.getUserById(sessionData.userId);

    if (!requestingUser || requestingUser.role !== 'super_admin') {
      // Log unauthorized access attempt
      await AuditLogger.logSecurityEvent({
        userId: sessionData.userId,
        eventType: SecurityEventType.UNAUTHORIZED_ACCESS,
        severity: 'warning',
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        endpoint: '/api/v1/admin/users',
        method: 'GET',
        details: {
          reason: 'Insufficient permissions for user management',
          requiredRole: 'super_admin',
          actualRole: requestingUser?.role || 'unknown'
        }
      });

      return NextResponse.json(
        { error: 'Super admin access required' },
        { status: 403 }
      );
    }

    // Parse query parameters
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const includeInactive = url.searchParams.get('includeInactive') === 'true';
    const searchTerm = url.searchParams.get('search') || undefined;
    const roleFilter = url.searchParams.get('role') || undefined;

    // Fetch users from database
    const { users, total } = await UserSyncService.getAllUsers({
      limit: Math.min(limit, 100), // Cap at 100 for performance
      offset,
      includeInactive,
      searchTerm,
      roleFilter
    });

    // Transform database users to API response format
    const transformedUsers: UserListResponse[] = users.map((user: DatabaseUser) => ({
      id: user.id,
      email: user.email,
      full_name: user.full_name || user.email,
      role: user.role as 'user' | 'admin' | 'super_admin',
      status: user.is_active ? 'active' : 'inactive',
      created_at: user.created_at.toISOString(),
      last_login: user.last_login_at ? user.last_login_at.toISOString() : 'Never',
      // Optional fields (not in database yet, but expected by frontend)
      avatar_url: undefined,
      phone: undefined,
      department: user.role === 'super_admin' ? 'Engineering' :
                 user.role === 'admin' ? 'Operations' : 'General'
    }));

    // Log successful access for audit trail
    await AuditLogger.logSecurityEvent({
      userId: sessionData.userId,
      eventType: SecurityEventType.DATA_ACCESS,
      severity: 'info',
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      endpoint: '/api/v1/admin/users',
      method: 'GET',
      details: {
        action: 'list_users',
        totalUsers: total,
        returnedUsers: transformedUsers.length,
        filters: { searchTerm, roleFilter, includeInactive }
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        users: transformedUsers,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      }
    });

  } catch (error) {
    console.error('Admin users API error:', error);

    // Log error for investigation
    await AuditLogger.logSecurityEvent({
      eventType: SecurityEventType.SYSTEM_ERROR,
      severity: 'critical',
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      endpoint: '/api/v1/admin/users',
      method: 'GET',
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}