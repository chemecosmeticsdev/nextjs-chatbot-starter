import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService } from '@/lib/auth';
import { UserSyncService } from '@/lib/user-sync';

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('session')?.value;

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'No session found', code: 'NO_SESSION' },
        { status: 401 }
      );
    }

    // Verify session
    const session = await AuthTokenService.verifySession(sessionToken);

    if (!session) {
      return NextResponse.json(
        { error: 'Invalid session', code: 'INVALID_SESSION' },
        { status: 401 }
      );
    }

    // Get current user data from database
    const dbUser = await UserSyncService.getUserById(session.userId);

    if (!dbUser) {
      return NextResponse.json(
        { error: 'User not found or inactive', code: 'USER_NOT_FOUND' },
        { status: 401 }
      );
    }

    // Update last activity
    await UserSyncService.updateUserActivity(dbUser.id);

    return NextResponse.json({
      success: true,
      user: {
        id: dbUser.id,
        email: dbUser.email,
        full_name: dbUser.full_name,
        role: dbUser.role,
        is_active: dbUser.is_active,
        created_at: dbUser.created_at,
        last_login_at: dbUser.last_login_at,
      },
    });

  } catch (error: any) {
    console.error('Get user API error:', error);
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