import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService } from '@/lib/auth';
import { UserSyncService } from '@/lib/user-sync';
import { DrizzleSettingsService } from '@/lib/db/settings';
import { z } from 'zod';

// Validation schemas
const UpdateSettingSchema = z.object({
  value: z.any(),
  description: z.string().optional(),
  is_public: z.boolean().optional()
});

const AdminSettingsKeySchema = z.enum([
  'mistral_ocr_api_key',
  'aws_bedrock_credentials',
  'default_llm_model',
  's3_document_bucket',
  'embedding_model'
]);

export async function PUT(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
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

    // Validate setting key
    const validKey = AdminSettingsKeySchema.parse(params.key);

    // Parse and validate request body
    const body = await request.json();
    const validatedData = UpdateSettingSchema.parse(body);

    // Update setting
    const setting = await DrizzleSettingsService.updateSetting(
      validKey,
      validatedData.value,
      validatedData.description,
      validatedData.is_public,
      dbUser.id
    );

    if (!setting) {
      return NextResponse.json(
        { error: 'Setting not found', code: 'SETTING_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Log activity
    await DrizzleSettingsService.logSettingActivity(
      dbUser.id,
      'setting_update',
      validKey,
      request.ip || 'unknown',
      request.headers.get('user-agent') || 'unknown'
    );

    return NextResponse.json({
      success: true,
      setting: setting
    });

  } catch (error: any) {
    console.error('Update admin setting error:', error);

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
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

    // Validate setting key
    const validKey = AdminSettingsKeySchema.parse(params.key);

    // Delete setting
    const deleted = await DrizzleSettingsService.deleteSetting(validKey);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Setting not found', code: 'SETTING_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Log activity
    await DrizzleSettingsService.logSettingActivity(
      dbUser.id,
      'setting_delete',
      validKey,
      request.ip || 'unknown',
      request.headers.get('user-agent') || 'unknown'
    );

    return NextResponse.json({
      success: true,
      message: 'Setting deleted successfully'
    });

  } catch (error: any) {
    console.error('Delete admin setting error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid setting key',
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