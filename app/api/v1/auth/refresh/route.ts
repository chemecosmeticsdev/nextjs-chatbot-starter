import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService, getSessionCookieOptions } from '@/lib/auth';
import { UserSyncService } from '@/lib/user-sync';

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('session')?.value;

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'No session found', code: 'NO_SESSION' },
        { status: 401 }
      );
    }

    // Verify current session
    const session = await AuthTokenService.verifySession(sessionToken);

    if (!session) {
      return NextResponse.json(
        { error: 'Invalid session', code: 'INVALID_SESSION' },
        { status: 401 }
      );
    }

    // Verify user still exists and is active
    const dbUser = await UserSyncService.getUserById(session.userId);

    if (!dbUser) {
      return NextResponse.json(
        { error: 'User not found or inactive', code: 'USER_NOT_FOUND' },
        { status: 401 }
      );
    }

    // Create new session token
    const newSessionToken = await AuthTokenService.createSession(dbUser);

    // Update user activity
    await UserSyncService.updateUserActivity(dbUser.id);

    // Set new session cookie
    const cookieOptions = getSessionCookieOptions();
    const response = NextResponse.json({
      success: true,
      user: {
        id: dbUser.id,
        email: dbUser.email,
        full_name: dbUser.full_name,
        role: dbUser.role,
      },
    });

    response.cookies.set({
      ...cookieOptions,
      value: newSessionToken,
    });

    return response;

  } catch (error: any) {
    console.error('Refresh API error:', error);
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