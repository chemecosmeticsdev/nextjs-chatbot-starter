import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService } from '@/lib/auth';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-utils';
import { KnowledgeBaseService } from '@/lib/services/knowledge-base';
import { z } from 'zod';
import { formatValidationErrors } from '@/lib/validation/common';

/**
 * POST /api/v1/knowledge-base/repair
 *
 * Repair missing embeddings for document chunks
 * Admin-only endpoint for fixing data integrity issues
 */

const repairRequestSchema = z.object({
  action: z.enum(['identify', 'repair', 'validate'], {
    required_error: 'Action is required',
    invalid_type_error: 'Invalid action type'
  }),
  chunkIds: z.array(z.string().uuid('Invalid chunk ID format')).optional(),
  dryRun: z.boolean().optional().default(false)
}).strict();

export async function POST(request: NextRequest) {
  try {
    // Authenticate user and check admin permissions
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        createErrorResponse('Authentication required', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    // Check if user has admin role
    if (user.role !== 'admin') {
      return NextResponse.json(
        createErrorResponse('Admin access required', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    // Parse and validate request body
    let requestData;
    try {
      const rawBody = await request.json();
      requestData = repairRequestSchema.parse(rawBody);
    } catch (error) {
      return NextResponse.json(
        createErrorResponse(
          'Validation failed',
          'VALIDATION_ERROR',
          formatValidationErrors(error)
        ),
        { status: 400 }
      );
    }

    const { action, chunkIds, dryRun } = requestData;

    // Log admin action for audit
    console.log(
      `Admin embedding repair action - User: ${user.id}, Action: ${action}, ` +
      `ChunkIds: ${chunkIds?.length || 'all'}, DryRun: ${dryRun}`
    );

    switch (action) {
      case 'identify': {
        // Identify missing embeddings
        const missingInfo = await KnowledgeBaseService.identifyMissingEmbeddings();

        return NextResponse.json(
          createSuccessResponse({
            action: 'identify',
            ...missingInfo,
            summary: `Found ${missingInfo.missingCount} missing embeddings out of ${missingInfo.totalChunks} total chunks (${((1 - missingInfo.missingCount / missingInfo.totalChunks) * 100).toFixed(1)}% coverage)`
          }),
          { status: 200 }
        );
      }

      case 'validate': {
        // Validate embedding integrity
        const validationResult = await KnowledgeBaseService.validateEmbeddingIntegrity();

        return NextResponse.json(
          createSuccessResponse({
            action: 'validate',
            ...validationResult,
            summary: `${validationResult.embeddingCoverage}% embedding coverage - ${validationResult.isValid ? 'VALID' : 'ISSUES FOUND'}`
          }),
          { status: 200 }
        );
      }

      case 'repair': {
        if (dryRun) {
          // Dry run - just identify what would be repaired
          const missingInfo = await KnowledgeBaseService.identifyMissingEmbeddings();
          const chunksToRepair = chunkIds
            ? missingInfo.missingChunks.filter(chunk => chunkIds.includes(chunk.chunkId))
            : missingInfo.missingChunks;

          return NextResponse.json(
            createSuccessResponse({
              action: 'repair_dry_run',
              chunksToRepair: chunksToRepair.length,
              chunks: chunksToRepair,
              summary: `Dry run: Would repair ${chunksToRepair.length} missing embeddings`
            }),
            { status: 200 }
          );
        } else {
          // Actually repair the missing embeddings
          const repairResult = await KnowledgeBaseService.repairMissingEmbeddings(chunkIds);

          // Get updated validation after repair
          const postRepairValidation = await KnowledgeBaseService.validateEmbeddingIntegrity();

          return NextResponse.json(
            createSuccessResponse({
              action: 'repair',
              ...repairResult,
              postRepairStatus: {
                totalChunks: postRepairValidation.totalChunks,
                embeddingCoverage: postRepairValidation.embeddingCoverage,
                isValid: postRepairValidation.isValid,
                remainingIssues: postRepairValidation.issues.length
              },
              summary: `Repaired ${repairResult.successCount}/${repairResult.totalRepaired} chunks. ` +
                      `New coverage: ${postRepairValidation.embeddingCoverage}%`
            }),
            { status: 200 }
          );
        }
      }

      default:
        return NextResponse.json(
          createErrorResponse('Invalid action', 'VALIDATION_ERROR'),
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Error in knowledge base repair:', error);
    return NextResponse.json(
      createErrorResponse(
        error.message || 'Internal server error',
        'INTERNAL_ERROR'
      ),
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/knowledge-base/repair
 *
 * Get current embedding integrity status
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        createErrorResponse('Authentication required', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    // Check if user has admin role
    if (user.role !== 'admin') {
      return NextResponse.json(
        createErrorResponse('Admin access required', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    // Get current integrity status
    const integrityStatus = await KnowledgeBaseService.validateEmbeddingIntegrity();
    const missingInfo = await KnowledgeBaseService.identifyMissingEmbeddings();

    return NextResponse.json(
      createSuccessResponse({
        integrity: integrityStatus,
        missing: {
          count: missingInfo.missingCount,
          chunks: missingInfo.missingChunks
        },
        summary: {
          status: integrityStatus.isValid ? 'HEALTHY' : 'NEEDS_ATTENTION',
          coverage: `${integrityStatus.embeddingCoverage}%`,
          totalIssues: integrityStatus.issues.length,
          criticalIssues: integrityStatus.missingEmbeddings,
          recommendation: integrityStatus.missingEmbeddings > 0
            ? 'Run repair action to fix missing embeddings'
            : 'All embeddings are present and valid'
        }
      }),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error getting repair status:', error);
    return NextResponse.json(
      createErrorResponse('Internal server error', 'INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * Handle unsupported HTTP methods
 */
export async function PUT() {
  return NextResponse.json(
    createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'),
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'),
    { status: 405 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'),
    { status: 405 }
  );
}