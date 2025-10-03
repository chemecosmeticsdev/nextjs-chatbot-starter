import { NextRequest, NextResponse } from 'next/server';

/**
 * API Versioning System
 * Handles version detection, validation, and routing
 */

export interface ApiVersion {
  version: string;
  status: 'stable' | 'beta' | 'deprecated' | 'sunset';
  releaseDate: string;
  deprecationDate?: string;
  sunsetDate?: string;
  changelog: string[];
  breaking: boolean;
}

export interface VersionConfig {
  current: string;
  supported: ApiVersion[];
  defaultVersion: string;
  deprecationWarningDays: number;
  sunsetWarningDays: number;
}

// API Version Configuration
export const versionConfig: VersionConfig = {
  current: '1.0',
  defaultVersion: '1.0',
  deprecationWarningDays: 90,
  sunsetWarningDays: 30,
  supported: [
    {
      version: '1.0',
      status: 'stable',
      releaseDate: '2024-01-15',
      changelog: [
        'Initial stable release',
        'Chat messaging endpoints',
        'Configuration retrieval',
        'Conversation history',
        'Rate limiting and authentication'
      ],
      breaking: false
    },
    {
      version: '1.1',
      status: 'beta',
      releaseDate: '2024-02-01',
      changelog: [
        'Webhook support',
        'Bulk operations',
        'Advanced analytics',
        'File upload support',
        'Enhanced error responses'
      ],
      breaking: false
    },
    {
      version: '2.0',
      status: 'beta',
      releaseDate: '2024-03-01',
      changelog: [
        'GraphQL API support',
        'Real-time subscriptions',
        'Multi-model support',
        'Advanced context management',
        'Breaking: New authentication flow'
      ],
      breaking: true
    }
  ]
};

export class ApiVersioning {
  /**
   * Extract API version from request
   */
  static extractVersion(request: NextRequest): {
    version: string;
    source: 'header' | 'query' | 'path' | 'default';
  } {
    // 1. Check Accept header (preferred)
    const acceptHeader = request.headers.get('accept');
    if (acceptHeader?.includes('application/vnd.chatbot.v')) {
      const match = acceptHeader.match(/application\/vnd\.chatbot\.v(\d+(?:\.\d+)?)/);
      if (match) {
        return { version: match[1], source: 'header' };
      }
    }

    // 2. Check custom API-Version header
    const versionHeader = request.headers.get('api-version');
    if (versionHeader) {
      return { version: versionHeader, source: 'header' };
    }

    // 3. Check query parameter
    const { searchParams } = new URL(request.url);
    const versionQuery = searchParams.get('version') || searchParams.get('v');
    if (versionQuery) {
      return { version: versionQuery, source: 'query' };
    }

    // 4. Check URL path (/v1/, /v2/, etc.)
    const pathMatch = request.nextUrl.pathname.match(/\/v(\d+(?:\.\d+)?)\//);
    if (pathMatch) {
      return { version: pathMatch[1], source: 'path' };
    }

    // 5. Default version
    return { version: versionConfig.defaultVersion, source: 'default' };
  }

  /**
   * Validate if version is supported
   */
  static validateVersion(version: string): {
    valid: boolean;
    versionInfo?: ApiVersion;
    error?: string;
  } {
    const versionInfo = versionConfig.supported.find(v => v.version === version);

    if (!versionInfo) {
      return {
        valid: false,
        error: `Unsupported API version: ${version}. Supported versions: ${versionConfig.supported.map(v => v.version).join(', ')}`
      };
    }

    // Check if version is sunset
    if (versionInfo.status === 'sunset') {
      return {
        valid: false,
        versionInfo,
        error: `API version ${version} has been sunset and is no longer available`
      };
    }

    return { valid: true, versionInfo };
  }

  /**
   * Generate version warnings for deprecated versions
   */
  static generateVersionWarnings(versionInfo: ApiVersion): string[] {
    const warnings: string[] = [];
    const now = new Date();

    if (versionInfo.status === 'deprecated' && versionInfo.deprecationDate) {
      const deprecationDate = new Date(versionInfo.deprecationDate);
      const daysSinceDeprecation = Math.floor((now.getTime() - deprecationDate.getTime()) / (1000 * 60 * 60 * 24));

      warnings.push(
        `API version ${versionInfo.version} is deprecated since ${versionInfo.deprecationDate}. ` +
        `Please migrate to version ${versionConfig.current}.`
      );

      if (versionInfo.sunsetDate) {
        const sunsetDate = new Date(versionInfo.sunsetDate);
        const daysUntilSunset = Math.floor((sunsetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilSunset <= versionConfig.sunsetWarningDays) {
          warnings.push(
            `API version ${versionInfo.version} will be sunset on ${versionInfo.sunsetDate} ` +
            `(${daysUntilSunset} days remaining).`
          );
        }
      }
    }

    return warnings;
  }

  /**
   * Create version-aware response headers
   */
  static createVersionHeaders(
    versionInfo: ApiVersion,
    requestVersion: { version: string; source: string }
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'API-Version': versionInfo.version,
      'API-Version-Status': versionInfo.status,
      'API-Version-Source': requestVersion.source,
      'API-Supported-Versions': versionConfig.supported.map(v => v.version).join(', '),
      'API-Current-Version': versionConfig.current
    };

    // Add deprecation warnings
    const warnings = this.generateVersionWarnings(versionInfo);
    if (warnings.length > 0) {
      headers['API-Deprecation-Warning'] = warnings.join(' ');
    }

    // Add sunset date if applicable
    if (versionInfo.sunsetDate) {
      headers['API-Sunset-Date'] = versionInfo.sunsetDate;
    }

    return headers;
  }

  /**
   * Middleware to handle API versioning
   */
  static middleware(request: NextRequest): NextResponse | null {
    // Skip versioning for non-API routes
    if (!request.nextUrl.pathname.startsWith('/api/')) {
      return null;
    }

    const requestVersion = this.extractVersion(request);
    const validation = this.validateVersion(requestVersion.version);

    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNSUPPORTED_API_VERSION',
            message: validation.error,
            supportedVersions: versionConfig.supported.map(v => ({
              version: v.version,
              status: v.status,
              releaseDate: v.releaseDate
            }))
          }
        },
        { status: 400 }
      );
    }

    // Create response with version headers
    const response = NextResponse.next();
    const versionHeaders = this.createVersionHeaders(validation.versionInfo!, requestVersion);

    Object.entries(versionHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // Add version info to request for use in handlers
    request.headers.set('x-api-version-info', JSON.stringify({
      version: validation.versionInfo!.version,
      status: validation.versionInfo!.status,
      source: requestVersion.source
    }));

    return response;
  }

  /**
   * Get version-specific endpoint mapping
   */
  static getEndpointForVersion(
    baseEndpoint: string,
    version: string
  ): string {
    // Handle version-specific endpoint routing
    const versionInfo = versionConfig.supported.find(v => v.version === version);

    if (!versionInfo) {
      return baseEndpoint;
    }

    // Map endpoints based on version
    switch (version) {
      case '1.0':
        return baseEndpoint;

      case '1.1':
        // Add beta endpoints
        if (baseEndpoint.includes('/webhooks')) {
          return baseEndpoint.replace('/webhooks', '/v1.1/webhooks');
        }
        return baseEndpoint;

      case '2.0':
        // GraphQL endpoint for v2.0
        if (baseEndpoint.includes('/chat/')) {
          return baseEndpoint.replace('/chat/', '/graphql/');
        }
        return baseEndpoint;

      default:
        return baseEndpoint;
    }
  }

  /**
   * Transform response based on version
   */
  static transformResponse(
    data: any,
    version: string
  ): any {
    const versionInfo = versionConfig.supported.find(v => v.version === version);

    if (!versionInfo) {
      return data;
    }

    // Apply version-specific transformations
    switch (version) {
      case '1.0':
        // Legacy format - remove new fields
        if (data.data?.usage) {
          delete data.data.usage.vectorSearchResults;
        }
        return data;

      case '1.1':
        // Enhanced format with additional metadata
        if (data.data?.usage) {
          data.data.usage.apiVersion = version;
          data.data.usage.enhanced = true;
        }
        return data;

      case '2.0':
        // GraphQL-style response structure
        return {
          data: data.data,
          extensions: {
            version: version,
            deprecationWarnings: this.generateVersionWarnings(versionInfo),
            tracing: {
              version: 1,
              startTime: new Date().toISOString()
            }
          }
        };

      default:
        return data;
    }
  }

  /**
   * Get version changelog
   */
  static getVersionChangelog(version?: string): ApiVersion[] {
    if (version) {
      const versionInfo = versionConfig.supported.find(v => v.version === version);
      return versionInfo ? [versionInfo] : [];
    }

    return versionConfig.supported.sort((a, b) =>
      new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime()
    );
  }

  /**
   * Get migration guide for version upgrade
   */
  static getMigrationGuide(fromVersion: string, toVersion: string): {
    fromVersion: string;
    toVersion: string;
    breaking: boolean;
    changes: string[];
    migrationSteps: string[];
  } | null {
    const from = versionConfig.supported.find(v => v.version === fromVersion);
    const to = versionConfig.supported.find(v => v.version === toVersion);

    if (!from || !to) {
      return null;
    }

    const breaking = to.breaking;
    const changes = to.changelog;

    const migrationSteps = [
      `Update your API version to ${toVersion}`,
      'Test all endpoints with the new version',
      'Update your error handling for new response formats',
      'Review breaking changes in the changelog'
    ];

    if (breaking) {
      migrationSteps.unshift('⚠️ BREAKING CHANGES - Please review carefully before upgrading');
    }

    return {
      fromVersion,
      toVersion,
      breaking,
      changes,
      migrationSteps
    };
  }
}

/**
 * Helper function to get version info from request headers
 */
export function getVersionFromRequest(request: NextRequest): ApiVersion | null {
  const versionInfoHeader = request.headers.get('x-api-version-info');
  if (!versionInfoHeader) {
    return null;
  }

  try {
    const versionInfo = JSON.parse(versionInfoHeader);
    return versionConfig.supported.find(v => v.version === versionInfo.version) || null;
  } catch {
    return null;
  }
}

/**
 * Type guard for checking if version supports feature
 */
export function versionSupports(version: string, feature: string): boolean {
  const featureMatrix: Record<string, string[]> = {
    'webhooks': ['1.1', '2.0'],
    'bulk_operations': ['1.1', '2.0'],
    'graphql': ['2.0'],
    'real_time': ['2.0'],
    'file_upload': ['1.1', '2.0'],
    'advanced_analytics': ['1.1', '2.0']
  };

  return featureMatrix[feature]?.includes(version) || false;
}