import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { v4 as uuidv4 } from 'uuid';
import { startStepFunctionExecution } from '@/lib/step-functions/service';
import {
  generateFileHash,
  checkForDuplicates,
  processDuplicateResult
} from '@/lib/utils/document-deduplication';

// Initialize AWS S3
const s3 = new S3Client({
  region: process.env.DEFAULT_REGION || 'ap-southeast-1',
  credentials: {
    accessKeyId: process.env.BAWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY!,
  },
});

// Supported file types for document processing
const SUPPORTED_MIME_TYPES = {
  'application/pdf': { extension: 'pdf', category: 'document' },
  'application/msword': { extension: 'doc', category: 'document' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { extension: 'docx', category: 'document' },
  'text/plain': { extension: 'txt', category: 'text' },
  'text/markdown': { extension: 'md', category: 'text' },
  'application/rtf': { extension: 'rtf', category: 'document' },
  'image/jpeg': { extension: 'jpg', category: 'image' },
  'image/png': { extension: 'png', category: 'image' },
  'image/tiff': { extension: 'tiff', category: 'image' }
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const BUCKET_NAME = process.env.STEPFUNCTIONS_S3_BUCKET || 'stepfunctions-document-processing';

interface UploadRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedBy?: string;
  documentType?: string;
  documentCategory?: string;
  metadata?: Record<string, any>;
  autoStart?: boolean; // Whether to automatically start Step Functions execution
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    // Extract other form fields
    const uploadedBy = formData.get('uploadedBy') as string || null;
    const documentType = formData.get('documentType') as string || 'inci';
    const documentCategory = formData.get('documentCategory') as string || 'other';
    const autoStart = formData.get('autoStart') === 'true';
    const metadataStr = formData.get('metadata') as string;

    let metadata = {};
    if (metadataStr) {
      try {
        metadata = JSON.parse(metadataStr);
      } catch (e) {
        console.warn('Invalid metadata JSON:', e);
      }
    }

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // Convert file to buffer and generate hash for deduplication
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileHash = generateFileHash(buffer);

    console.log(`[Step Functions Upload] 🔍 Generated file hash for ${file.name}: ${fileHash.substring(0, 12)}...`);

    // Check for duplicates before S3 upload
    const duplicateCheck = await checkForDuplicates(fileHash, file.name, file.size);

    console.log(`[Step Functions Upload] 🔍 Duplicate check result for ${file.name}:`, {
      isDuplicate: duplicateCheck.isDuplicate,
      similarityLevel: duplicateCheck.similarityLevel,
      action: duplicateCheck.action
    });

    // Handle duplicate files - return existing document info instead of processing
    if (duplicateCheck.isDuplicate && duplicateCheck.action === 'reject') {
      console.log(`[Step Functions Upload] 🚫 Duplicate file rejected: ${file.name}`);
      return NextResponse.json({
        success: true,
        isDuplicate: true,
        existingDocument: duplicateCheck.existingDocument,
        message: 'File already exists and has been processed',
        file: {
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          status: 'duplicate'
        }
      });
    }

    // Generate unique file key
    const fileId = uuidv4();
    const fileExtension = SUPPORTED_MIME_TYPES[file.type as keyof typeof SUPPORTED_MIME_TYPES]?.extension || 'bin';
    const sanitizedFileName = sanitizeFileName(file.name);
    const fileKey = `uploads/${new Date().getFullYear()}/${new Date().getMonth() + 1}/${fileId}-${sanitizedFileName}`;

    console.log('Uploading file to S3:', {
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      fileKey,
      fileHash: fileHash.substring(0, 12)
    });

    // Upload to S3
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: fileKey,
      Body: buffer,
      ContentType: file.type,
      ContentLength: file.size,
      Metadata: {
        'original-filename': file.name,
        'uploaded-by': uploadedBy || 'anonymous',
        'upload-timestamp': new Date().toISOString(),
        'file-id': fileId,
        'file-hash': fileHash,
        'duplicate-check': JSON.stringify({
          isDuplicate: duplicateCheck.isDuplicate,
          similarityLevel: duplicateCheck.similarityLevel,
          action: duplicateCheck.action
        })
      },
      // Server-side encryption
      ServerSideEncryption: 'AES256'
    };

    const upload = new Upload({
      client: s3,
      params: uploadParams,
    });

    const uploadResult = await upload.done();

    console.log('File uploaded successfully:', {
      location: uploadResult.Location,
      etag: uploadResult.ETag,
      key: uploadResult.Key
    });

    // Prepare response data
    const uploadResponse = {
      success: true,
      isDuplicate: false,
      file: {
        id: fileId,
        fileName: file.name,
        fileKey: uploadResult.Key,
        fileSize: file.size,
        mimeType: file.type,
        s3Location: uploadResult.Location,
        uploadedAt: new Date().toISOString(),
        uploadedBy,
        documentType,
        documentCategory,
        metadata,
        fileHash: fileHash.substring(0, 12), // Include short hash for reference
        duplicateCheck: {
          isDuplicate: duplicateCheck.isDuplicate,
          similarityLevel: duplicateCheck.similarityLevel,
          action: duplicateCheck.action
        }
      }
    };

    // Automatically start Step Functions execution if requested
    if (autoStart) {
      try {
        console.log('Auto-starting Step Functions execution with direct function call...');

        // Call the shared service function directly (eliminates SSL/fetch issues)
        const startResult = await startStepFunctionExecution({
          fileName: file.name,
          fileKey: uploadResult.Key!,
          fileSize: file.size,
          mimeType: file.type,
          fileHash: fileHash, // Pass the generated file hash
          uploadedBy,
          documentType,
          documentCategory,
          metadata
        });

        if (startResult.success) {
          uploadResponse.execution = startResult.execution;
          console.log('Step Functions execution started successfully:', {
            executionId: startResult.execution?.executionId,
            documentId: startResult.execution?.documentId
          });
        } else {
          console.error('Failed to auto-start execution:', startResult.error, startResult.details);
          uploadResponse.execution = {
            error: startResult.error || 'Failed to start processing automatically',
            details: startResult.details
          };
        }
      } catch (startError) {
        console.error('Auto-start execution error:', startError);
        uploadResponse.execution = {
          error: 'Failed to start processing automatically',
          details: startError instanceof Error ? startError.message : 'Unknown error'
        };
      }
    }

    return NextResponse.json(uploadResponse);

  } catch (error) {
    console.error('File upload error:', error);

    return NextResponse.json(
      {
        error: 'File upload failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET endpoint to generate presigned upload URL (alternative upload method)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get('fileName');
    const fileSize = parseInt(searchParams.get('fileSize') || '0');
    const mimeType = searchParams.get('mimeType');

    if (!fileName || !fileSize || !mimeType) {
      return NextResponse.json(
        { error: 'fileName, fileSize, and mimeType are required' },
        { status: 400 }
      );
    }

    // Validate file parameters
    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
        { status: 400 }
      );
    }

    if (!SUPPORTED_MIME_TYPES[mimeType as keyof typeof SUPPORTED_MIME_TYPES]) {
      return NextResponse.json(
        { error: `Unsupported file type: ${mimeType}` },
        { status: 400 }
      );
    }

    // Generate unique file key
    const fileId = uuidv4();
    const fileExtension = SUPPORTED_MIME_TYPES[mimeType as keyof typeof SUPPORTED_MIME_TYPES]?.extension || 'bin';
    const sanitizedFileName = sanitizeFileName(fileName);
    const fileKey = `uploads/${new Date().getFullYear()}/${new Date().getMonth() + 1}/${fileId}-${sanitizedFileName}`;

    // Generate presigned URL
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileKey,
      ContentType: mimeType,
      ContentLength: fileSize,
      Metadata: {
        'original-filename': fileName,
        'upload-timestamp': new Date().toISOString(),
        'file-id': fileId
      }
    });

    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

    return NextResponse.json({
      presignedUrl,
      fileKey,
      fileId,
      expiresIn: 3600,
      uploadInstructions: {
        method: 'PUT',
        headers: {
          'Content-Type': mimeType,
          'Content-Length': fileSize.toString()
        }
      }
    });

  } catch (error) {
    console.error('Presigned URL generation error:', error);

    return NextResponse.json(
      {
        error: 'Failed to generate upload URL',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Validate uploaded file
function validateFile(file: File): { valid: boolean; error?: string } {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`
    };
  }

  if (file.size === 0) {
    return {
      valid: false,
      error: 'File is empty'
    };
  }

  // Check file type
  if (!SUPPORTED_MIME_TYPES[file.type as keyof typeof SUPPORTED_MIME_TYPES]) {
    return {
      valid: false,
      error: `Unsupported file type: ${file.type}. Supported types: ${Object.keys(SUPPORTED_MIME_TYPES).join(', ')}`
    };
  }

  // Check filename
  if (!file.name || file.name.length > 255) {
    return {
      valid: false,
      error: 'Invalid filename'
    };
  }

  return { valid: true };
}

// Sanitize filename for S3 storage
function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars with underscore
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .replace(/^_|_$/g, '') // Remove leading/trailing underscores
    .substring(0, 100); // Limit length
}

// DELETE endpoint to remove uploaded files
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileKey = searchParams.get('fileKey');

    if (!fileKey) {
      return NextResponse.json(
        { error: 'File key is required' },
        { status: 400 }
      );
    }

    // Delete from S3
    await s3.send(new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileKey
    }));

    return NextResponse.json({
      success: true,
      message: 'File deleted successfully',
      fileKey
    });

  } catch (error) {
    console.error('File deletion error:', error);

    return NextResponse.json(
      {
        error: 'Failed to delete file',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}