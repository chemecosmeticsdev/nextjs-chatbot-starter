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
        return createErrorResponse(validation.error!, 400, {
          code: 'INVALID_VERSION'
        });
      }

      const warnings = ApiVersioning.generateVersionWarnings(validation.versionInfo!);
      const migrationGuide = validation.versionInfo!.version !== versionConfig.current
        ? ApiVersioning.getMigrationGuide(validation.versionInfo!.version, versionConfig.current)
        : null;

      return createSuccessResponse({
        version: validation.versionInfo!,
        warnings,
        migrationGuide,
        current: versionConfig.current
      });
    }

    // Get all version information
    const changelog = ApiVersioning.getVersionChangelog();
    const supportedVersions = versionConfig.supported.map(version => ({
      ...version,
      warnings: ApiVersioning.generateVersionWarnings(version),
      isCurrent: version.version === versionConfig.current
    }));

    return createSuccessResponse({
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

  } catch (error) {
    console.error('Version API error:', error);
    return createErrorResponse('Internal server error', 500, {
      code: 'INTERNAL_ERROR'
    });
  }
}

/**
 * Migration Guide Endpoint
 * GET /api/v1/version/migration
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fromVersion, toVersion } = body;

    if (!fromVersion || !toVersion) {
      return createErrorResponse('Both fromVersion and toVersion are required', 400, {
        code: 'MISSING_PARAMETERS'
      });
    }

    const migrationGuide = ApiVersioning.getMigrationGuide(fromVersion, toVersion);

    if (!migrationGuide) {
      return createErrorResponse('Invalid version combination', 400, {
        code: 'INVALID_VERSION_COMBINATION'
      });
    }

    return createSuccessResponse({
      migrationGuide,
      documentation: `/docs/migration/${fromVersion}-to-${toVersion}`,
      support: {
        breaking: migrationGuide.breaking,
        automatedMigration: !migrationGuide.breaking,
        estimatedEffort: migrationGuide.breaking ? 'High' : 'Low',
        supportContact: 'api-support@chatbot.com'
      }
    });

  } catch (error) {
    console.error('Migration guide API error:', error);
    return createErrorResponse('Internal server error', 500, {
      code: 'INTERNAL_ERROR'
    });
  }
}