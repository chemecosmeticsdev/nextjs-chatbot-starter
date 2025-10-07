import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService } from '@/lib/auth';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-utils';
import { KnowledgeBaseService } from '@/lib/services/knowledge-base';
import { knowledgeBaseUpdateSchema, type KnowledgeBaseUpdateRequest } from '@/lib/validation/knowledge-base';
import { formatValidationErrors } from '@/lib/validation/common';
import { db } from '@/lib/db';
import { documents, documentChunks } from '@/lib/db/schema';
import { eq, count } from 'drizzle-orm';

/**
 * GET /api/v1/knowledge-base/documents/[id]
 *
 * Get detailed information about a specific document
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate user
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        createErrorResponse('Authentication required', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    const documentId = params.id;
    if (!documentId) {
      return NextResponse.json(
        createErrorResponse('Document ID is required', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    // Get document details
    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!document) {
      return NextResponse.json(
        createErrorResponse('Document not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    // Get chunk count and processing status
    const [chunkInfo] = await db
      .select({ count: count() })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, documentId));

    // Get processing status details if available
    const processingStatus = await KnowledgeBaseService.getDocumentProcessingStatus(documentId);

    const { searchParams } = new URL(request.url);
    const includeContent = searchParams.get('include_content') === 'true';
    const includeChunks = searchParams.get('include_chunks') === 'true';

    let chunks = [];
    if (includeChunks) {
      chunks = await db
        .select({
          id: documentChunks.id,
          chunkIndex: documentChunks.chunkIndex,
          content: documentChunks.content,
          metadata: documentChunks.metadata,
          createdAt: documentChunks.createdAt
        })
        .from(documentChunks)
        .where(eq(documentChunks.documentId, documentId))
        .orderBy(documentChunks.chunkIndex);
    }

    const response = {
      id: document.id,
      title: document.title,
      filename: document.filename,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
      processingStatus: document.processingStatus,
      metadata: document.metadata,
      uploadedBy: document.uploadedBy,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      chunkCount: chunkInfo.count,
      processingDetails: processingStatus,
      // Structured metadata fields
      supplierName: document.supplierName,
      supplierNormalized: document.supplierNormalized,
      supplierCountry: document.supplierCountry,
      ingredientName: document.ingredientName,
      ingredientNormalized: document.ingredientNormalized,
      ingredientInciName: document.ingredientInciName,
      ingredientCasNumber: document.ingredientCasNumber,
      ragDocumentType: document.ragDocumentType,
      documentSubtype: document.documentSubtype,
      complianceTypes: document.complianceTypes,
      certificationBodies: document.certificationBodies,
      regulatoryRegions: document.regulatoryRegions,
      keywords: document.keywords,
      casNumbers: document.casNumbers,
      inciNames: document.inciNames,
      allergens: document.allergens,
      qualityScore: document.qualityScore,
      validationStatus: document.validationStatus,
      language: document.language,
      pageCount: document.pageCount,
      wordCount: document.wordCount,
      ...(includeContent && { content: document.content, extractedText: document.extractedText }),
      ...(includeChunks && { chunks })
    };

    return NextResponse.json(
      createSuccessResponse(response),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error getting document details:', error);
    return NextResponse.json(
      createErrorResponse('Internal server error', 'INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * PUT /api/v1/knowledge-base/documents/[id]
 *
 * Update document metadata or trigger reprocessing
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate user
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        createErrorResponse('Authentication required', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    const documentId = params.id;
    if (!documentId) {
      return NextResponse.json(
        createErrorResponse('Document ID is required', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    // Parse and validate request body
    let updateData: KnowledgeBaseUpdateRequest;
    try {
      const rawBody = await request.json();
      updateData = knowledgeBaseUpdateSchema.parse({
        ...rawBody,
        documentId
      });
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

    // Check if document exists
    const [existingDocument] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!existingDocument) {
      return NextResponse.json(
        createErrorResponse('Document not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    let result;
    switch (updateData.action) {
      case 'reprocess':
        // Check permissions for reprocessing
        if (user.role !== 'super_admin' && user.role !== 'admin' && existingDocument.uploadedBy !== user.id) {
          return NextResponse.json(
            createErrorResponse('Insufficient permissions to reprocess document', 'FORBIDDEN'),
            { status: 403 }
          );
        }

        const success = await KnowledgeBaseService.reprocessDocument(documentId);
        result = {
          action: 'reprocess',
          success,
          message: success ? 'Document reprocessing started' : 'Failed to start reprocessing'
        };
        break;

      case 'update_metadata':
        // Update document metadata (both basic JSONB metadata and structured fields)
        const updatedMetadata = {
          ...existingDocument.metadata,
          ...updateData.metadata
        };

        // Prepare update object with both basic metadata and structured fields
        const updateFields: any = {
          metadata: updatedMetadata,
          updatedAt: new Date()
        };

        // Add structured metadata fields if provided
        if (updateData.supplierName !== undefined) updateFields.supplierName = updateData.supplierName;
        if (updateData.supplierNormalized !== undefined) updateFields.supplierNormalized = updateData.supplierNormalized;
        if (updateData.supplierCountry !== undefined) updateFields.supplierCountry = updateData.supplierCountry;
        if (updateData.ingredientName !== undefined) updateFields.ingredientName = updateData.ingredientName;
        if (updateData.ingredientNormalized !== undefined) updateFields.ingredientNormalized = updateData.ingredientNormalized;
        if (updateData.ingredientInciName !== undefined) updateFields.ingredientInciName = updateData.ingredientInciName;
        if (updateData.ingredientCasNumber !== undefined) updateFields.ingredientCasNumber = updateData.ingredientCasNumber;
        if (updateData.ragDocumentType !== undefined) updateFields.ragDocumentType = updateData.ragDocumentType;
        if (updateData.documentSubtype !== undefined) updateFields.documentSubtype = updateData.documentSubtype;
        if (updateData.complianceTypes !== undefined) updateFields.complianceTypes = updateData.complianceTypes;
        if (updateData.certificationBodies !== undefined) updateFields.certificationBodies = updateData.certificationBodies;
        if (updateData.regulatoryRegions !== undefined) updateFields.regulatoryRegions = updateData.regulatoryRegions;
        if (updateData.keywords !== undefined) updateFields.keywords = updateData.keywords;
        if (updateData.casNumbers !== undefined) updateFields.casNumbers = updateData.casNumbers;
        if (updateData.inciNames !== undefined) updateFields.inciNames = updateData.inciNames;
        if (updateData.allergens !== undefined) updateFields.allergens = updateData.allergens;
        if (updateData.qualityScore !== undefined) updateFields.qualityScore = updateData.qualityScore;
        if (updateData.validationStatus !== undefined) updateFields.validationStatus = updateData.validationStatus;
        if (updateData.language !== undefined) updateFields.language = updateData.language;

        await db
          .update(documents)
          .set(updateFields)
          .where(eq(documents.id, documentId));

        result = {
          action: 'update_metadata',
          success: true,
          message: 'Document metadata updated successfully',
          updatedMetadata,
          updatedFields: Object.keys(updateFields).filter(key => key !== 'updatedAt')
        };
        break;

      case 'delete':
        // Check permissions for deletion
        if (user.role !== 'super_admin' && user.role !== 'admin' && existingDocument.uploadedBy !== user.id) {
          return NextResponse.json(
            createErrorResponse('Insufficient permissions to delete document', 'FORBIDDEN'),
            { status: 403 }
          );
        }

        // Delete document and its chunks (cascade delete)
        await db
          .delete(documents)
          .where(eq(documents.id, documentId));

        result = {
          action: 'delete',
          success: true,
          message: 'Document deleted successfully'
        };
        break;

      default:
        return NextResponse.json(
          createErrorResponse('Invalid action', 'VALIDATION_ERROR'),
          { status: 400 }
        );
    }

    // Log document update
    console.log(
      `Document updated - ID: ${documentId}, Action: ${updateData.action}, ` +
      `User: ${user.id}, Success: ${result.success}`
    );

    return NextResponse.json(
      createSuccessResponse(result),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error updating document:', error);
    return NextResponse.json(
      createErrorResponse('Internal server error', 'INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/knowledge-base/documents/[id]
 *
 * Delete a specific document
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Authenticate user
    const user = await AuthTokenService.verifyRequest(request);
    if (!user) {
      return NextResponse.json(
        createErrorResponse('Authentication required', 'UNAUTHORIZED'),
        { status: 401 }
      );
    }

    const documentId = params.id;
    if (!documentId) {
      return NextResponse.json(
        createErrorResponse('Document ID is required', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    // Check if document exists and user permissions
    const [existingDocument] = await db
      .select({
        id: documents.id,
        uploadedBy: documents.uploadedBy,
        filename: documents.filename
      })
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!existingDocument) {
      return NextResponse.json(
        createErrorResponse('Document not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    // Check permissions for deletion
    if (user.role !== 'super_admin' && user.role !== 'admin' && existingDocument.uploadedBy !== user.id) {
      return NextResponse.json(
        createErrorResponse('Insufficient permissions to delete this document', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    // Get chunk count before deletion for logging
    const [chunkInfo] = await db
      .select({ count: count() })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, documentId));

    // Delete document (cascade delete will handle chunks)
    await db
      .delete(documents)
      .where(eq(documents.id, documentId));

    // Log document deletion
    console.log(
      `Document deleted - ID: ${documentId}, Filename: ${existingDocument.filename}, ` +
      `Chunks: ${chunkInfo.count}, User: ${user.id}`
    );

    return NextResponse.json(
      createSuccessResponse({
        message: 'Document deleted successfully',
        documentId,
        filename: existingDocument.filename,
        chunksDeleted: chunkInfo.count
      }),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error deleting document:', error);
    return NextResponse.json(
      createErrorResponse('Internal server error', 'INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * Handle unsupported HTTP methods
 */
export async function POST() {
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