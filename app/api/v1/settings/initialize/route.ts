import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService } from '@/lib/auth';
import { UserSyncService } from '@/lib/user-sync';
import { SystemSettingsService } from '@/lib/system-settings';

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('session')?.value;

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'No session found', code: 'NO_SESSION' },
        { status: 401 }
      );
    }

    // Verify session and check admin role
    const session = await AuthTokenService.verifySession(sessionToken);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid session', code: 'INVALID_SESSION' },
        { status: 401 }
      );
    }

    const dbUser = await UserSyncService.getUserById(session.userId);
    if (!dbUser || dbUser.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Access denied. Super admin role required.', code: 'ACCESS_DENIED' },
        { status: 403 }
      );
    }

    // Initialize default settings
    await SystemSettingsService.initializeDefaultSettings();

    // Log activity
    await SystemSettingsService.logSettingActivity(
      dbUser.id,
      'settings_initialized',
      'admin_settings',
      request.ip || 'unknown',
      request.headers.get('user-agent') || 'unknown'
    );

    return NextResponse.json({
      success: true,
      message: 'Default admin settings initialized successfully'
    });

  } catch (error: any) {
    console.error('Initialize admin settings error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}