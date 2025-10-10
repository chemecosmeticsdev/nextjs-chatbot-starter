import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { jobQueue, JobType, JobPriority } from '@/lib/services/job-queue';
import {
  generateFileHash,
  checkForDuplicates,
  processDuplicateResult
} from '@/lib/utils/document-deduplication';

// File upload configuration
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'application/msword', // DOC
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
  'application/vnd.ms-excel', // XLS
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
  'application/vnd.ms-powerpoint', // PPT
  'text/plain', // TXT
  'text/markdown', // MD
  'application/rtf', // RTF
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/bmp',
  'image/tiff'
];

const UPLOAD_DIR = join(process.cwd(), 'uploads');

interface UploadSettings {
  extractText: boolean;
  generateSummary: boolean;
  enableSearch: boolean;
  processImages: boolean;
  autoTag: boolean;
  useLocalDocling: boolean;
  processingMethod: 'batch' | 'individual';
  priority: 'low' | 'normal' | 'high' | 'critical';
  supplierName?: string;
  ingredientName?: string;
}

interface UploadResult {
  success: boolean;
  data?: {
    totalFiles: number;
    processedFiles: number;
    queuedJobs: Array<{
      documentId: string;
      jobId: string;
      filename: string;
      status: 'queued' | 'error' | 'duplicate';
      error?: string;
      existingDocumentId?: string;
      message?: string;
    }>;
    processingMethod: 'batch' | 'individual';
    errors: string[];
  };
  error?: string;
}

function createSuccessResponse(data: any): UploadResult {
  return { success: true, data };
}

function createErrorResponse(error: string): UploadResult {
  return { success: false, error };
}

// Ensure upload directory exists
async function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
}

// Validate file type and size
function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File "${file.name}" is too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
    };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `File "${file.name}" has unsupported type: ${file.type}`
    };
  }

  return { valid: true };
}

// Extract metadata from filename
function extractMetadataFromFilename(filename: string): {
  supplierName?: string;
  ingredientName?: string;
  documentType?: string;
} {
  // Try to extract supplier and ingredient from filename patterns
  const metadata: any = {};

  // Remove file extension
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

  // Common patterns: "Supplier_Ingredient_Document", "Supplier - Ingredient", etc.
  const patterns = [
    /^([^_-]+)[_-]+([^_-]+)/,  // "BASF_Menthol" or "BASF-Menthol"
    /([A-Z][a-z]+)\s+([A-Z][a-z]+)/,  // "BASF Menthol"
  ];

  for (const pattern of patterns) {
    const match = nameWithoutExt.match(pattern);
    if (match) {
      metadata.supplierName = match[1].trim();
      metadata.ingredientName = match[2].trim();
      break;
    }
  }

  // Try to detect document type from filename
  const lowerName = filename.toLowerCase();
  if (lowerName.includes('sds') || lowerName.includes('safety')) {
    metadata.documentType = 'sds';
  } else if (lowerName.includes('spec') || lowerName.includes('specification')) {
    metadata.documentType = 'specification';
  } else if (lowerName.includes('coa') || lowerName.includes('analysis')) {
    metadata.documentType = 'certificate_of_analysis';
  } else if (lowerName.includes('cert') || lowerName.includes('certificate')) {
    // Use comprehensive classification for certificates - returns valid enum values like 'other'
    metadata.documentType = 'other'; // Safe fallback that's always valid
  }

  return metadata;
}

// Validate UUID format and provide fallback
function validateAndGetUserId(userIdFromForm: string): string {
  // Default to existing super admin user
  const DEFAULT_USER_ID = '525baa17-e509-4f4f-a6e8-51fb8d570489';

  if (!userIdFromForm) {
    console.log('[Upload API] ⚠️ No userId provided, using default user');
    return DEFAULT_USER_ID;
  }

  // Check if it's a valid UUID format (basic validation)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (uuidRegex.test(userIdFromForm)) {
    return userIdFromForm;
  }

  console.log(`[Upload API] ⚠️ Invalid UUID format: ${userIdFromForm}, using default user`);
  return DEFAULT_USER_ID;
}

// Save uploaded file and create document record
async function processUploadedFile(
  file: File,
  settings: UploadSettings,
  userId: string
): Promise<{ documentId: string; filePath: string; error?: string; isDuplicate?: boolean; existingDocumentId?: string }> {
  try {
    // Convert file to buffer and generate hash for deduplication
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const fileHash = generateFileHash(buffer);

    console.log(`[Upload API] 🔍 Generated file hash for ${file.name}: ${fileHash.substring(0, 12)}...`);

    // Check for duplicates before processing
    const duplicateCheck = await checkForDuplicates(fileHash, file.name, file.size);

    console.log(`[Upload API] 🔍 Duplicate check result for ${file.name}:`, {
      isDuplicate: duplicateCheck.isDuplicate,
      similarityLevel: duplicateCheck.similarityLevel,
      action: duplicateCheck.action
    });

    // Generate unique filename for storage
    const fileExtension = file.name.split('.').pop() || '';
    const uniqueFilename = `${uuidv4()}.${fileExtension}`;
    const filePath = join(UPLOAD_DIR, uniqueFilename);

    // Extract metadata from filename
    const extractedMetadata = extractMetadataFromFilename(file.name);

    // Create document record in database (even for duplicates, for tracking)
    const [document] = await db.insert(documents).values({
      originalFilename: file.name,
      filename: file.name,
      filePath: filePath,
      fileSizeBytes: file.size.toString(),
      fileSize: file.size,
      mimeType: file.type,
      uploadedBy: userId,
      documentType: 'inci', // Default type, will be enhanced by AI
      processingStatus: duplicateCheck.isDuplicate ? 'pending' : 'pending',
      fileHash: fileHash, // Store the file hash for future deduplication

      // Metadata from settings or filename extraction
      supplierName: settings.supplierName || extractedMetadata.supplierName,
      ingredientName: settings.ingredientName || extractedMetadata.ingredientName,
      ragDocumentType: extractedMetadata.documentType as any,

      // Upload-specific metadata
      metadata: {
        uploadSettings: settings,
        extractedFromFilename: extractedMetadata,
        uploadMethod: 'direct_upload',
        processingMethod: settings.processingMethod,
        fileHash: fileHash.substring(0, 12), // Store short hash for reference
        duplicateCheckResult: duplicateCheck
      }
    }).returning();

    // Process duplicate result
    const duplicateResult = await processDuplicateResult(duplicateCheck, document.id);

    if (duplicateResult.shouldProceed) {
      // Save file to disk only if we're proceeding with processing
      await writeFile(filePath, buffer);
      console.log(`[Upload API] ✅ File saved and ready for processing: ${file.name}`);
    } else {
      console.log(`[Upload API] 🚫 ${duplicateResult.message}`);
      return {
        documentId: document.id,
        filePath: filePath,
        isDuplicate: true,
        existingDocumentId: duplicateResult.existingDocumentId
      };
    }

    return {
      documentId: document.id,
      filePath: filePath,
      isDuplicate: false
    };

  } catch (error) {
    console.error('Error processing uploaded file:', error);
    return {
      documentId: '',
      filePath: '',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Create processing job for document
async function createProcessingJob(
  documentId: string,
  filePath: string,
  settings: UploadSettings,
  userId: string
): Promise<{ jobId: string; error?: string }> {
  try {
    // Map string priority to JobPriority enum
    const jobPriority = settings.priority === 'critical' ? JobPriority.CRITICAL :
                       settings.priority === 'high' ? JobPriority.HIGH :
                       settings.priority === 'normal' ? JobPriority.NORMAL : JobPriority.LOW;

    // Create complete document processing job
    const jobId = await jobQueue.addJob({
      type: JobType.COMPLETE_DOCUMENT_PIPELINE,
      priority: jobPriority,
      payload: {
        documentId,
        filePath,
        userId,
        settings: {
          extractText: settings.extractText,
          generateSummary: settings.generateSummary,
          enableSearch: settings.enableSearch,
          processImages: settings.processImages,
          autoTag: settings.autoTag,
          useLocalDocling: settings.useLocalDocling
        }
      },
      metadata: {
        userId,
        maxRetries: 3,
        timeout: 1800 // 30 minutes for complete pipeline
      }
    });

    return { jobId };

  } catch (error) {
    console.error('Error creating processing job:', error);
    return {
      jobId: '',
      error: error instanceof Error ? error.message : 'Failed to create processing job'
    };
  }
}

export async function POST(request: NextRequest) {
  console.log('='.repeat(60));
  console.log('[Upload API] 🚀 FILE UPLOAD REQUEST RECEIVED');
  console.log('='.repeat(60));

  try {
    // Ensure upload directory exists
    await ensureUploadDir();

    // Get form data
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const settingsJson = formData.get('settings') as string;
    const userIdFromForm = formData.get('userId') as string;

    // Validate and ensure we have a proper UUID for userId
    const userId = validateAndGetUserId(userIdFromForm);

    console.log(`[Upload API] 📁 Processing ${files.length} files`);
    console.log(`[Upload API] 👤 User ID: ${userId}`);

    if (!files || files.length === 0) {
      return NextResponse.json(
        createErrorResponse('No files provided'),
        { status: 400 }
      );
    }

    // Parse settings
    let settings: UploadSettings;
    try {
      settings = settingsJson ? JSON.parse(settingsJson) : {
        extractText: true,
        generateSummary: false,
        enableSearch: true,
        processImages: true,
        autoTag: true,
        useLocalDocling: true,
        processingMethod: 'batch',
        priority: 'normal'
      };
    } catch (error) {
      console.error('[Upload API] ❌ Invalid settings JSON:', error);
      return NextResponse.json(
        createErrorResponse('Invalid settings format'),
        { status: 400 }
      );
    }

    console.log(`[Upload API] ⚙️ Processing settings:`, settings);

    // Validate all files first
    const validationErrors: string[] = [];
    for (const file of files) {
      const validation = validateFile(file);
      if (!validation.valid && validation.error) {
        validationErrors.push(validation.error);
      }
    }

    if (validationErrors.length > 0) {
      console.log(`[Upload API] ❌ File validation errors:`, validationErrors);
      return NextResponse.json(
        createErrorResponse(`File validation failed: ${validationErrors.join(', ')}`),
        { status: 400 }
      );
    }

    // Process files and create jobs
    const processedFiles: Array<{
      documentId: string;
      jobId: string;
      filename: string;
      status: 'queued' | 'error';
      error?: string;
    }> = [];

    const errors: string[] = [];
    let successCount = 0;

    for (const file of files) {
      console.log(`[Upload API] 📄 Processing file: ${file.name} (${file.size} bytes)`);

      // Save file and create document record
      const uploadResult = await processUploadedFile(file, settings, userId);

      if (uploadResult.error) {
        console.error(`[Upload API] ❌ Failed to process ${file.name}:`, uploadResult.error);
        errors.push(`${file.name}: ${uploadResult.error}`);
        processedFiles.push({
          documentId: '',
          jobId: '',
          filename: file.name,
          status: 'error',
          error: uploadResult.error
        });
        continue;
      }

      // Handle duplicate files - skip job creation but report success
      if (uploadResult.isDuplicate) {
        console.log(`[Upload API] 🔄 Duplicate detected for ${file.name}, referencing existing document`);
        processedFiles.push({
          documentId: uploadResult.documentId,
          jobId: 'duplicate',
          filename: file.name,
          status: 'duplicate',
          existingDocumentId: uploadResult.existingDocumentId,
          message: 'File already exists and has been processed'
        });
        successCount++;
        continue;
      }

      // Create processing job for non-duplicate files
      const jobResult = await createProcessingJob(
        uploadResult.documentId,
        uploadResult.filePath,
        settings,
        userId
      );

      if (jobResult.error) {
        console.error(`[Upload API] ❌ Failed to create job for ${file.name}:`, jobResult.error);
        errors.push(`${file.name}: ${jobResult.error}`);
        processedFiles.push({
          documentId: uploadResult.documentId,
          jobId: '',
          filename: file.name,
          status: 'error',
          error: jobResult.error
        });
        continue;
      }

      console.log(`[Upload API] ✅ Successfully queued ${file.name} with job ID: ${jobResult.jobId}`);
      processedFiles.push({
        documentId: uploadResult.documentId,
        jobId: jobResult.jobId,
        filename: file.name,
        status: 'queued'
      });
      successCount++;
    }

    console.log(`[Upload API] 📊 Processing complete:`);
    console.log(`[Upload API] - Total files: ${files.length}`);
    console.log(`[Upload API] - Successfully queued: ${successCount}`);
    console.log(`[Upload API] - Errors: ${errors.length}`);

    const result = createSuccessResponse({
      totalFiles: files.length,
      processedFiles: successCount,
      queuedJobs: processedFiles,
      processingMethod: settings.processingMethod,
      errors
    });

    console.log('='.repeat(60));
    console.log('[Upload API] ✅ FILE UPLOAD REQUEST COMPLETE');
    console.log('='.repeat(60));

    return NextResponse.json(result, { status: 200 });

  } catch (error) {
    console.error('[Upload API] 💥 Fatal error in file upload:', error);

    const errorMessage = error instanceof Error
      ? error.message
      : 'Internal server error during file upload';

    return NextResponse.json(
      createErrorResponse(errorMessage),
      { status: 500 }
    );
  }
}