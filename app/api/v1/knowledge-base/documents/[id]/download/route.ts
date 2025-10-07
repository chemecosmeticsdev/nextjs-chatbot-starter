import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService } from '@/lib/auth';
import { createErrorResponse } from '@/lib/api-utils';
import { db } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/v1/knowledge-base/documents/[id]/download
 *
 * Download a specific document file
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
      .select({
        id: documents.id,
        filename: documents.filename,
        mimeType: documents.mimeType,
        fileSize: documents.fileSize,
        content: documents.content,
        extractedText: documents.extractedText,
        uploadedBy: documents.uploadedBy,
        processingStatus: documents.processingStatus
      })
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!document) {
      return NextResponse.json(
        createErrorResponse('Document not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    // Check permissions - users can download documents they uploaded, admins can download any
    if (user.role !== 'super_admin' && user.role !== 'admin' && document.uploadedBy !== user.id) {
      return NextResponse.json(
        createErrorResponse('Insufficient permissions to download this document', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    // Check if document processing is complete
    if (document.processingStatus !== 'completed' && !document.content && !document.extractedText) {
      return NextResponse.json(
        createErrorResponse('Document is still processing and not available for download', 'PROCESSING_ERROR'),
        { status:409 }
      );
    }

    // Determine what content to serve
    let contentToServe: string;
    let finalMimeType = document.mimeType;
    let finalFilename = document.filename;

    if (document.content) {
      // Serve original content if available
      contentToServe = document.content;
    } else if (document.extractedText) {
      // Fallback to extracted text as plain text
      contentToServe = document.extractedText;
      finalMimeType = 'text/plain';
      // Change extension to .txt if we're serving extracted text
      const nameWithoutExt = document.filename.replace(/\.[^/.]+$/, '');
      finalFilename = `${nameWithoutExt}_extracted.txt`;
    } else {
      return NextResponse.json(
        createErrorResponse('Document content is not available', 'CONTENT_NOT_AVAILABLE'),
        { status: 404 }
      );
    }

    // Convert content to Buffer
    let buffer: Buffer;
    try {
      if (finalMimeType.startsWith('text/') || finalMimeType === 'application/json') {
        buffer = Buffer.from(contentToServe, 'utf8');
      } else {
        // For binary content, assume it's base64 encoded
        buffer = Buffer.from(contentToServe, 'base64');
      }
    } catch (error) {
      console.error('Error converting content to buffer:', error);
      return NextResponse.json(
        createErrorResponse('Error processing document content', 'PROCESSING_ERROR'),
        { status: 500 }
      );
    }

    // Set appropriate headers for file download
    const headers = new Headers();
    headers.set('Content-Type', finalMimeType);
    headers.set('Content-Disposition', `attachment; filename="${finalFilename}"`);
    headers.set('Content-Length', buffer.length.toString());

    // Add cache control headers
    headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');

    // Log download activity
    console.log(
      `Document downloaded - ID: ${documentId}, Filename: ${finalFilename}, ` +
      `Size: ${buffer.length}, User: ${user.id}, Type: ${finalMimeType}`
    );

    return new NextResponse(buffer, {
      status: 200,
      headers
    });

  } catch (error) {
    console.error('Error downloading document:', error);
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