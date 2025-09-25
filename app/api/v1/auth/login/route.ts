import { NextRequest, NextResponse } from 'next/server';
import { CognitoAuthService } from '@/lib/cognito';
import { UserSyncService } from '@/lib/user-sync';
import { AuthTokenService, getSessionCookieOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required', code: 'MISSING_CREDENTIALS' },
        { status: 400 }
      );
    }

    // Authenticate with Cognito
    const authResult = await CognitoAuthService.login(email, password);

    if (!authResult.success || !authResult.user) {
      return NextResponse.json(
        {
          error: authResult.error || 'Authentication failed',
          code: 'AUTHENTICATION_FAILED'
        },
        { status: 401 }
      );
    }

    // Sync user with database
    const dbUser = await UserSyncService.syncUser(authResult.user);

    // Create session token
    const sessionToken = await AuthTokenService.createSession(dbUser);

    // Set session cookie
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
      value: sessionToken,
    });

    return response;

  } catch (error: any) {
    console.error('Login API error:', error);
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