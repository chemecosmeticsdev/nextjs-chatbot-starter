/**
 * API endpoints for quality assurance validation
 * POST /api/v1/quality/validate - Validate document processing results
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Dynamically import services to avoid build-time initialization issues
const getServices = async () => {
  try {
    const { qualityAssurance } = await import('@/lib/services/quality-assurance');
    const { analyticsService } = await import('@/lib/services/analytics');
    return { qualityAssurance, analyticsService };
  } catch (error) {
    console.error('Services unavailable during build:', error);
    return null;
  }
};

// Request schemas
const validateDocumentSchema = z.object({
  documentId: z.string().min(1, 'Document ID is required'),
  includeRecommendations: z.boolean().optional().default(true)
});

const validateBatchSchema = z.object({
  documentIds: z.array(z.string()).min(1, 'At least one document ID is required').max(50, 'Maximum 50 documents per batch'),
  includeRecommendations: z.boolean().optional().default(true),
  failFast: z.boolean().optional().default(false)
});

/**
 * POST /api/v1/quality/validate
 * Validate single document or batch of documents
 */
export async function POST(request: NextRequest) {
  try {
    const services = await getServices();

    if (!services) {
      return NextResponse.json({
        success: false,
        error: 'Quality validation services unavailable',
        details: 'Services could not be loaded'
      }, { status: 503 });
    }

    const body = await request.json();

    // Determine if this is a single document or batch validation
    const isBatch = Array.isArray(body.documentIds);

    if (isBatch) {
      return await handleBatchValidation(body, services);
    } else {
      return await handleSingleValidation(body, services);
    }
  } catch (error) {
    console.error('Quality validation API error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Validation failed',
        details: error.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      success: false,
      error: 'Internal server error during quality validation'
    }, { status: 500 });
  }
}

async function handleSingleValidation(body: any, services: any) {
  // Validate request body
  const validatedData = validateDocumentSchema.parse(body);
  const { documentId, includeRecommendations } = validatedData;

  const { qualityAssurance, analyticsService } = services;
  const startTime = Date.now();

  try {
    // Perform quality validation
    const validationResult = await qualityAssurance.validateDocument(documentId);

    // Track validation event
    await analyticsService.trackEvent('quality_validation_single', {
      documentId,
      passed: validationResult.passed,
      score: validationResult.overallScore,
      criticalIssues: validationResult.summary.critical,
      processingTime: Date.now() - startTime
    });

    // Prepare response
    const response = {
      success: true,
      data: {
        documentId: validationResult.documentId,
        validation: {
          passed: validationResult.passed,
          score: validationResult.overallScore,
          summary: validationResult.summary,
          timestamp: validationResult.metadata.validatedAt
        },
        checks: includeRecommendations
          ? validationResult.checks
          : validationResult.checks.map(check => ({
              name: check.name,
              description: check.description,
              severity: check.severity,
              category: check.category,
              passed: check.passed
            })),
        metadata: {
          validationVersion: validationResult.metadata.validationVersion,
          processingTime: validationResult.metadata.processingTime
        }
      }
    };

    // Return different status codes based on validation result
    if (validationResult.summary.critical > 0) {
      return NextResponse.json(response, { status: 422 }); // Unprocessable Entity
    } else if (validationResult.summary.warnings > 3) {
      return NextResponse.json(response, { status: 206 }); // Partial Content
    } else {
      return NextResponse.json(response, { status: 200 }); // OK
    }

  } catch (error) {
    console.error('Single validation error:', error);

    // Track validation failure
    await analyticsService.trackEvent('quality_validation_error', {
      documentId,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime: Date.now() - startTime
    });

    return NextResponse.json({
      success: false,
      error: 'Quality validation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function handleBatchValidation(body: any, services: any) {
  // Validate request body
  const validatedData = validateBatchSchema.parse(body);
  const { documentIds, includeRecommendations, failFast } = validatedData;

  const { qualityAssurance, analyticsService } = services;
  const startTime = Date.now();

  try {
    // Perform batch validation
    const validationResults = await qualityAssurance.validateDocumentsBatch(documentIds);

    // Calculate batch statistics
    const batchStats = {
      total: validationResults.length,
      passed: validationResults.filter(r => r.passed).length,
      failed: validationResults.filter(r => !r.passed).length,
      averageScore: validationResults.reduce((sum, r) => sum + r.overallScore, 0) / validationResults.length,
      criticalIssues: validationResults.reduce((sum, r) => sum + r.summary.critical, 0),
      warnings: validationResults.reduce((sum, r) => sum + r.summary.warnings, 0)
    };

    // Track batch validation event
    await analyticsService.trackEvent('quality_validation_batch', {
      batchSize: documentIds.length,
      ...batchStats,
      processingTime: Date.now() - startTime
    });

    // Prepare response
    const response = {
      success: batchStats.failed === 0 || !failFast,
      data: {
        batch: {
          statistics: batchStats,
          timestamp: new Date().toISOString()
        },
        validations: validationResults.map(result => ({
          documentId: result.documentId,
          validation: {
            passed: result.passed,
            score: result.overallScore,
            summary: result.summary
          },
          checks: includeRecommendations
            ? result.checks
            : result.checks.map(check => ({
                name: check.name,
                description: check.description,
                severity: check.severity,
                category: check.category,
                passed: check.passed
              }))
        })),
        metadata: {
          batchProcessingTime: Date.now() - startTime,
          validationVersion: validationResults[0]?.metadata.validationVersion || '1.0.0'
        }
      }
    };

    // Return appropriate status code
    if (batchStats.criticalIssues > 0) {
      return NextResponse.json(response, { status: 422 }); // Unprocessable Entity
    } else if (batchStats.failed > 0) {
      return NextResponse.json(response, { status: 206 }); // Partial Content
    } else {
      return NextResponse.json(response, { status: 200 }); // OK
    }

  } catch (error) {
    console.error('Batch validation error:', error);

    // Track batch validation failure
    await analyticsService.trackEvent('quality_validation_batch_error', {
      batchSize: documentIds.length,
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime: Date.now() - startTime
    });

    return NextResponse.json({
      success: false,
      error: 'Batch quality validation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * GET /api/v1/quality/validate
 * Get validation status for a specific document
 */
export async function GET(request: NextRequest) {
  try {
    const services = await getServices();

    if (!services) {
      return NextResponse.json({
        success: false,
        error: 'Quality validation services unavailable',
        details: 'Services could not be loaded'
      }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');

    if (!documentId) {
      return NextResponse.json({
        success: false,
        error: 'Document ID is required'
      }, { status: 400 });
    }

    const { qualityAssurance } = services;

    // Get cached validation result if available
    const validationResult = await qualityAssurance.validateDocument(documentId);

    return NextResponse.json({
      success: true,
      data: {
        documentId: validationResult.documentId,
        validation: {
          passed: validationResult.passed,
          score: validationResult.overallScore,
          summary: validationResult.summary,
          lastValidated: validationResult.metadata.validatedAt
        },
        quickChecks: validationResult.checks
          .filter(check => check.severity === 'critical')
          .map(check => ({
            name: check.name,
            passed: check.passed,
            severity: check.severity
          }))
      }
    });

  } catch (error) {
    console.error('Quality validation GET error:', error);

    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve validation status'
    }, { status: 500 });
  }
}