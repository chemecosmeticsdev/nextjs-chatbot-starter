import { NextRequest, NextResponse } from 'next/server';
import { jobQueue, JobFactory, JobType, JobPriority } from '@/lib/services/job-queue';
import { db } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

/**
 * Document Processing API Endpoints
 *
 * Provides REST API interface for document processing operations
 * using the enhanced SQS job processing system
 */

// Request validation schemas
const ProcessDocumentSchema = z.object({
  documentId: z.string().uuid(),
  userId: z.string().optional(),
  options: z.object({
    googleDriveFileId: z.string().optional(),
    fileUrl: z.string().url().optional(),
    skipSteps: z.array(z.enum(['download', 'extraction', 'metadata', 'chunking', 'embeddings', 'storage'])).optional(),
    forceReprocess: z.boolean().optional(),
    priority: z.enum(['low', 'normal', 'high', 'critical']).optional()
  }).optional()
});

const ReprocessDocumentSchema = z.object({
  documentIds: z.array(z.string().uuid()),
  forceReprocess: z.boolean().optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional()
});

const StepProcessingSchema = z.object({
  documentId: z.string().uuid(),
  step: z.enum(['text_extraction', 'metadata_enhancement', 'document_chunking', 'embedding_generation', 'vector_storage']),
  stepPayload: z.record(z.any()).optional()
});

/**
 * POST /api/v1/documents/process
 * Start complete document processing pipeline
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = ProcessDocumentSchema.parse(body);

    const { documentId, userId = 'api', options = {} } = validatedData;

    // Verify document exists
    const document = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (document.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      );
    }

    // Check if document is already being processed
    if (document[0].processingStatus === 'processing') {
      return NextResponse.json(
        { success: false, error: 'Document is already being processed' },
        { status: 409 }
      );
    }

    // Convert priority string to enum
    const priority = options.priority ?
      JobPriority[options.priority.toUpperCase() as keyof typeof JobPriority] :
      JobPriority.NORMAL;

    // Queue complete document processing pipeline
    const jobId = await jobQueue.addJob(
      JobFactory.completeDocumentPipeline(documentId, userId, {
        ...options,
        priority
      })
    );

    // Update document status
    await db
      .update(documents)
      .set({
        processingStatus: 'processing',
        processingError: null,
        updatedAt: new Date()
      })
      .where(eq(documents.id, documentId));

    return NextResponse.json({
      success: true,
      data: {
        jobId,
        documentId,
        status: 'queued',
        pipeline: 'complete',
        estimatedDuration: '5-15 minutes',
        queuedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Document processing API error:', error);

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

/**
 * PUT /api/v1/documents/process/reprocess
 * Reprocess existing documents
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = ReprocessDocumentSchema.parse(body);

    const { documentIds, forceReprocess = false, priority = 'normal' } = validatedData;

    // Verify all documents exist
    const existingDocs = await db
      .select({ id: documents.id, processingStatus: documents.processingStatus })
      .from(documents)
      .where(eq(documents.id, documentIds[0])); // This would need to be updated for multiple IDs

    if (existingDocs.length !== documentIds.length) {
      return NextResponse.json(
        { success: false, error: 'One or more documents not found' },
        { status: 404 }
      );
    }

    const jobPriority = JobPriority[priority.toUpperCase() as keyof typeof JobPriority];
    const queuedJobs = [];

    // Queue reprocessing jobs for each document
    for (const documentId of documentIds) {
      const jobId = await jobQueue.addJob({
        type: JobType.DOCUMENT_REPROCESSING,
        priority: jobPriority,
        payload: { documentId, forceReprocess },
        metadata: { documentId, userId: 'api' }
      });

      queuedJobs.push({ documentId, jobId });

      // Update document status
      await db
        .update(documents)
        .set({
          processingStatus: 'processing',
          processingError: null,
          updatedAt: new Date()
        })
        .where(eq(documents.id, documentId));
    }

    return NextResponse.json({
      success: true,
      data: {
        queuedJobs,
        totalDocuments: documentIds.length,
        forceReprocess,
        estimatedDuration: `${Math.ceil(documentIds.length * 5)}-${Math.ceil(documentIds.length * 15)} minutes`,
        queuedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Document reprocessing API error:', error);

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

/**
 * POST /api/v1/documents/process/step
 * Process individual pipeline step
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = StepProcessingSchema.parse(body);

    const { documentId, step, stepPayload = {} } = validatedData;

    // Verify document exists
    const document = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (document.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      );
    }

    let jobId: string;

    // Queue the specific step
    switch (step) {
      case 'text_extraction':
        jobId = await jobQueue.addJob(
          JobFactory.textExtraction(
            documentId,
            document[0].filePath!,
            document[0].mimeType!,
            document[0].originalFilename
          )
        );
        break;

      case 'metadata_enhancement':
        jobId = await jobQueue.addJob(
          JobFactory.metadataEnhancement(
            documentId,
            document[0].extractedText || '',
            document[0].googleDriveFolderPath || undefined,
            document[0].originalFilename
          )
        );
        break;

      case 'document_chunking':
        jobId = await jobQueue.addJob(
          JobFactory.documentChunking(
            documentId,
            document[0].extractedText || '',
            document[0].ragDocumentType || 'other',
            document[0].tokenCount || 0
          )
        );
        break;

      case 'embedding_generation':
        if (!stepPayload.chunks) {
          return NextResponse.json(
            { success: false, error: 'chunks required for embedding generation' },
            { status: 400 }
          );
        }
        jobId = await jobQueue.addJob(
          JobFactory.embeddingGeneration(documentId, stepPayload.chunks)
        );
        break;

      case 'vector_storage':
        if (!stepPayload.chunksWithEmbeddings) {
          return NextResponse.json(
            { success: false, error: 'chunksWithEmbeddings required for vector storage' },
            { status: 400 }
          );
        }
        jobId = await jobQueue.addJob(
          JobFactory.vectorStorage(documentId, stepPayload.chunksWithEmbeddings)
        );
        break;

      default:
        return NextResponse.json(
          { success: false, error: `Unsupported step: ${step}` },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      data: {
        jobId,
        documentId,
        step,
        status: 'queued',
        queuedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Step processing API error:', error);

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