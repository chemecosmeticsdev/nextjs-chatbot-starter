/**
 * API endpoints for system health monitoring and quality metrics
 * GET /api/v1/quality/health - Get comprehensive system health report
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/connection';
import { documents, documentChunks } from '@/lib/db/schema';
import { sql, count, avg, desc } from 'drizzle-orm';

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

// Query parameters schema
const healthQuerySchema = z.object({
  includeDetails: z.boolean().optional().default(false),
  includeRecommendations: z.boolean().optional().default(true),
  timeframe: z.enum(['1h', '24h', '7d', '30d']).optional().default('24h')
});

/**
 * GET /api/v1/quality/health
 * Get comprehensive system health report
 */
export async function GET(request: NextRequest) {
  try {
    const services = await getServices();

    if (!services) {
      return NextResponse.json({
        success: false,
        error: 'Quality services unavailable',
        details: 'Services could not be loaded'
      }, { status: 503 });
    }

    const { qualityAssurance, analyticsService } = services;

    const { searchParams } = new URL(request.url);
    const queryParams = {
      includeDetails: searchParams.get('includeDetails') === 'true',
      includeRecommendations: searchParams.get('includeRecommendations') !== 'false',
      timeframe: searchParams.get('timeframe') || '24h'
    };

    const validatedParams = healthQuerySchema.parse(queryParams);
    const startTime = Date.now();

    // Generate system health report
    const healthReport = await qualityAssurance.generateSystemHealthReport();

    // Get additional quality metrics
    const qualityMetrics = await getQualityMetrics(validatedParams.timeframe);

    // Get recent quality trends
    const qualityTrends = await getQualityTrends(validatedParams.timeframe);

    // Track health check event
    await analyticsService.trackEvent({
      eventType: 'system_health_check',
      entityType: 'system',
      metadata: {
        overall: healthReport.overall,
        score: healthReport.score,
        serviceStatus: healthReport.services,
        timeframe: validatedParams.timeframe,
        processingTime: Date.now() - startTime
      }
    });

    // Prepare response
    const response = {
      success: true,
      data: {
        health: {
          overall: healthReport.overall,
          score: healthReport.score,
          timestamp: healthReport.timestamp,
          timeframe: validatedParams.timeframe
        },
        services: healthReport.services,
        statistics: {
          ...healthReport.statistics,
          ...qualityMetrics
        },
        trends: qualityTrends,
        ...(validatedParams.includeDetails && {
          checks: healthReport.checks.map(check => ({
            name: check.name,
            description: check.description,
            severity: check.severity,
            category: check.category,
            passed: check.passed,
            ...(validatedParams.includeRecommendations && check.recommendation && {
              recommendation: check.recommendation
            })
          }))
        }),
        ...(validatedParams.includeRecommendations && {
          recommendations: healthReport.recommendations
        }),
        metadata: {
          reportGeneratedAt: healthReport.timestamp,
          reportVersion: '1.0.0',
          processingTime: Date.now() - startTime
        }
      }
    };

    // Return appropriate status based on health
    const statusCode = healthReport.overall === 'healthy' ? 200 :
                      healthReport.overall === 'degraded' ? 206 : 503;

    return NextResponse.json(response, { status: statusCode });

  } catch (error) {
    console.error('System health API error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid query parameters',
        details: error.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to generate system health report',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * POST /api/v1/quality/health
 * Run comprehensive system diagnostics
 */
export async function POST(request: NextRequest) {
  try {
    const services = await getServices();

    if (!services) {
      return NextResponse.json({
        success: false,
        error: 'Quality services unavailable',
        details: 'Services could not be loaded'
      }, { status: 503 });
    }

    const { qualityAssurance, analyticsService } = services;

    const body = await request.json();
    const { runDiagnostics = false, includePerformanceTests = false } = body;

    const startTime = Date.now();

    // Generate basic health report
    const healthReport = await qualityAssurance.generateSystemHealthReport();

    // Run additional diagnostics if requested
    let diagnostics = null;
    if (runDiagnostics) {
      diagnostics = await runSystemDiagnostics();
    }

    // Run performance tests if requested
    let performanceTests = null;
    if (includePerformanceTests) {
      performanceTests = await runPerformanceTests();
    }

    // Track diagnostic event
    await analyticsService.trackEvent({
      eventType: 'system_diagnostics',
      entityType: 'system',
      metadata: {
        overall: healthReport.overall,
        score: healthReport.score,
        ranDiagnostics: runDiagnostics,
        ranPerformanceTests: includePerformanceTests,
        processingTime: Date.now() - startTime
      }
    });

    const response = {
      success: true,
      data: {
        health: {
          overall: healthReport.overall,
          score: healthReport.score,
          timestamp: healthReport.timestamp
        },
        services: healthReport.services,
        statistics: healthReport.statistics,
        recommendations: healthReport.recommendations,
        ...(diagnostics && { diagnostics }),
        ...(performanceTests && { performance: performanceTests }),
        metadata: {
          reportGeneratedAt: healthReport.timestamp,
          diagnosticsRun: runDiagnostics,
          performanceTestsRun: includePerformanceTests,
          processingTime: Date.now() - startTime
        }
      }
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('System diagnostics API error:', error);

    return NextResponse.json({
      success: false,
      error: 'Failed to run system diagnostics',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * Helper function to get quality metrics for a specific timeframe
 */
async function getQualityMetrics(timeframe: string) {
  const timeCondition = getTimeCondition(timeframe);

  try {
    const [
      documentStats,
      processingStats,
      errorStats,
      chunkStats
    ] = await Promise.all([
      // Document processing statistics
      db.execute(sql`
        SELECT
          COUNT(*) as total_documents,
          COUNT(CASE WHEN processing_status = 'completed' THEN 1 END) as completed_documents,
          COUNT(CASE WHEN processing_status = 'failed' THEN 1 END) as failed_documents,
          COUNT(CASE WHEN processing_status = 'processing' THEN 1 END) as processing_documents,
          AVG(CASE WHEN metadata->>'qualityScore' IS NOT NULL
              THEN CAST(metadata->>'qualityScore' AS INTEGER) END) as avg_quality_score,
          AVG(CASE WHEN metadata->>'totalProcessingTime' IS NOT NULL
              THEN CAST(metadata->>'totalProcessingTime' AS INTEGER) END) as avg_processing_time
        FROM documents
        WHERE created_at > ${timeCondition}
      `),

      // Processing pipeline statistics
      db.execute(sql`
        SELECT
          AVG(CASE WHEN metadata->'processingStages'->'ocr'->>'confidence' IS NOT NULL
              THEN CAST(metadata->'processingStages'->'ocr'->>'confidence' AS FLOAT) END) as avg_ocr_confidence,
          AVG(CASE WHEN metadata->'processingStages'->'chunking'->>'totalChunks' IS NOT NULL
              THEN CAST(metadata->'processingStages'->'chunking'->>'totalChunks' AS INTEGER) END) as avg_chunks_per_doc,
          COUNT(CASE WHEN metadata->'processingStages'->'metadata'->>'aiEnhanced' = 'true' THEN 1 END) as ai_enhanced_count
        FROM documents
        WHERE created_at > ${timeCondition}
        AND processing_status = 'completed'
      `),

      // Error statistics
      db.execute(sql`
        SELECT
          COUNT(*) as total_errors,
          COUNT(CASE WHEN metadata->>'error' LIKE '%OCR%' THEN 1 END) as ocr_errors,
          COUNT(CASE WHEN metadata->>'error' LIKE '%embedding%' THEN 1 END) as embedding_errors,
          COUNT(CASE WHEN metadata->>'error' LIKE '%metadata%' THEN 1 END) as metadata_errors
        FROM documents
        WHERE created_at > ${timeCondition}
        AND processing_status = 'failed'
      `),

      // Chunk and embedding statistics
      db.execute(sql`
        SELECT
          COUNT(*) as total_chunks,
          AVG(token_count) as avg_tokens_per_chunk,
          COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as chunks_with_embeddings
        FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE d.created_at > ${timeCondition}
      `)
    ]);

    return {
      documents: documentStats[0] || {},
      processing: processingStats[0] || {},
      errors: errorStats[0] || {},
      chunks: chunkStats[0] || {}
    };
  } catch (error) {
    console.error('Error getting quality metrics:', error);
    return {
      documents: {},
      processing: {},
      errors: {},
      chunks: {}
    };
  }
}

/**
 * Helper function to get quality trends
 */
async function getQualityTrends(timeframe: string) {
  const intervals = getTimeIntervals(timeframe);

  try {
    const trends = await db.execute(sql`
      SELECT
        DATE_TRUNC(${intervals.interval}, created_at) as period,
        COUNT(*) as documents_processed,
        COUNT(CASE WHEN processing_status = 'completed' THEN 1 END) as successful_documents,
        AVG(CASE WHEN metadata->>'qualityScore' IS NOT NULL
            THEN CAST(metadata->>'qualityScore' AS INTEGER) END) as avg_quality_score,
        AVG(CASE WHEN metadata->>'totalProcessingTime' IS NOT NULL
            THEN CAST(metadata->>'totalProcessingTime' AS INTEGER) END) as avg_processing_time
      FROM documents
      WHERE created_at > ${getTimeCondition(timeframe)}
      GROUP BY DATE_TRUNC(${intervals.interval}, created_at)
      ORDER BY period DESC
      LIMIT ${intervals.limit}
    `);

    return trends.map(trend => ({
      period: trend.period,
      documentsProcessed: parseInt(trend.documents_processed || '0'),
      successRate: trend.documents_processed ?
        (parseInt(trend.successful_documents || '0') / parseInt(trend.documents_processed || '1')) * 100 : 0,
      averageQualityScore: parseFloat(trend.avg_quality_score || '0'),
      averageProcessingTime: parseFloat(trend.avg_processing_time || '0')
    }));
  } catch (error) {
    console.error('Error getting quality trends:', error);
    return [];
  }
}

/**
 * Helper function to run system diagnostics
 */
async function runSystemDiagnostics() {
  const diagnostics = {
    database: await runDatabaseDiagnostics(),
    storage: await runStorageDiagnostics(),
    performance: await runPerformanceDiagnostics()
  };

  return diagnostics;
}

async function runDatabaseDiagnostics() {
  try {
    const [
      connectionTest,
      indexHealth,
      tableStats
    ] = await Promise.all([
      db.execute(sql`SELECT pg_is_in_recovery() as in_recovery, version() as version`),
      db.execute(sql`
        SELECT
          schemaname,
          tablename,
          indexname,
          idx_scan,
          idx_tup_read,
          idx_tup_fetch
        FROM pg_stat_user_indexes
        WHERE idx_scan < 100
        AND schemaname = 'public'
        LIMIT 10
      `),
      db.execute(sql`
        SELECT
          schemaname,
          tablename,
          n_tup_ins,
          n_tup_upd,
          n_tup_del,
          n_live_tup,
          n_dead_tup
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
      `)
    ]);

    return {
      connection: {
        healthy: true,
        inRecovery: connectionTest[0]?.in_recovery || false,
        version: connectionTest[0]?.version || 'Unknown'
      },
      indexes: {
        underused: indexHealth || [],
        recommendation: indexHealth?.length > 0 ? 'Consider reviewing unused indexes' : 'Index usage looks good'
      },
      tables: tableStats || []
    };
  } catch (error) {
    return {
      connection: { healthy: false, error: error instanceof Error ? error.message : 'Unknown error' },
      indexes: { underused: [], recommendation: 'Could not check index health' },
      tables: []
    };
  }
}

async function runStorageDiagnostics() {
  try {
    const storageStats = await db.execute(sql`
      SELECT
        pg_size_pretty(pg_total_relation_size('documents')) as documents_size,
        pg_size_pretty(pg_total_relation_size('document_chunks')) as chunks_size,
        pg_size_pretty(pg_database_size(current_database())) as total_db_size
    `);

    return {
      tablesSizes: storageStats[0] || {},
      recommendation: 'Monitor storage growth and consider archiving old documents'
    };
  } catch (error) {
    return {
      tablesSizes: {},
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function runPerformanceDiagnostics() {
  try {
    const slowQueries = await db.execute(sql`
      SELECT
        query,
        calls,
        total_time,
        mean_time,
        rows
      FROM pg_stat_statements
      WHERE query LIKE '%documents%' OR query LIKE '%document_chunks%'
      ORDER BY total_time DESC
      LIMIT 5
    `);

    return {
      slowQueries: slowQueries || [],
      recommendation: slowQueries?.length > 0 ? 'Consider optimizing slow queries' : 'Query performance looks good'
    };
  } catch (error) {
    return {
      slowQueries: [],
      error: 'pg_stat_statements extension may not be enabled'
    };
  }
}

/**
 * Helper function to run performance tests
 */
async function runPerformanceTests() {
  const tests = {
    databaseLatency: await testDatabaseLatency(),
    embeddingLatency: await testEmbeddingLatency(),
    throughput: await estimateThroughput()
  };

  return tests;
}

async function testDatabaseLatency() {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return {
      latency: Date.now() - start,
      status: 'healthy'
    };
  } catch (error) {
    return {
      latency: Date.now() - start,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function testEmbeddingLatency() {
  // This would test actual embedding service latency
  // For now, return estimated values
  return {
    latency: 150, // Estimated 150ms
    status: 'estimated'
  };
}

async function estimateThroughput() {
  try {
    // Calculate recent throughput based on completed documents
    const recentDocs = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM documents
      WHERE processing_status = 'completed'
      AND created_at > NOW() - INTERVAL '1 hour'
    `);

    const docsPerHour = parseInt(recentDocs[0]?.count || '0');

    return {
      documentsPerHour: docsPerHour,
      estimatedCapacity: docsPerHour * 24, // Extrapolate to daily capacity
      status: 'calculated'
    };
  } catch (error) {
    return {
      documentsPerHour: 0,
      estimatedCapacity: 0,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Helper functions for time conditions
 */
function getTimeCondition(timeframe: string): string {
  switch (timeframe) {
    case '1h': return "NOW() - INTERVAL '1 hour'";
    case '24h': return "NOW() - INTERVAL '24 hours'";
    case '7d': return "NOW() - INTERVAL '7 days'";
    case '30d': return "NOW() - INTERVAL '30 days'";
    default: return "NOW() - INTERVAL '24 hours'";
  }
}

function getTimeIntervals(timeframe: string): { interval: string; limit: number } {
  switch (timeframe) {
    case '1h': return { interval: "'5 minutes'", limit: 12 };
    case '24h': return { interval: "'1 hour'", limit: 24 };
    case '7d': return { interval: "'1 day'", limit: 7 };
    case '30d': return { interval: "'1 day'", limit: 30 };
    default: return { interval: "'1 hour'", limit: 24 };
  }
}