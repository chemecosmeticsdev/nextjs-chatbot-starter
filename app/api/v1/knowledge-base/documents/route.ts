import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService } from '@/lib/auth';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-utils';
import { KnowledgeBaseService } from '@/lib/services/knowledge-base';
import {
  documentUploadSchema,
  bulkProcessingSchema,
  type DocumentUploadRequest,
  type BulkProcessingRequest
} from '@/lib/validation/knowledge-base';
import { formatValidationErrors } from '@/lib/validation/common';
import { db } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { and, eq, gte, lte, ilike, or, desc, count } from 'drizzle-orm';
import { nanoid } from 'nanoid';

/**
 * GET /api/v1/knowledge-base/documents
 *
 * List documents in the knowledge base with filtering and pagination
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

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const search = searchParams.get('search');
    const category = searchParams.get('category');
    const supplier = searchParams.get('supplier');
    const status = searchParams.get('status');
    const fromDate = searchParams.get('from_date');
    const toDate = searchParams.get('to_date');

    // Build filters
    const conditions = [];

    if (search) {
      conditions.push(
        or(
          ilike(documents.title, `%${search}%`),
          ilike(documents.filename, `%${search}%`),
          ilike(documents.originalFilename, `%${search}%`)
        )
      );
    }

    if (category) {
      conditions.push(eq(documents.metadata, { category }));
    }

    if (supplier) {
      conditions.push(eq(documents.metadata, { supplier }));
    }

    if (status) {
      conditions.push(eq(documents.processingStatus, status));
    }

    if (fromDate) {
      conditions.push(gte(documents.createdAt, new Date(fromDate)));
    }

    if (toDate) {
      conditions.push(lte(documents.createdAt, new Date(toDate)));
    }

    const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [{ totalCount }] = await db
      .select({ totalCount: count() })
      .from(documents)
      .where(whereCondition);

    // Get documents with pagination
    const documentsResult = await db
      .select({
        id: documents.id,
        title: documents.title,
        filename: documents.filename,
        mimeType: documents.mimeType,
        fileSize: documents.fileSize,
        processingStatus: documents.processingStatus,
        metadata: documents.metadata,
        uploadedBy: documents.uploadedBy,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .where(whereCondition)
      .orderBy(desc(documents.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    // Get chunk counts for each document
    const documentIds = documentsResult.map(d => d.id);
    let chunkCounts: any[] = [];

    if (documentIds.length > 0) {
      try {
        // Use Drizzle's inArray function for proper parameter binding
        const { inArray } = await import('drizzle-orm');
        const { documentChunks } = await import('@/lib/db/schema');

        const result = await db
          .select({
            documentId: documentChunks.documentId,
            chunkCount: count(),
          })
          .from(documentChunks)
          .where(inArray(documentChunks.documentId, documentIds))
          .groupBy(documentChunks.documentId);

        chunkCounts = result.map(row => ({
          document_id: row.documentId,
          chunk_count: row.chunkCount
        }));
      } catch (error) {
        console.error('Error fetching chunk counts:', error);
        chunkCounts = [];
      }
    }

    const chunkCountMap = Object.fromEntries(
      chunkCounts.map((row: any) => [row.document_id, parseInt(row.chunk_count)])
    );

    const documentsWithCounts = documentsResult.map(doc => ({
      ...doc,
      chunkCount: chunkCountMap[doc.id] || 0
    }));

    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json(
      createSuccessResponse({
        documents: documentsWithCounts,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages
        }
      }),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error listing documents:', error);
    return NextResponse.json(
      createErrorResponse('Internal server error', 'INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/knowledge-base/documents
 *
 * Upload and process a new document
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        createErrorResponse('Authentication required', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    // Parse and validate request body
    let uploadData: DocumentUploadRequest;
    try {
      const rawBody = await request.json();
      uploadData = documentUploadSchema.parse(rawBody);
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

    try {
      // Decode content if it's base64
      let content = uploadData.content;
      if (uploadData.mimeType.includes('text/') || uploadData.mimeType.includes('application/json')) {
        try {
          content = atob(uploadData.content);
        } catch {
          // Content might already be plain text
        }
      }

      // Create document record
      const documentId = nanoid();
      const [newDocument] = await db
        .insert(documents)
        .values({
          id: documentId,
          title: uploadData.filename.replace(/\.[^/.]+$/, ''), // Remove extension
          filename: uploadData.filename,
          originalFilename: uploadData.filename,
          filePath: `/uploads/${documentId}`, // Virtual path since we store content in chunks
          mimeType: uploadData.mimeType,
          fileSize: content.length,
          fileSizeBytes: content.length.toString(),
          documentType: 'inci', // Default document type
          metadata: uploadData.metadata || {},
          processingStatus: 'pending',
          uploadedBy: user.id,
        })
        .returning();

      // Start processing in background
      processDocumentAsync(
        documentId,
        content,
        uploadData.processingOptions?.chunkSize || 500,
        uploadData.processingOptions?.chunkOverlap || 50
      );

      // Log document upload
      console.log(
        `Document uploaded - ID: ${documentId}, User: ${user.id}, ` +
        `Filename: ${uploadData.filename}, Size: ${content.length} bytes`
      );

      return NextResponse.json(
        createSuccessResponse({
          documentId: newDocument.id,
          message: 'Document uploaded successfully and is being processed',
          status: 'processing',
          filename: uploadData.filename,
          uploadedAt: newDocument.createdAt
        }),
        { status: 201 }
      );

    } catch (error) {
      console.error('Error uploading document:', error);
      return NextResponse.json(
        createErrorResponse('Failed to upload document', 'UPLOAD_FAILED'),
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Error in document upload:', error);
    return NextResponse.json(
      createErrorResponse('Internal server error', 'INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * PUT /api/v1/knowledge-base/documents
 *
 * Bulk operations on documents
 */
export async function PUT(request: NextRequest) {
  try {
    // Authenticate user
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        createErrorResponse('Authentication required', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    // Check admin permissions for bulk operations
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      return NextResponse.json(
        createErrorResponse('Insufficient permissions for bulk operations', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    // Parse and validate request body
    let bulkData: BulkProcessingRequest;
    try {
      const rawBody = await request.json();
      bulkData = bulkProcessingSchema.parse(rawBody);
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

    const results = [];

    for (const documentId of bulkData.documentIds) {
      try {
        let success = false;

        switch (bulkData.action) {
          case 'reprocess':
            success = await KnowledgeBaseService.reprocessDocument(documentId);
            break;
          case 'delete':
            await db.delete(documents).where(eq(documents.id, documentId));
            success = true;
            break;
          case 'update_embeddings':
            success = await KnowledgeBaseService.reprocessDocument(documentId);
            break;
        }

        results.push({
          documentId,
          success,
          action: bulkData.action
        });
      } catch (error) {
        console.error(`Error processing document ${documentId}:`, error);
        results.push({
          documentId,
          success: false,
          action: bulkData.action,
          error: 'Processing failed'
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    // Log bulk operation
    console.log(
      `Bulk operation completed - User: ${user.id}, Action: ${bulkData.action}, ` +
      `Success: ${successCount}, Failed: ${failureCount}`
    );

    return NextResponse.json(
      createSuccessResponse({
        message: `Bulk ${bulkData.action} completed`,
        results,
        summary: {
          total: results.length,
          successful: successCount,
          failed: failureCount
        }
      }),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error in bulk operation:', error);
    return NextResponse.json(
      createErrorResponse('Internal server error', 'INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * Process document asynchronously in background
 */
async function processDocumentAsync(
  documentId: string,
  content: string,
  chunkSize: number,
  chunkOverlap: number
): Promise<void> {
  try {
    // Mark as processing
    await db
      .update(documents)
      .set({ processingStatus: 'processing', updatedAt: new Date() })
      .where(eq(documents.id, documentId));

    // Process the document
    await KnowledgeBaseService.reprocessDocument(documentId);

  } catch (error) {
    console.error(`Error processing document ${documentId}:`, error);

    // Mark as failed
    await db
      .update(documents)
      .set({ processingStatus: 'failed', updatedAt: new Date() })
      .where(eq(documents.id, documentId));
  }
}

/**
 * Handle unsupported HTTP methods
 */
export async function DELETE() {
  return NextResponse.json(
    createErrorResponse('Use PUT with delete action for bulk operations', 'METHOD_NOT_ALLOWED'),
    { status: 405 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'),
    { status: 405 }
  );
}