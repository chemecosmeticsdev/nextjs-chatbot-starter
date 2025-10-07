import { NextRequest, NextResponse } from 'next/server';
import { ContentModerationService } from '@/lib/services/content-moderation';
import { AuditLogger, SecurityEventType } from '@/lib/security/audit-logger';
import { db } from '@/lib/db';
import { contentModerationRules } from '@/lib/db/schema';
import type { NewContentModerationRule } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export interface CreateRuleRequest {
  name: string;
  ruleType: 'profanity' | 'spam' | 'toxicity' | 'custom_pattern' | 'ai_detection';
  configuration: Record<string, any>;
  severityLevel: 'low' | 'medium' | 'high' | 'critical';
  autoAction: string;
  description?: string;
  adminId: string;
}

export interface UpdateRuleRequest {
  ruleId: string;
  name?: string;
  configuration?: Record<string, any>;
  severityLevel?: 'low' | 'medium' | 'high' | 'critical';
  autoAction?: string;
  isActive?: boolean;
  description?: string;
  adminId: string;
}

/**
 * Admin moderation rules management
 * GET /api/v1/admin/moderation/rules - List rules
 * POST /api/v1/admin/moderation/rules - Create or update rule
 * DELETE /api/v1/admin/moderation/rules - Delete rule
 */

/**
 * Get moderation rules
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const ruleType = searchParams.get('ruleType');
    const isActive = searchParams.get('isActive');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Validate admin authentication
    const adminId = await validateAdminAuth(request);
    if (!adminId) {
      return NextResponse.json(
        {
          error: 'Unauthorized: Admin access required',
          code: 'UNAUTHORIZED'
        },
        { status: 401 }
      );
    }

    // Build query
    let query = db.select().from(contentModerationRules);

    // Apply filters
    const conditions = [];
    if (ruleType) {
      conditions.push(eq(contentModerationRules.ruleType, ruleType as any));
    }
    if (isActive !== null) {
      conditions.push(eq(contentModerationRules.isActive, isActive === 'true'));
    }

    if (conditions.length > 0) {
      query = query.where(conditions.length === 1 ? conditions[0] : conditions.reduce((a, b) => ({ sql: `${a.sql} AND ${b.sql}`, params: [...a.params, ...b.params] })));
    }

    const rules = await query
      .orderBy(desc(contentModerationRules.createdAt))
      .limit(limit)
      .offset(offset);

    // Log the access
    await AuditLogger.logSecurityEvent({
      userId: adminId,
      eventType: SecurityEventType.DATA_ACCESS,
      severity: 'info',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      endpoint: '/api/v1/admin/moderation/rules',
      method: 'GET',
      details: {
        action: 'admin_rules_accessed',
        ruleType,
        isActive,
        limit,
        offset,
        ruleCount: rules.length
      }
    });

    return NextResponse.json({
      rules,
      total: rules.length, // Would implement proper count in production
      limit,
      offset,
      hasMore: rules.length === limit
    });

  } catch (error) {
    console.error('Get moderation rules error:', error);

    return NextResponse.json(
      {
        error: 'Failed to retrieve moderation rules',
        code: 'SERVICE_ERROR'
      },
      { status: 500 }
    );
  }
}

/**
 * Create or update moderation rule
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: CreateRuleRequest | UpdateRuleRequest = await request.json();

    // Validate admin authentication
    const adminId = await validateAdminAuth(request);
    if (!adminId) {
      return NextResponse.json(
        {
          error: 'Unauthorized: Admin access required',
          code: 'UNAUTHORIZED'
        },
        { status: 401 }
      );
    }

    // Handle update if ruleId is provided
    if ('ruleId' in body) {
      return await updateRule(body, request, adminId);
    }

    // Handle create
    return await createRule(body as CreateRuleRequest, request, adminId);

  } catch (error) {
    console.error('Moderation rule operation error:', error);

    return NextResponse.json(
      {
        error: 'Failed to process rule operation',
        code: 'SERVICE_ERROR'
      },
      { status: 500 }
    );
  }
}

/**
 * Delete moderation rule
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const ruleId = searchParams.get('ruleId');
    const adminId = searchParams.get('adminId');

    // Validate admin authentication
    const validatedAdminId = await validateAdminAuth(request);
    if (!validatedAdminId) {
      return NextResponse.json(
        {
          error: 'Unauthorized: Admin access required',
          code: 'UNAUTHORIZED'
        },
        { status: 401 }
      );
    }

    if (!ruleId || !adminId) {
      return NextResponse.json(
        {
          error: 'Missing required parameters: ruleId and adminId are required',
          code: 'INVALID_INPUT'
        },
        { status: 400 }
      );
    }

    // Soft delete by setting isActive to false
    const result = await db
      .update(contentModerationRules)
      .set({
        isActive: false,
        updatedAt: new Date()
      })
      .where(eq(contentModerationRules.id, ruleId))
      .returning();

    if (result.length === 0) {
      return NextResponse.json(
        {
          error: 'Rule not found',
          code: 'NOT_FOUND'
        },
        { status: 404 }
      );
    }

    // Log the deletion
    await AuditLogger.logSecurityEvent({
      userId: validatedAdminId,
      eventType: SecurityEventType.ADMIN_ACTION,
      severity: 'info',
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      endpoint: '/api/v1/admin/moderation/rules',
      method: 'DELETE',
      details: {
        action: 'rule_deleted',
        ruleId,
        adminId,
        ruleName: result[0].name,
        ruleType: result[0].ruleType
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Rule deleted successfully',
      ruleId
    });

  } catch (error) {
    console.error('Delete moderation rule error:', error);

    return NextResponse.json(
      {
        error: 'Failed to delete rule',
        code: 'SERVICE_ERROR'
      },
      { status: 500 }
    );
  }
}

/**
 * Create a new moderation rule
 */
async function createRule(
  body: CreateRuleRequest,
  request: NextRequest,
  adminId: string
): Promise<NextResponse> {
  // Validate required fields
  if (!body.name || !body.ruleType || !body.configuration || !body.severityLevel || !body.adminId) {
    return NextResponse.json(
      {
        error: 'Missing required fields: name, ruleType, configuration, severityLevel, and adminId are required',
        code: 'INVALID_INPUT'
      },
      { status: 400 }
    );
  }

  // Validate rule type
  const validRuleTypes = ['profanity', 'spam', 'toxicity', 'custom_pattern', 'ai_detection'];
  if (!validRuleTypes.includes(body.ruleType)) {
    return NextResponse.json(
      {
        error: 'Invalid rule type',
        code: 'INVALID_INPUT',
        validRuleTypes
      },
      { status: 400 }
    );
  }

  // Validate severity level
  const validSeverityLevels = ['low', 'medium', 'high', 'critical'];
  if (!validSeverityLevels.includes(body.severityLevel)) {
    return NextResponse.json(
      {
        error: 'Invalid severity level',
        code: 'INVALID_INPUT',
        validSeverityLevels
      },
      { status: 400 }
    );
  }

  // Create the rule
  const newRule: NewContentModerationRule = {
    name: body.name,
    ruleType: body.ruleType,
    configuration: body.configuration,
    severityLevel: body.severityLevel,
    autoAction: body.autoAction || 'flag',
    description: body.description || null,
    createdBy: body.adminId,
    isActive: true
  };

  const [createdRule] = await db
    .insert(contentModerationRules)
    .values(newRule)
    .returning();

  // Log the creation
  await AuditLogger.logSecurityEvent({
    userId: adminId,
    eventType: SecurityEventType.ADMIN_ACTION,
    severity: 'info',
    ipAddress: request.headers.get('x-forwarded-for') || undefined,
    userAgent: request.headers.get('user-agent') || undefined,
    endpoint: '/api/v1/admin/moderation/rules',
    method: 'POST',
    details: {
      action: 'rule_created',
      ruleId: createdRule.id,
      ruleName: body.name,
      ruleType: body.ruleType,
      severityLevel: body.severityLevel,
      adminId: body.adminId
    }
  });

  return NextResponse.json({
    success: true,
    message: 'Rule created successfully',
    rule: createdRule
  });
}

/**
 * Update an existing moderation rule
 */
async function updateRule(
  body: UpdateRuleRequest,
  request: NextRequest,
  adminId: string
): Promise<NextResponse> {
  // Validate required fields
  if (!body.ruleId || !body.adminId) {
    return NextResponse.json(
      {
        error: 'Missing required fields: ruleId and adminId are required',
        code: 'INVALID_INPUT'
      },
      { status: 400 }
    );
  }

  // Build update object
  const updateData: Partial<NewContentModerationRule> = {
    updatedAt: new Date()
  };

  if (body.name) updateData.name = body.name;
  if (body.configuration) updateData.configuration = body.configuration;
  if (body.severityLevel) updateData.severityLevel = body.severityLevel;
  if (body.autoAction) updateData.autoAction = body.autoAction;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;
  if (body.description !== undefined) updateData.description = body.description;

  // Update the rule
  const result = await db
    .update(contentModerationRules)
    .set(updateData)
    .where(eq(contentModerationRules.id, body.ruleId))
    .returning();

  if (result.length === 0) {
    return NextResponse.json(
      {
        error: 'Rule not found',
        code: 'NOT_FOUND'
      },
      { status: 404 }
    );
  }

  // Log the update
  await AuditLogger.logSecurityEvent({
    userId: adminId,
    eventType: SecurityEventType.ADMIN_ACTION,
    severity: 'info',
    ipAddress: request.headers.get('x-forwarded-for') || undefined,
    userAgent: request.headers.get('user-agent') || undefined,
    endpoint: '/api/v1/admin/moderation/rules',
    method: 'POST',
    details: {
      action: 'rule_updated',
      ruleId: body.ruleId,
      adminId: body.adminId,
      updatedFields: Object.keys(updateData)
    }
  });

  return NextResponse.json({
    success: true,
    message: 'Rule updated successfully',
    rule: result[0]
  });
}

/**
 * Validate admin authentication
 * In production, this would check JWT token or session for admin role
 */
async function validateAdminAuth(request: NextRequest): Promise<string | null> {
  // Check for admin API key in headers
  const apiKey = request.headers.get('x-admin-api-key');
  if (apiKey === 'admin-dev-key') {
    return 'admin-user-id'; // Development only
  }

  // Check Authorization header for JWT
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // In production, verify JWT and check for admin role
    // For now, accept any Bearer token as admin
    return 'admin-from-jwt';
  }

  return null;
}