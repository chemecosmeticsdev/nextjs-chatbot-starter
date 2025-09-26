import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService } from '@/lib/auth';
import { UserSyncService } from '@/lib/user-sync';
import { DrizzleSettingsService } from '@/lib/db/settings';
import { z } from 'zod';

// Validation schemas
const CreateSettingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.any(),
  description: z.string().optional(),
  is_public: z.boolean().default(false)
});

const AdminSettingsKeySchema = z.enum([
  'mistral_ocr_api_key',
  'aws_bedrock_credentials',
  'default_llm_model',
  's3_document_bucket',
  'embedding_model'
]);

export async function GET(request: NextRequest) {
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

    // Get admin settings
    const settings = await DrizzleSettingsService.getAdminSettings();

    return NextResponse.json({
      success: true,
      settings: settings
    });

  } catch (error: any) {
    console.error('Get admin settings error:', error);
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

    // Parse and validate request body
    const body = await request.json();
    const validatedData = CreateSettingSchema.parse(body);

    // Validate admin setting key
    const validKey = AdminSettingsKeySchema.parse(validatedData.key);

    // Create/update setting
    const setting = await DrizzleSettingsService.createOrUpdateSetting(
      validKey,
      validatedData.value,
      validatedData.description,
      validatedData.is_public,
      dbUser.id
    );

    // Log activity
    await DrizzleSettingsService.logSettingActivity(
      dbUser.id,
      'setting_create',
      validKey,
      request.ip || 'unknown',
      request.headers.get('user-agent') || 'unknown'
    );

    return NextResponse.json({
      success: true,
      setting: setting
    });

  } catch (error: any) {
    console.error('Create admin setting error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request data',
          code: 'VALIDATION_ERROR',
          details: error.errors
        },
        { status: 400 }
      );
    }

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