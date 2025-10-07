import { NextRequest, NextResponse } from 'next/server';
import { ApiKeyService, ApiKeyScope } from '@/lib/security/api-keys';
import { withRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { withApiAuth } from '@/lib/middleware/api-auth';
import { withSanitization } from '@/lib/middleware/sanitize';
import { withSecurityHeaders, adminSecurityHeaders } from '@/lib/middleware/security-headers';
import { apiKeyCreateSchema, paginationSchema } from '@/lib/security/validation';
import { AuditLogger, SecurityEventType } from '@/lib/security/audit-logger';

/**
 * GET /api/v1/admin/api-keys - List API keys for user
 */
export async function GET(request: NextRequest) {
  return withSecurityHeaders(adminSecurityHeaders())(
    request,
    () => withRateLimit(rateLimiters.api)(
      request,
      () => withApiAuth({ allowSessionAuth: true, requireApiKey: false })(
        request,
        async () => {
          try {
            const { searchParams } = new URL(request.url);
            const paginationData = {
              page: parseInt(searchParams.get('page') || '1'),
              limit: parseInt(searchParams.get('limit') || '20'),
            };

            // Validate pagination parameters
            const validation = paginationSchema.safeParse(paginationData);
            if (!validation.success) {
              return NextResponse.json(
                { error: 'Invalid pagination parameters', code: 'VALIDATION_ERROR' },
                { status: 400 }
              );
            }

            // Get user ID from session (admin endpoint requires session auth)
            const authHeader = request.headers.get('authorization');
            const sessionCookie = request.cookies.get('session');

            if (!sessionCookie?.value && !authHeader) {
              return NextResponse.json(
                { error: 'Authentication required', code: 'AUTHENTICATION_REQUIRED' },
                { status: 401 }
              );
            }

            // For this example, we'll assume user ID is extracted from session
            const userId = 'user-id-from-session'; // This would come from actual auth

            const apiKeys = await ApiKeyService.getUserApiKeys(userId);

            // Log admin action
            await AuditLogger.logAdminAction(
              userId,
              'list_api_keys',
              'api_keys',
              'all',
              request.headers.get('x-forwarded-for') || undefined,
              request.headers.get('user-agent') || undefined
            );

            return NextResponse.json({
              success: true,
              data: apiKeys,
              pagination: {
                page: validation.data.page,
                limit: validation.data.limit,
                total: apiKeys.length,
              },
            });

          } catch (error) {
            console.error('API keys list error:', error);
            return NextResponse.json(
              { error: 'Internal server error', code: 'INTERNAL_ERROR' },
              { status: 500 }
            );
          }
        }
      )
    )
  );
}

/**
 * POST /api/v1/admin/api-keys - Create new API key
 */
export async function POST(request: NextRequest) {
  return withSecurityHeaders(adminSecurityHeaders())(
    request,
    () => withRateLimit(rateLimiters.auth)(
      request,
      () => withSanitization({ validateSchema: apiKeyCreateSchema })(
        request,
        () => withApiAuth({ allowSessionAuth: true, requireApiKey: false })(
          request,
          async () => {
            try {
              const body = await request.json();

              // Additional validation for admin actions
              const userId = 'user-id-from-session'; // Extract from actual auth
              const userRole = 'admin'; // Extract from actual auth

              if (userRole !== 'admin' && userRole !== 'super_admin') {
                await AuditLogger.logSecurityEvent({
                  userId,
                  eventType: SecurityEventType.INSUFFICIENT_PERMISSIONS,
                  severity: 'warning',
                  ipAddress: request.headers.get('x-forwarded-for') || undefined,
                  endpoint: '/api/v1/admin/api-keys',
                  method: 'POST',
                  details: { attemptedAction: 'create_api_key' },
                });

                return NextResponse.json(
                  { error: 'Insufficient permissions', code: 'INSUFFICIENT_PERMISSIONS' },
                  { status: 403 }
                );
              }

              // Validate scopes
              const validScopes = Object.values(ApiKeyScope);
              const invalidScopes = body.scopes.filter((scope: string) => !validScopes.includes(scope as ApiKeyScope));

              if (invalidScopes.length > 0) {
                return NextResponse.json(
                  { error: `Invalid scopes: ${invalidScopes.join(', ')}`, code: 'INVALID_SCOPES' },
                  { status: 400 }
                );
              }

              // Create API key
              const result = await ApiKeyService.createApiKey({
                name: body.name,
                userId,
                scopes: body.scopes,
                expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
              });

              // Log API key creation
              await AuditLogger.logSecurityEvent({
                userId,
                eventType: SecurityEventType.API_KEY_CREATED,
                severity: 'info',
                ipAddress: request.headers.get('x-forwarded-for') || undefined,
                userAgent: request.headers.get('user-agent') || undefined,
                details: {
                  apiKeyId: result.apiKey.id,
                  name: result.apiKey.name,
                  scopes: result.apiKey.scopes,
                  expiresAt: result.apiKey.expiresAt,
                },
              });

              await AuditLogger.logAdminAction(
                userId,
                'create_api_key',
                'api_key',
                result.apiKey.id,
                request.headers.get('x-forwarded-for') || undefined,
                request.headers.get('user-agent') || undefined,
                {
                  name: result.apiKey.name,
                  scopes: result.apiKey.scopes,
                }
              );

              return NextResponse.json({
                success: true,
                data: {
                  id: result.apiKey.id,
                  name: result.apiKey.name,
                  key: result.key, // Only return the key once during creation
                  scopes: result.apiKey.scopes,
                  expiresAt: result.apiKey.expiresAt,
                  createdAt: result.apiKey.createdAt,
                },
              }, { status: 201 });

            } catch (error) {
              console.error('API key creation error:', error);
              return NextResponse.json(
                { error: 'Failed to create API key', code: 'CREATION_FAILED' },
                { status: 500 }
              );
            }
          }
        )
      )
    )
  );
}

/**
 * DELETE /api/v1/admin/api-keys/[id] - Revoke API key
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withSecurityHeaders(adminSecurityHeaders())(
    request,
    () => withRateLimit(rateLimiters.api)(
      request,
      () => withApiAuth({ allowSessionAuth: true, requireApiKey: false })(
        request,
        async () => {
          try {
            const keyId = params.id;
            const userId = 'user-id-from-session'; // Extract from actual auth
            const userRole = 'admin'; // Extract from actual auth

            if (userRole !== 'admin' && userRole !== 'super_admin') {
              await AuditLogger.logSecurityEvent({
                userId,
                eventType: SecurityEventType.INSUFFICIENT_PERMISSIONS,
                severity: 'warning',
                ipAddress: request.headers.get('x-forwarded-for') || undefined,
                endpoint: `/api/v1/admin/api-keys/${keyId}`,
                method: 'DELETE',
                details: { attemptedAction: 'revoke_api_key', keyId },
              });

              return NextResponse.json(
                { error: 'Insufficient permissions', code: 'INSUFFICIENT_PERMISSIONS' },
                { status: 403 }
              );
            }

            const success = await ApiKeyService.revokeApiKey(keyId, userId);

            if (!success) {
              return NextResponse.json(
                { error: 'API key not found or access denied', code: 'NOT_FOUND' },
                { status: 404 }
              );
            }

            // Log API key revocation
            await AuditLogger.logSecurityEvent({
              userId,
              eventType: SecurityEventType.API_KEY_REVOKED,
              severity: 'info',
              ipAddress: request.headers.get('x-forwarded-for') || undefined,
              userAgent: request.headers.get('user-agent') || undefined,
              details: { apiKeyId: keyId },
            });

            await AuditLogger.logAdminAction(
              userId,
              'revoke_api_key',
              'api_key',
              keyId,
              request.headers.get('x-forwarded-for') || undefined,
              request.headers.get('user-agent') || undefined
            );

            return NextResponse.json({
              success: true,
              message: 'API key revoked successfully',
            });

          } catch (error) {
            console.error('API key revocation error:', error);
            return NextResponse.json(
              { error: 'Failed to revoke API key', code: 'REVOCATION_FAILED' },
              { status: 500 }
            );
          }
        }
      )
    )
  );
}