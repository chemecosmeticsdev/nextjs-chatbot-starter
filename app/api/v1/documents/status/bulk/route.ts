import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { documents, documentChunks } from '@/lib/db/schema';
import { eq, count, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { jobQueue } from '@/lib/services/job-queue';
import { cache, CacheKeys } from '@/lib/services/cache-service';

/**
 * Bulk Document Status API
 *
 * Provides status checking for multiple documents at once
 * to support frontend polling for batch operations
 */

// Request validation schema
const BulkStatusSchema = z.object({
  documentIds: z.array(z.string().uuid()).min(1).max(100), // Limit to 100 documents per request
  includeDetails: z.boolean().optional().default(false),
  includeProgress: z.boolean().optional().default(true)
});

/**
 * POST /api/v1/documents/status/bulk
 * Get processing status for multiple documents
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = BulkStatusSchema.parse(body);

    const { documentIds, includeDetails, includeProgress } = validatedData;

    const startTime = Date.now();
    console.log(`[BulkStatus] Checking status for ${documentIds.length} documents`);

    // Check for cached bulk response first (short-term cache for frequent polling)
    const cacheKey = CacheKeys.apiResponse('bulk_status', documentIds.sort().join(','));
    if (!includeDetails) { // Only use cache for basic status requests
      try {
        const cached = await cache.get(cacheKey);
        if (cached && Date.now() - cached.responseTime < 10000) { // 10 second cache
          console.log(`[BulkStatus] Returning cached response for ${documentIds.length} documents`);
          return NextResponse.json(cached);
        }
      } catch (error) {
        console.error('[BulkStatus] Cache retrieval error:', error);
      }
    }

    // Batch query for all documents to optimize performance
    const documentsData = await db
      .select({
        id: documents.id,
        originalFilename: documents.originalFilename,
        processingStatus: documents.processingStatus,
        processingError: documents.processingError,
        ocrCompletedAt: documents.ocrCompletedAt,
        embeddingCompletedAt: documents.embeddingCompletedAt,
        indexedAt: documents.indexedAt,
        qualityScore: documents.qualityScore,
        ragDocumentType: documents.ragDocumentType,
        wordCount: documents.wordCount,
        tokenCount: documents.tokenCount,
        pageCount: documents.pageCount,
        validationStatus: documents.validationStatus,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt
      })
      .from(documents)
      .where(inArray(documents.id, documentIds));

    // Get chunk counts for all documents if details are requested
    let chunkCounts = new Map<string, number>();
    if (includeDetails || includeProgress) {
      const chunkCountsResult = await db
        .select({
          documentId: documentChunks.documentId,
          count: count()
        })
        .from(documentChunks)
        .where(inArray(documentChunks.documentId, documentIds))
        .groupBy(documentChunks.documentId);

      chunkCountsResult.forEach(result => {
        chunkCounts.set(result.documentId, result.count);
      });
    }

    // Get real-time stage information for all documents
    const stageInfoPromises = documentIds.map(async (documentId) => {
      try {
        const stages = await jobQueue.getDocumentStages(documentId);
        return { documentId, stages };
      } catch (error) {
        console.error(`Failed to get stages for document ${documentId}:`, error);
        return { documentId, stages: null };
      }
    });

    const stageInfoResults = await Promise.all(stageInfoPromises);
    const stageInfoMap = new Map(stageInfoResults.map(r => [r.documentId, r.stages]));

    // Process results and calculate progress for each document
    const processedDocuments = await Promise.all(documentIds.map(async (documentId) => {
      const doc = documentsData.find(d => d.id === documentId);

      if (!doc) {
        return {
          documentId,
          status: 'not_found',
          error: 'Document not found in database'
        };
      }

      const chunkCount = chunkCounts.get(documentId) || 0;
      const stageInfo = stageInfoMap.get(documentId);

      // Calculate processing progress with enhanced stage tracking
      let progress = 0;
      let stages = [];
      let currentStage = null;

      if (includeProgress) {
        // Enhanced stage definitions with real-time status
        const stageDefinitions = [
          { name: 'text_extraction', dbCompleted: !!doc.ocrCompletedAt, weight: 20 },
          { name: 'metadata_enhancement', dbCompleted: !!doc.ragDocumentType, weight: 15 },
          { name: 'document_chunking', dbCompleted: chunkCount > 0, weight: 15 },
          { name: 'embedding_generation', dbCompleted: !!doc.embeddingCompletedAt, weight: 25 },
          { name: 'vector_storage', dbCompleted: !!doc.indexedAt, weight: 25 }
        ];

        stages = stageDefinitions.map(stageDef => {
          const stageData = stageInfo?.[stageDef.name];
          const completed = stageDef.dbCompleted || stageData?.status === 'completed';
          const stageProgress = stageData?.progress || (completed ? 100 : 0);
          const status = stageData?.status || (completed ? 'completed' : 'pending');

          // Track current active stage
          if (status === 'processing' || status === 'starting') {
            currentStage = stageDef.name;
          }

          return {
            name: stageDef.name,
            completed,
            status,
            progress: stageProgress,
            updatedAt: stageData?.updatedAt,
            details: stageData?.details
          };
        });

        // Calculate overall progress with real-time stage progress
        progress = stageDefinitions.reduce((total, stageDef) => {
          const stageData = stageInfo?.[stageDef.name];
          const stageProgress = stageData?.progress || (stageDef.dbCompleted ? 100 : 0);
          return total + (stageProgress / 100) * stageDef.weight;
        }, 0);

        progress = Math.round(progress);
      }

      // Determine overall document status
      let overallStatus = doc.processingStatus || 'pending';

      // Override with real-time status if available
      if (stageInfo && currentStage) {
        overallStatus = 'processing';
      } else if (progress === 100) {
        overallStatus = 'completed';
      } else if (doc.processingError) {
        overallStatus = 'failed';
      }

      // Base response
      const result: any = {
        documentId,
        filename: doc.originalFilename,
        status: overallStatus,
        updatedAt: doc.updatedAt
      };

      // Add progress information
      if (includeProgress) {
        result.progress = progress;
        result.stages = stages;
        result.currentStage = currentStage;
      }

      // Add error information if present
      if (doc.processingError) {
        result.error = doc.processingError;
      }

      // Add detailed information if requested
      if (includeDetails) {
        result.details = {
          documentType: doc.ragDocumentType,
          validationStatus: doc.validationStatus,
          qualityScore: doc.qualityScore,
          metrics: {
            wordCount: doc.wordCount,
            tokenCount: doc.tokenCount,
            pageCount: doc.pageCount,
            chunkCount
          },
          timestamps: {
            ocrCompletedAt: doc.ocrCompletedAt,
            embeddingCompletedAt: doc.embeddingCompletedAt,
            indexedAt: doc.indexedAt,
            createdAt: doc.createdAt
          },
          realTimeStages: stageInfo
        };
      }

      return result;
    }));

    // Calculate summary statistics
    const summary = {
      total: documentIds.length,
      found: processedDocuments.filter(d => d.status !== 'not_found').length,
      completed: processedDocuments.filter(d => d.status === 'completed').length,
      processing: processedDocuments.filter(d => d.status === 'processing').length,
      failed: processedDocuments.filter(d => d.status === 'failed').length,
      pending: processedDocuments.filter(d => d.status === 'pending').length,
      notFound: processedDocuments.filter(d => d.status === 'not_found').length
    };

    const processingTime = Date.now() - startTime;
    console.log(`[BulkStatus] Summary: ${summary.completed}/${summary.total} completed, ${summary.processing} processing, ${summary.failed} failed (${processingTime}ms)`);

    const response = {
      success: true,
      data: {
        summary,
        documents: processedDocuments,
        requestedAt: new Date().toISOString(),
        responseTime: Date.now(),
        processingTime,
        cached: false
      }
    };

    // Cache the response for basic status requests to reduce database load
    if (!includeDetails && summary.processing > 0) {
      try {
        await cache.set(cacheKey, response, 10); // 10 second cache for active processing
      } catch (error) {
        console.error('[BulkStatus] Cache storage error:', error);
      }
    }

    // Log performance metrics
    if (processingTime > 1000) {
      console.warn(`[BulkStatus] Slow response: ${processingTime}ms for ${documentIds.length} documents`);
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('[BulkStatus] API error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
          details: error.errors
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/documents/status/bulk?documentIds=id1,id2,id3
 * Alternative GET method for bulk status checking
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const documentIdsParam = searchParams.get('documentIds');
    const includeDetails = searchParams.get('includeDetails') === 'true';
    const includeProgress = searchParams.get('includeProgress') !== 'false'; // Default true

    if (!documentIdsParam) {
      return NextResponse.json(
        { success: false, error: 'documentIds parameter is required' },
        { status: 400 }
      );
    }

    const documentIds = documentIdsParam.split(',').filter(id => id.trim());

    if (documentIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid document IDs provided' },
        { status: 400 }
      );
    }

    if (documentIds.length > 100) {
      return NextResponse.json(
        { success: false, error: 'Maximum 100 document IDs allowed per request' },
        { status: 400 }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const invalidIds = documentIds.filter(id => !uuidRegex.test(id));

    if (invalidIds.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid document ID format',
          invalidIds
        },
        { status: 400 }
      );
    }

    // Forward to POST method logic
    const mockRequest = new NextRequest(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify({
        documentIds,
        includeDetails,
        includeProgress
      })
    });

    return await POST(mockRequest);

  } catch (error) {
    console.error('[BulkStatus] GET API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}