import { NextRequest, NextResponse } from 'next/server';
import { CognitoAuthService } from '@/lib/cognito';
import { clearSessionCookie } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Sign out from Cognito
    await CognitoAuthService.logout();

    // Clear session cookie
    const cookieOptions = clearSessionCookie();
    const response = NextResponse.json({
      success: true,
      message: 'Successfully logged out'
    });

    response.cookies.set(cookieOptions);

    return response;

  } catch (error: any) {
    console.error('Logout API error:', error);

    // Even if Cognito logout fails, clear the session cookie
    const cookieOptions = clearSessionCookie();
    const response = NextResponse.json({
      success: true,
      message: 'Logged out (with warnings)',
      warning: 'There was an issue with remote logout, but local session has been cleared'
    });

    response.cookies.set(cookieOptions);

    return response;
  }
}