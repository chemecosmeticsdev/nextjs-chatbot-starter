import { NextRequest, NextResponse } from 'next/server';
import { ApiVersioning, versionConfig } from '@/lib/middleware/api-versioning';
import { createSuccessResponse, createErrorResponse } from '@/lib/utils/api-response';

/**
 * API Version Information Endpoint
 * GET /api/v1/version
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedVersion = searchParams.get('version');

    if (requestedVersion) {
      // Get specific version information
      const validation = ApiVersioning.validateVersion(requestedVersion);

      if (!validation.valid) {
        const errorResponse = createErrorResponse(validation.error!, 'INVALID_VERSION', {
          code: 'INVALID_VERSION'
        });
        return NextResponse.json(errorResponse, { status: 400 });
      }

      const warnings = ApiVersioning.generateVersionWarnings(validation.versionInfo!);
      const migrationGuide = validation.versionInfo!.version !== versionConfig.current
        ? ApiVersioning.getMigrationGuide(validation.versionInfo!.version, versionConfig.current)
        : null;

      const successResponse = createSuccessResponse({
        version: validation.versionInfo!,
        warnings,
        migrationGuide,
        current: versionConfig.current
      });
      return NextResponse.json(successResponse);
    }

    // Get all version information
    const changelog = ApiVersioning.getVersionChangelog();
    const supportedVersions = versionConfig.supported.map(version => ({
      ...version,
      warnings: ApiVersioning.generateVersionWarnings(version),
      isCurrent: version.version === versionConfig.current
    }));

    const successResponse = createSuccessResponse({
      current: versionConfig.current,
      default: versionConfig.defaultVersion,
      supported: supportedVersions,
      changelog,
      deprecationPolicy: {
        warningDays: versionConfig.deprecationWarningDays,
        sunsetWarningDays: versionConfig.sunsetWarningDays
      },
      endpoints: {
        versionInfo: '/api/v1/version',
        apiDocs: '/docs/api',
        migrationGuide: '/docs/migration'
      }
    });
    return NextResponse.json(successResponse);

  } catch (error) {
    console.error('Version API error:', error);
    const errorResponse = createErrorResponse('Internal server error', 'INTERNAL_ERROR');
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

/**
 * Migration Guide Endpoint
 * POST /api/v1/version/migration
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fromVersion, toVersion } = body;

    if (!fromVersion || !toVersion) {
      const errorResponse = createErrorResponse('Both fromVersion and toVersion are required', 'MISSING_PARAMETERS');
      return NextResponse.json(errorResponse, { status: 400 });
    }

    const migrationGuide = ApiVersioning.getMigrationGuide(fromVersion, toVersion);

    if (!migrationGuide) {
      const errorResponse = createErrorResponse('Invalid version combination', 'INVALID_VERSION_COMBINATION');
      return NextResponse.json(errorResponse, { status: 400 });
    }

    const successResponse = createSuccessResponse({
      migrationGuide,
      documentation: `/docs/migration/${fromVersion}-to-${toVersion}`,
      support: {
        breaking: migrationGuide.breaking,
        automatedMigration: !migrationGuide.breaking,
        estimatedEffort: migrationGuide.breaking ? 'High' : 'Low',
        supportContact: 'api-support@chatbot.com'
      }
    });
    return NextResponse.json(successResponse);

  } catch (error) {
    console.error('Migration guide API error:', error);
    const errorResponse = createErrorResponse('Internal server error', 'INTERNAL_ERROR');
    return NextResponse.json(errorResponse, { status: 500 });
  }
}