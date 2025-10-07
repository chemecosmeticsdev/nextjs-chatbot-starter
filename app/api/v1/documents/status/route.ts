import { NextRequest, NextResponse } from 'next/server';
import { jobQueue } from '@/lib/services/job-queue';
import { vectorStorage } from '@/lib/services/vector-storage';
import { db } from '@/lib/db';
import { documents, documentChunks } from '@/lib/db/schema';
import { eq, and, desc, count } from 'drizzle-orm';
import { z } from 'zod';

/**
 * Document Processing Status and Monitoring API
 *
 * Provides comprehensive monitoring capabilities for document processing
 * jobs and overall system health
 */

// Request validation schemas
const JobStatusSchema = z.object({
  jobId: z.string().optional(),
  documentId: z.string().uuid().optional()
}).refine(data => data.jobId || data.documentId, {
  message: "Either jobId or documentId must be provided"
});

const DocumentStatusSchema = z.object({
  documentId: z.string().uuid()
});

const BulkStatusSchema = z.object({
  documentIds: z.array(z.string().uuid()).max(100), // Limit to 100 documents per request
  includeDetails: z.boolean().optional()
});

/**
 * GET /api/v1/documents/status?jobId=xxx or ?documentId=xxx
 * Get job or document processing status
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');
    const documentId = searchParams.get('documentId');

    if (!jobId && !documentId) {
      return NextResponse.json(
        { success: false, error: 'Either jobId or documentId parameter is required' },
        { status: 400 }
      );
    }

    if (jobId) {
      // Get job status
      const jobStatus = await jobQueue.getJobStatus(jobId);

      if (jobStatus.status === 'not_found') {
        return NextResponse.json(
          { success: false, error: 'Job not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          jobId,
          status: jobStatus.status,
          progress: jobStatus.progress || 0,
          error: jobStatus.error,
          updatedAt: jobStatus.updatedAt,
          job: jobStatus.job
        }
      });
    }

    if (documentId) {
      // Get document processing status
      const document = await db
        .select({
          id: documents.id,
          originalFilename: documents.originalFilename,
          processingStatus: documents.processingStatus,
          processingError: documents.processingError,
          ocrCompletedAt: documents.ocrCompletedAt,
          embeddingCompletedAt: documents.embeddingCompletedAt,
          indexedAt: documents.indexedAt,
          wordCount: documents.wordCount,
          tokenCount: documents.tokenCount,
          pageCount: documents.pageCount,
          ragDocumentType: documents.ragDocumentType,
          qualityScore: documents.qualityScore,
          validationStatus: documents.validationStatus,
          createdAt: documents.createdAt,
          updatedAt: documents.updatedAt
        })
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);

      if (document.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Document not found' },
          { status: 404 }
        );
      }

      // Get chunk count
      const chunkCountResult = await db
        .select({ count: count() })
        .from(documentChunks)
        .where(eq(documentChunks.documentId, documentId));

      const chunkCount = chunkCountResult[0]?.count || 0;

      const doc = document[0];

      // Calculate processing progress
      let progress = 0;
      const stages = [
        { name: 'text_extraction', completed: !!doc.ocrCompletedAt, weight: 20 },
        { name: 'metadata_enhancement', completed: !!doc.ragDocumentType, weight: 15 },
        { name: 'document_chunking', completed: chunkCount > 0, weight: 15 },
        { name: 'embedding_generation', completed: !!doc.embeddingCompletedAt, weight: 25 },
        { name: 'vector_storage', completed: !!doc.indexedAt, weight: 25 }
      ];

      progress = stages.reduce((total, stage) => {
        return total + (stage.completed ? stage.weight : 0);
      }, 0);

      return NextResponse.json({
        success: true,
        data: {
          documentId,
          filename: doc.originalFilename,
          status: doc.processingStatus,
          progress,
          error: doc.processingError,
          stages: stages.map(s => ({ name: s.name, completed: s.completed })),
          metrics: {
            wordCount: doc.wordCount,
            tokenCount: doc.tokenCount,
            pageCount: doc.pageCount,
            chunkCount,
            qualityScore: doc.qualityScore
          },
          metadata: {
            documentType: doc.ragDocumentType,
            validationStatus: doc.validationStatus,
            ocrCompletedAt: doc.ocrCompletedAt,
            embeddingCompletedAt: doc.embeddingCompletedAt,
            indexedAt: doc.indexedAt
          },
          timestamps: {
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt
          }
        }
      });
    }

  } catch (error) {
    console.error('Status API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/documents/status/bulk
 * Get status for multiple documents
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = BulkStatusSchema.parse(body);

    const { documentIds, includeDetails = false } = validatedData;

    if (documentIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No document IDs provided' },
        { status: 400 }
      );
    }

    // Get documents with basic status info
    const documentsData = await Promise.all(
      documentIds.map(async (documentId) => {
        try {
          const document = await db
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
              updatedAt: documents.updatedAt
            })
            .from(documents)
            .where(eq(documents.id, documentId))
            .limit(1);

          if (document.length === 0) {
            return { documentId, status: 'not_found' };
          }

          const doc = document[0];

          let progress = 0;
          let chunkCount = 0;

          if (includeDetails) {
            // Get chunk count
            const chunkCountResult = await db
              .select({ count: count() })
              .from(documentChunks)
              .where(eq(documentChunks.documentId, documentId));

            chunkCount = chunkCountResult[0]?.count || 0;

            // Calculate progress
            const stages = [
              { completed: !!doc.ocrCompletedAt, weight: 20 },
              { completed: !!doc.ragDocumentType, weight: 15 },
              { completed: chunkCount > 0, weight: 15 },
              { completed: !!doc.embeddingCompletedAt, weight: 25 },
              { completed: !!doc.indexedAt, weight: 25 }
            ];

            progress = stages.reduce((total, stage) => {
              return total + (stage.completed ? stage.weight : 0);
            }, 0);
          }

          return {
            documentId,
            filename: doc.originalFilename,
            status: doc.processingStatus,
            progress: includeDetails ? progress : undefined,
            error: doc.processingError,
            qualityScore: doc.qualityScore,
            documentType: doc.ragDocumentType,
            chunkCount: includeDetails ? chunkCount : undefined,
            updatedAt: doc.updatedAt
          };

        } catch (error) {
          console.error(`Error getting status for document ${documentId}:`, error);
          return { documentId, status: 'error', error: 'Failed to retrieve status' };
        }
      })
    );

    // Calculate summary statistics
    const summary = {
      total: documentIds.length,
      completed: documentsData.filter(d => d.status === 'completed').length,
      processing: documentsData.filter(d => d.status === 'processing').length,
      failed: documentsData.filter(d => d.status === 'failed').length,
      pending: documentsData.filter(d => d.status === 'pending').length,
      notFound: documentsData.filter(d => d.status === 'not_found').length
    };

    return NextResponse.json({
      success: true,
      data: {
        summary,
        documents: documentsData,
        requestedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Bulk status API error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}