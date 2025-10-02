import { NextRequest, NextResponse } from 'next/server';
import { ChatbotService } from '@/lib/db/chatbot-service';
import { AuthTokenService } from '@/lib/auth';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-utils';
import {
  uploadContextSchema,
  type UploadContextRequest
} from '@/lib/validation/prompt';
import { formatValidationErrors } from '@/lib/validation/common';

/**
 * POST /api/v1/chatbots/[id]/prompt/upload
 *
 * Upload files for prompt generation context
 */
export async function POST(
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

    // Validate chatbot ID
    const chatbotId = params.id;
    if (!chatbotId || typeof chatbotId !== 'string') {
      return NextResponse.json(
        createErrorResponse('Invalid chatbot ID', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    // Check if user can access this chatbot
    const canAccess = await ChatbotService.canUserAccessChatbot(
      chatbotId,
      user.id,
      user.role
    );

    if (!canAccess) {
      return NextResponse.json(
        createErrorResponse('Access denied to this chatbot', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    // Check if chatbot exists
    const existingChatbot = await ChatbotService.getChatbotById(chatbotId);
    if (!existingChatbot) {
      return NextResponse.json(
        createErrorResponse('Chatbot not found', 'NOT_FOUND'),
        { status: 404 }
      );
    }

    // Parse and validate request body
    let body: UploadContextRequest;
    try {
      const rawBody = await request.json();
      body = uploadContextSchema.parse(rawBody);
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

    // Process uploaded files
    const processedFiles = await processUploadedFiles(body.files, body.purpose);

    if (processedFiles.length === 0) {
      return NextResponse.json(
        createErrorResponse('No valid files could be processed', 'PROCESSING_FAILED'),
        { status: 400 }
      );
    }

    // Store file context for prompt generation
    const contextId = await storePromptContext(chatbotId, user.id, processedFiles, body.purpose);

    // Log the file upload for audit
    console.log(
      `Files uploaded for prompt context - Chatbot: ${chatbotId}, User: ${user.id}, ` +
      `Files: ${processedFiles.length}, Purpose: ${body.purpose}, Context ID: ${contextId}`
    );

    return NextResponse.json(
      createSuccessResponse({
        contextId,
        message: 'Files uploaded and processed successfully',
        filesProcessed: processedFiles.length,
        extractedContent: processedFiles.map(f => ({
          filename: f.filename,
          type: f.type,
          size: f.size,
          contentPreview: f.extractedText.substring(0, 200) + '...',
          keywords: f.keywords?.slice(0, 10) || []
        })),
        purpose: body.purpose,
        uploadedAt: new Date()
      }),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error uploading files for prompt context:', error);
    return NextResponse.json(
      createErrorResponse('Internal server error', 'INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/chatbots/[id]/prompt/upload
 *
 * Get uploaded context files for a chatbot
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

    // Validate chatbot ID
    const chatbotId = params.id;
    if (!chatbotId || typeof chatbotId !== 'string') {
      return NextResponse.json(
        createErrorResponse('Invalid chatbot ID', 'VALIDATION_ERROR'),
        { status: 400 }
      );
    }

    // Check if user can access this chatbot
    const canAccess = await ChatbotService.canUserAccessChatbot(
      chatbotId,
      user.id,
      user.role
    );

    if (!canAccess) {
      return NextResponse.json(
        createErrorResponse('Access denied to this chatbot', 'FORBIDDEN'),
        { status: 403 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const purpose = searchParams.get('purpose') as any;

    // Get uploaded context files
    const contextFiles = await getPromptContextFiles(chatbotId, {
      page,
      limit,
      purpose
    });

    return NextResponse.json(
      createSuccessResponse({
        files: contextFiles.files,
        pagination: contextFiles.pagination
      }),
      { status: 200 }
    );

  } catch (error) {
    console.error('Error getting uploaded context files:', error);
    return NextResponse.json(
      createErrorResponse('Internal server error', 'INTERNAL_ERROR'),
      { status: 500 }
    );
  }
}

/**
 * Process uploaded files and extract text content
 */
async function processUploadedFiles(
  files: Array<{ name: string; type: string; size: number; content: string }>,
  purpose: string
): Promise<Array<{
  filename: string;
  type: string;
  size: number;
  extractedText: string;
  keywords?: string[];
}>> {
  const processedFiles: Array<{
    filename: string;
    type: string;
    size: number;
    extractedText: string;
    keywords?: string[];
  }> = [];

  for (const file of files) {
    try {
      let extractedText = '';

      // Process based on file type
      if (file.type.includes('text/') || file.type.includes('application/json')) {
        // For text files, use content directly
        extractedText = file.content;
      } else if (file.type.includes('application/pdf')) {
        // For PDF files, attempt to extract text
        extractedText = await extractTextFromPDF(file.content);
      } else if (file.type.includes('application/msword') || file.type.includes('application/vnd.openxmlformats')) {
        // For Word documents, attempt to extract text
        extractedText = await extractTextFromWord(file.content);
      } else {
        // For other files, try to parse as text
        try {
          extractedText = atob(file.content); // Assume base64 encoded text
        } catch {
          console.warn(`Could not process file type: ${file.type}`);
          continue;
        }
      }

      // Validate extracted text
      if (!extractedText || extractedText.trim().length < 10) {
        console.warn(`File ${file.name} has insufficient content`);
        continue;
      }

      // Extract keywords from content
      const keywords = extractKeywords(extractedText, purpose);

      processedFiles.push({
        filename: file.name,
        type: file.type,
        size: file.size,
        extractedText: extractedText.trim(),
        keywords
      });

    } catch (error) {
      console.error(`Error processing file ${file.name}:`, error);
      // Continue with other files
    }
  }

  return processedFiles;
}

/**
 * Extract text from PDF content (simplified implementation)
 */
async function extractTextFromPDF(base64Content: string): Promise<string> {
  // In a real implementation, you would use a PDF parsing library
  // For now, return a placeholder
  return 'PDF content extraction not implemented - please convert to text format';
}

/**
 * Extract text from Word document (simplified implementation)
 */
async function extractTextFromWord(base64Content: string): Promise<string> {
  // In a real implementation, you would use a Word document parsing library
  // For now, return a placeholder
  return 'Word document content extraction not implemented - please convert to text format';
}

/**
 * Extract keywords from text content
 */
function extractKeywords(text: string, purpose: string): string[] {
  // Simple keyword extraction based on purpose
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3)
    .filter(word => !['this', 'that', 'with', 'have', 'will', 'your', 'from', 'they', 'been', 'were', 'said', 'each', 'which', 'their', 'time', 'would', 'there', 'could', 'other'].includes(word));

  // Get word frequency
  const wordCount: Record<string, number> = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });

  // Sort by frequency and return top keywords
  return Object.entries(wordCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([word]) => word);
}

/**
 * Store prompt context in database (simplified implementation)
 */
async function storePromptContext(
  chatbotId: string,
  uploadedBy: string,
  files: Array<{
    filename: string;
    type: string;
    size: number;
    extractedText: string;
    keywords?: string[];
  }>,
  purpose: string
): Promise<string> {
  // In a real implementation, this would store in a dedicated table
  // For now, generate a context ID
  const contextId = `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // TODO: Store in prompt_context table when schema is fully implemented
  console.log(`Stored prompt context ${contextId} for chatbot ${chatbotId}`, {
    files: files.length,
    purpose,
    uploadedBy
  });

  return contextId;
}

/**
 * Get prompt context files (simplified implementation)
 */
async function getPromptContextFiles(
  chatbotId: string,
  options: { page?: number; limit?: number; purpose?: string }
): Promise<{
  files: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));

  // TODO: Query from prompt_context table when schema is fully implemented
  // For now, return empty results
  return {
    files: [],
    pagination: {
      page,
      limit,
      total: 0,
      totalPages: 0
    }
  };
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