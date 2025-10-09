import { jobQueue, JobType, JobPriority, type Job } from './job-queue';
// Dynamic import for mistralOCR to prevent build-time initialization
import { enhancedMetadataExtractor } from './metadata-extraction';

/**
 * Get MistralOCR service with dynamic import to prevent build-time initialization
 */
async function getMistralOCRService() {
  try {
    const { getMistralOCRSafe } = await import('./mistral-ocr');
    const service = getMistralOCRSafe();
    if (!service) {
      throw new Error('MistralOCR service not available (missing API key or build context)');
    }
    return service;
  } catch (error) {
    console.error('[EnhancedDocumentProcessor] Failed to load MistralOCR service:', error);
    throw new Error('MistralOCR service unavailable');
  }
}
import { DocumentChunker } from './document-chunker';
import { vectorStorage } from './vector-storage';
import { titanEmbedder } from '../embeddings/titan-embedder';
import { db, optimizedQuery, getConnectionHealth } from '@/lib/db';
import { documents, documentChunks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Enhanced Document Processing Job Types
 *
 * Defines the complete document processing pipeline using all our new services
 */
export enum EnhancedJobType {
  // Document Processing Pipeline
  DOCUMENT_DOWNLOAD = 'document_download',
  TEXT_EXTRACTION = 'text_extraction',
  METADATA_ENHANCEMENT = 'metadata_enhancement',
  DOCUMENT_CHUNKING = 'document_chunking',
  EMBEDDING_GENERATION = 'embedding_generation',
  VECTOR_STORAGE = 'vector_storage',

  // Complete Pipeline (orchestrator)
  COMPLETE_DOCUMENT_PIPELINE = 'complete_document_pipeline',

  // Google Drive Integration
  GDRIVE_FOLDER_PROCESSING = 'gdrive_folder_processing',
  GDRIVE_FILE_PROCESSING = 'gdrive_file_processing',

  // Maintenance & Health
  DOCUMENT_REPROCESSING = 'document_reprocessing',
  VECTOR_REINDEXING = 'vector_reindexing',
  QUALITY_ASSURANCE = 'quality_assurance'
}

/**
 * Document Processing Job Payloads
 */
export interface DocumentDownloadPayload {
  documentId: string;
  googleDriveFileId?: string;
  fileUrl?: string;
  userId: string;
}

export interface TextExtractionPayload {
  documentId: string;
  filePath: string;
  mimeType: string;
  originalFilename: string;
}

export interface MetadataEnhancementPayload {
  documentId: string;
  extractedText: string;
  folderPath?: string;
  filename: string;
}

export interface DocumentChunkingPayload {
  documentId: string;
  extractedText: string;
  documentType: string;
  tokenCount: number;
}

export interface EmbeddingGenerationPayload {
  documentId: string;
  chunks: Array<{
    index: number;
    content: string;
    type: string;
    section?: string;
  }>;
}

export interface VectorStoragePayload {
  documentId: string;
  chunksWithEmbeddings: Array<{
    index: number;
    content: string;
    embedding: number[];
    type: string;
    section?: string;
    tokenCount: number;
    confidence: number;
    qualityScore: number;
    chunkingStrategy: string;
    startChar: number;
    endChar: number;
  }>;
}

export interface CompleteDocumentPipelinePayload {
  documentId: string;
  googleDriveFileId?: string;
  fileUrl?: string;
  filePath?: string; // For uploaded files
  userId: string;
  skipSteps?: string[]; // Allow skipping certain steps
  forceReprocess?: boolean;
  settings?: {
    extractText?: boolean;
    generateSummary?: boolean;
    enableSearch?: boolean;
    processImages?: boolean;
    autoTag?: boolean;
    useLocalDocling?: boolean;
  };
}

/**
 * Enhanced Document Processor
 *
 * Implements the complete document processing pipeline using all our services
 */
export class EnhancedDocumentProcessor {

  /**
   * Helper method to validate file paths
   */
  private async correctLegacyFilePath(filePath: string, documentId: string): Promise<string> {
    // Return path as-is for local file uploads
    return filePath;
  }

  /**
   * Process document download from URL
   */
  async processDocumentDownload(job: Job): Promise<void> {
    const payload = job.payload as DocumentDownloadPayload;
    const { documentId, googleDriveFileId, fileUrl, userId } = payload;

    try {
      // CRITICAL: Validate required parameters to prevent undefined userId failures
      const missingParams: string[] = [];

      if (!documentId || documentId.trim().length === 0) {
        missingParams.push('documentId (empty or null)');
      }

      // Handle legacy jobs with missing userId - attempt recovery
      let effectiveUserId = userId;
      if (!userId || userId.trim().length === 0) {
        console.warn(`[DocumentDownload] Missing userId for document ${documentId}. Attempting recovery...`);

        try {
          // Attempt to recover userId from document record
          const doc = await optimizedQuery(
            () => db.select().from(documents).where(eq(documents.id, documentId)).limit(1),
            `recover-userId-for-document-${documentId}`
          );
          if (doc.length > 0 && doc[0].uploadedBy) {
            effectiveUserId = doc[0].uploadedBy;
            console.log(`[DocumentDownload] Recovered userId: ${effectiveUserId} for document ${documentId}`);
          } else {
            // No recoverable userId - this is a permanent failure
            const errorMessage = `Cannot process document download - missing userId and unable to recover from database for document ${documentId}`;
            console.error(`[DocumentDownload] ${errorMessage}`);

            // Mark job as permanently failed (don't retry)
            await jobQueue.updateJobProgress(job.id, 0, 'failed', errorMessage);

            // Update document status
            await db
              .update(documents)
              .set({
                processingStatus: 'failed',
                processingError: errorMessage,
                updatedAt: new Date(),
              })
              .where(eq(documents.id, documentId));

            throw new Error(`PERMANENT_FAILURE: ${errorMessage}`);
          }
        } catch (recoveryError) {
          const errorMessage = `Failed to recover userId for document ${documentId}: ${recoveryError instanceof Error ? recoveryError.message : 'Unknown error'}`;
          console.error(`[DocumentDownload] ${errorMessage}`);

          // Mark as permanent failure
          await jobQueue.updateJobProgress(job.id, 0, 'failed', errorMessage);
          throw new Error(`PERMANENT_FAILURE: ${errorMessage}`);
        }
      }

      // Validate Google Drive file ID or file URL is provided
      if (!googleDriveFileId && !fileUrl) {
        missingParams.push('googleDriveFileId or fileUrl (both missing)');
      }

      if (missingParams.length > 0) {
        const errorMessage = `Cannot process document download - missing required parameters: ${missingParams.join(', ')}`;
        console.error(`[DocumentDownload] ${errorMessage} for job ${job.id}`);

        // Mark as permanent failure (don't retry)
        await jobQueue.updateJobProgress(job.id, 0, 'failed', errorMessage);
        throw new Error(`PERMANENT_FAILURE: ${errorMessage}`);
      }

      console.log(`[DocumentDownload] Processing document ${documentId} with userId: ${effectiveUserId}`);
      await jobQueue.updateJobProgress(job.id, 5, 'processing', 'Starting document download validation');

      console.log(`[DocumentDownload] Processing download for document ${documentId}:`, {
        googleDriveFileId,
        fileUrl: fileUrl ? fileUrl.substring(0, 100) + '...' : undefined,
        userId: effectiveUserId
      });

      // Get document record
      const documentResult = await db
        .select()
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);

      if (documentResult.length === 0) {
        throw new Error(`Document ${documentId} not found in database`);
      }

      const document = documentResult[0];
      console.log(`[DocumentDownload] Found document: ${document.originalFilename} (${document.mimeType})`);

      await jobQueue.updateJobProgress(job.id, 15, 'processing', `Downloading document: ${document.originalFilename}`);

      let filePath: string;
      let fileSize: number;
      const maxRetries = 3;
      const retryDelay = 2000; // 2 seconds

      if (fileUrl) {
        console.log(`[DocumentDownload] Downloading from URL: ${fileUrl.substring(0, 100)}...`);

        // Download from URL with retry logic
        let downloadSuccess = false;
        let lastError = null;

        for (let retry = 0; retry < maxRetries; retry++) {
          try {
            if (retry > 0) {
              console.log(`[DocumentDownload] Retry ${retry}/${maxRetries} for URL download`);
              await new Promise(resolve => setTimeout(resolve, retryDelay * retry));
            }

            await jobQueue.updateJobProgress(job.id, 20 + (retry * 10), 'processing',
              retry === 0 ? 'Downloading from URL' : `Retrying URL download (attempt ${retry + 1})`);

            const response = await fetch(fileUrl, {
              method: 'GET',
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; DocumentProcessor/1.0)'
              },
              timeout: 30000 // 30 second timeout
            });

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentLength = response.headers.get('content-length');
            if (contentLength && parseInt(contentLength) > 100 * 1024 * 1024) { // 100MB limit
              throw new Error(`File too large: ${contentLength} bytes (max 100MB)`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            if (buffer.length === 0) {
              throw new Error('Downloaded file is empty');
            }

            // Create local file path (consistent with Google Drive downloads)
            const fs = await import('fs/promises');
            const path = await import('path');

            const fileName = document.originalFilename || 'downloaded_file';
            const downloadDir = path.join(process.cwd(), 'temp', 'downloads', documentId);
            filePath = path.join(downloadDir, fileName);

            // Ensure directory exists
            await fs.mkdir(downloadDir, { recursive: true });

            // Write file
            await fs.writeFile(filePath, buffer);
            fileSize = buffer.length;

            // Verify the written file
            const stats = await fs.stat(filePath);
            if (stats.size !== fileSize) {
              throw new Error(`File write verification failed. Expected: ${fileSize}, Written: ${stats.size}`);
            }

            console.log(`[DocumentDownload] URL download successful on attempt ${retry + 1}: ${filePath} (${fileSize} bytes)`);
            downloadSuccess = true;
            break; // Success, exit retry loop

          } catch (error) {
            lastError = error;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[DocumentDownload] URL download attempt ${retry + 1}/${maxRetries} failed:`, errorMessage);

            if (retry === maxRetries - 1) {
              // This was the last retry, will throw after loop
              break;
            }
          }
        }

        if (!downloadSuccess) {
          const errorMessage = lastError instanceof Error ? lastError.message : 'Unknown error after all retries';
          throw new Error(`URL download failed after ${maxRetries} attempts: ${errorMessage}`);
        }
      }

      await jobQueue.updateJobProgress(job.id, 70, 'processing', 'Updating document record with download information');

      console.log(`[DocumentDownload] Updating database with download info:`, {
        documentId,
        filePath,
        fileSize
      });

      // Update document with download information
      await db
        .update(documents)
        .set({
          filePath,
          fileSize,
          processingStatus: 'processing',
          downloadedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      await jobQueue.updateJobProgress(job.id, 85, 'processing', 'Queueing text extraction');

      // Queue next step: text extraction
      await this.queueTextExtraction(documentId);

      await jobQueue.updateJobProgress(job.id, 100, 'completed', `Document download completed: ${filePath} (${fileSize} bytes)`);

      console.log(`[DocumentDownload] Successfully completed download for document ${documentId}: ${filePath} (${fileSize} bytes)`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during document download';
      console.error(`[DocumentDownload] Critical failure for document ${documentId}:`, errorMessage);

      await jobQueue.updateJobProgress(job.id, 0, 'failed', `Document download failed: ${errorMessage}`);

      // Update document status
      await db
        .update(documents)
        .set({
          processingStatus: 'failed',
          processingError: `Document download failed: ${errorMessage}`,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      throw error;
    }
  }

  /**
   * Process complete document pipeline
   *
   * This method initiates the document processing pipeline by queueing only the first step(s).
   * The sequential workflow is handled through dependency chaining in individual step methods:
   * - Text extraction → Metadata enhancement → Chunking → Embedding generation → Vector storage
   */
  async processCompleteDocumentPipeline(job: Job): Promise<void> {
    const payload = job.payload as CompleteDocumentPipelinePayload;
    const { documentId, googleDriveFileId, fileUrl, filePath, userId, skipSteps = [], forceReprocess = false, settings } = payload;

    try {
      await jobQueue.updateJobProgress(job.id, 5, 'processing', 'Starting document pipeline');

      // Determine if this is an uploaded file or Google Drive file
      const isUploadedFile = !!filePath && !googleDriveFileId && !fileUrl;

      console.log(`[CompleteDocumentPipeline] Processing ${isUploadedFile ? 'uploaded' : 'Google Drive'} file for document ${documentId}`);

      // Step 1: Download document (only for Google Drive files)
      if (!skipSteps.includes('download') && !isUploadedFile) {
        await this.queueDocumentDownload(documentId, googleDriveFileId, fileUrl, userId);
        await jobQueue.updateJobProgress(job.id, 50, 'processing', 'Document download queued - pipeline will continue automatically');
      } else if (isUploadedFile) {
        console.log(`[CompleteDocumentPipeline] Skipping download for uploaded file: ${filePath}`);
        await jobQueue.updateJobProgress(job.id, 25, 'processing', 'File already uploaded, proceeding to text extraction');

        // Step 2: Queue text extraction for uploaded files (download step will queue this for Google Drive files)
        if (!skipSteps.includes('extraction')) {
          await this.queueTextExtraction(documentId);
          await jobQueue.updateJobProgress(job.id, 50, 'processing', 'Text extraction queued - pipeline will continue automatically');
        }
      }

      // IMPORTANT: Do NOT queue subsequent steps here to avoid race conditions
      // The pipeline will continue automatically through dependency chaining:
      //
      // Text extraction (processTextExtraction) → queues metadata enhancement (line 766)
      // Metadata enhancement (processMetadataEnhancement) → queues chunking (line 930)
      // Document chunking (processDocumentChunking) → queues embedding generation (line 1157)
      // Embedding generation (processEmbeddingGeneration) → queues vector storage (line 1376)
      // Vector storage (processVectorStorage) → completes pipeline
      //
      // This ensures proper data dependencies are met and eliminates race conditions.

      await jobQueue.updateJobProgress(job.id, 100, 'completed', 'Document pipeline orchestration completed - processing will continue automatically through dependency chain');

      console.log(`[CompleteDocumentPipeline] Pipeline orchestration completed for document ${documentId}. Processing will continue automatically through dependency chain.`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during pipeline orchestration';
      console.error(`[CompleteDocumentPipeline] Pipeline orchestration failed for document ${documentId}:`, errorMessage);

      await jobQueue.updateJobProgress(job.id, 0, 'failed', `Pipeline orchestration failed: ${errorMessage}`);

      // Update document status
      await db
        .update(documents)
        .set({
          processingStatus: 'failed',
          processingError: `Pipeline orchestration failed: ${errorMessage}`,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      throw error;
    }
  }

  /**
   * Process text extraction using Mistral OCR
   */
  async processTextExtraction(job: Job): Promise<void> {
    const payload = job.payload as TextExtractionPayload;
    const { documentId, filePath, mimeType, originalFilename } = payload;

    try {
      await jobQueue.updateJobProgress(job.id, 10, 'processing', 'Starting text extraction');

      // Validate file exists and is accessible
      const fs = await import('fs/promises');
      const path = await import('path');

      console.log(`[TextExtraction] Validating file: ${filePath}`);

      // LEGACY PATH DETECTION: Handle old absolute paths from legacy jobs
      let effectiveFilePath: string;
      try {
        effectiveFilePath = await this.correctLegacyFilePath(filePath, documentId);
      } catch (error) {
        // Re-throw permanent failure errors from legacy path correction
        throw error;
      }

      // Check if file exists using effective path
      let fileStats;
      try {
        fileStats = await fs.stat(effectiveFilePath);
        if (effectiveFilePath !== filePath) {
          console.log(`[TextExtraction] Successfully found file using corrected path: ${effectiveFilePath}`);
        }
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          // If this is a legacy path that we tried to correct, mark as permanent failure
          if (filePath !== effectiveFilePath) {
            const errorMessage = `Legacy job file not found even after path correction: original=${filePath}, corrected=${effectiveFilePath}`;
            console.error(`[TextExtraction] ${errorMessage}`);
            throw new Error(`PERMANENT_FAILURE: ${errorMessage}`);
          }
          throw new Error(`File not found: ${effectiveFilePath}. The document download may have failed.`);
        }
        throw new Error(`Unable to access file: ${effectiveFilePath}. Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Validate file is not empty
      if (fileStats.size === 0) {
        throw new Error(`File is empty: ${effectiveFilePath}. The download may have been incomplete.`);
      }

      // Validate file size is reasonable (not too small, not too large)
      const minFileSize = 10; // 10 bytes minimum
      const maxFileSize = 100 * 1024 * 1024; // 100MB maximum

      if (fileStats.size < minFileSize) {
        throw new Error(`File too small (${fileStats.size} bytes): ${filePath}. Minimum size is ${minFileSize} bytes.`);
      }

      if (fileStats.size > maxFileSize) {
        throw new Error(`File too large (${fileStats.size} bytes): ${filePath}. Maximum size is ${maxFileSize} bytes.`);
      }

      // Validate file extension matches expected mime type
      const fileExtension = path.extname(originalFilename).toLowerCase();
      const supportedExtensions = ['.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg', '.tiff', '.bmp'];

      if (fileExtension && !supportedExtensions.includes(fileExtension)) {
        console.warn(`[TextExtraction] Unsupported file extension: ${fileExtension} for file: ${originalFilename}`);
      }

      console.log(`[TextExtraction] File validation passed. Size: ${fileStats.size} bytes, Extension: ${fileExtension}`);

      await jobQueue.updateJobProgress(job.id, 20, 'processing', 'File validation completed');

      // Read file content using effective path
      let fileContent: Buffer;
      try {
        fileContent = await fs.readFile(effectiveFilePath);
        if (effectiveFilePath !== filePath) {
          console.log(`[TextExtraction] Successfully read file using corrected path: ${effectiveFilePath}`);

          // Update the document record with the corrected path for future operations
          await db
            .update(documents)
            .set({
              filePath: effectiveFilePath,
              updatedAt: new Date(),
            })
            .where(eq(documents.id, documentId));
          console.log(`[TextExtraction] Updated document ${documentId} with corrected file path`);
        }
      } catch (error) {
        throw new Error(`Failed to read file content: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Validate file content is not corrupted (basic check)
      if (fileContent.length !== fileStats.size) {
        throw new Error(`File content size mismatch. Expected: ${fileStats.size}, Read: ${fileContent.length}`);
      }

      await jobQueue.updateJobProgress(job.id, 30, 'processing', 'Extracting text with Mistral OCR');

      // Try multiple extraction strategies with fallbacks
      let extractionResult: any = null;
      let extractionMethod = 'mistral_ocr';
      let finalError = '';

      // Strategy 1: Primary Mistral OCR extraction
      try {
        console.log(`[TextExtraction] Attempting primary Mistral OCR extraction for: ${originalFilename}`);
        const mistralOCRService = await getMistralOCRService();
        extractionResult = await mistralOCRService.extractText(fileContent, mimeType, originalFilename);

        if (extractionResult.success && extractionResult.text && extractionResult.text.trim().length > 0) {
          console.log(`[TextExtraction] Primary extraction successful. Text length: ${extractionResult.text.length}`);
        } else {
          throw new Error(extractionResult.error || 'No text extracted from primary method');
        }
      } catch (primaryError) {
        console.warn(`[TextExtraction] Primary extraction failed: ${primaryError instanceof Error ? primaryError.message : 'Unknown error'}`);
        finalError = primaryError instanceof Error ? primaryError.message : 'Unknown error';

        await jobQueue.updateJobProgress(job.id, 40, 'processing', 'Primary extraction failed, trying fallback methods');

        // Strategy 2: Retry with reduced quality/simplified processing
        try {
          console.log(`[TextExtraction] Attempting fallback extraction with simplified processing`);

          // For text files, try basic text reading
          if (mimeType === 'text/plain' || originalFilename.toLowerCase().endsWith('.txt')) {
            extractionMethod = 'manual';
            const textContent = fileContent.toString('utf-8');
            if (textContent.trim().length > 0) {
              extractionResult = {
                success: true,
                text: textContent,
                metadata: {
                  wordCount: textContent.split(/\s+/).length,
                  characterCount: textContent.length,
                  pageCount: 1,
                  hasImages: false,
                  hasTables: false,
                  language: 'en',
                  extractionMethod: 'manual',
                  confidence: 95,
                  processingTime: 50
                }
              };
              console.log(`[TextExtraction] Basic text extraction successful. Text length: ${textContent.length}`);
            } else {
              throw new Error('File appears to be empty');
            }
          } else {
            // Try Mistral OCR with alternative settings or reduced processing
            extractionMethod = 'manual';
            extractionResult = await this.attemptMistralFallback(fileContent, mimeType, originalFilename);
          }
        } catch (fallbackError) {
          console.warn(`[TextExtraction] Fallback extraction failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
          finalError += ` | Fallback: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`;

          // Strategy 3: Generate minimal text for pipeline continuation
          try {
            console.log(`[TextExtraction] Attempting minimal extraction for pipeline continuation`);
            extractionMethod = 'manual';

            const minimalText = this.generateMinimalText(originalFilename, fileStats.size, mimeType);
            extractionResult = {
              success: true,
              text: minimalText,
              metadata: {
                wordCount: minimalText.split(/\s+/).length,
                characterCount: minimalText.length,
                pageCount: 1,
                hasImages: false,
                hasTables: false,
                language: 'en',
                extractionMethod: 'manual',
                confidence: 30,
                processingTime: 10
              }
            };
            console.log(`[TextExtraction] Minimal extraction successful. Using placeholder text for pipeline continuation.`);
          } catch (minimalError) {
            console.error(`[TextExtraction] All extraction strategies failed: ${minimalError instanceof Error ? minimalError.message : 'Unknown error'}`);
            throw new Error(`All text extraction strategies failed. Primary: ${finalError} | Minimal: ${minimalError instanceof Error ? minimalError.message : 'Unknown error'}`);
          }
        }
      }

      // Validate final extraction result
      if (!extractionResult || !extractionResult.success || !extractionResult.text) {
        throw new Error(`Text extraction failed: No valid text extracted. ${finalError}`);
      }

      console.log(`[TextExtraction] Final extraction successful using ${extractionMethod}. Text length: ${extractionResult.text.length}, Confidence: ${extractionResult.metadata.confidence}%`);

      await jobQueue.updateJobProgress(job.id, 70, 'processing', 'Updating document record');

      // Calculate safe values for database fields
      const extractedText = extractionResult.text || '';
      const textLength = extractionResult.metadata.characterCount || extractedText.length;
      const wordCount = extractionResult.metadata.wordCount || (extractedText ? extractedText.split(/\s+/).filter(word => word.length > 0).length : 0);
      const tokenCount = Math.max(1, Math.ceil(textLength / 4)); // Ensure minimum of 1, never NaN

      console.log(`[TextExtraction] Database update values: textLength=${textLength}, wordCount=${wordCount}, tokenCount=${tokenCount}`);

      // Update document with extracted text and metadata
      await db
        .update(documents)
        .set({
          extractedText: extractedText,
          wordCount: wordCount,
          pageCount: extractionResult.metadata.pageCount || 1,
          hasImages: extractionResult.metadata.hasImages || false,
          hasTables: extractionResult.metadata.hasTables || false,
          language: extractionResult.metadata.language || 'en',
          extractionMethod: extractionResult.metadata.extractionMethod as any,
          ocrConfidence: extractionResult.metadata.confidence || 0,
          processingDurationMs: extractionResult.metadata.processingTime || 0,
          textLength: textLength,
          tokenCount: tokenCount,
          ocrCompletedAt: new Date(),
          processingStatus: 'processing',
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      await jobQueue.updateJobProgress(job.id, 100, 'completed', 'Text extraction completed');

      // Queue next step: metadata enhancement (pass extracted text to avoid race condition)
      await this.queueMetadataEnhancement(documentId, 0, extractedText);

    } catch (error) {
      console.error(`[TextExtraction] Critical failure for document ${documentId}: ${error.message}`);

      // Instead of failing completely, create a basic document record with placeholder text
      try {
        console.log(`[TextExtraction] Creating fallback document record for ${documentId}`);

        const fallbackText = this.generateMinimalText(originalFilename, fileStats.size, mimeType);

        // Update document with fallback text and processing status
        await db
          .update(documents)
          .set({
            extractedText: fallbackText,
            wordCount: fallbackText.split(/\s+/).length,
            textLength: fallbackText.length,
            tokenCount: Math.max(1, Math.ceil(fallbackText.length / 4)),
            extractionMethod: 'manual', // Use valid enum value
            ocrConfidence: 0, // Low confidence for fallback
            processingDurationMs: Date.now() - job.createdAt.getTime(),
            language: 'en',
            hasImages: false,
            hasTables: false,
            pageCount: 1,
            ocrCompletedAt: new Date(),
            processingStatus: 'completed', // Document stored successfully with fallback processing
            processingError: `Text extraction failed: ${error.message}. Document stored with basic metadata.`,
            updatedAt: new Date(),
          })
          .where(eq(documents.id, documentId));

        await jobQueue.updateJobProgress(job.id, 100, 'completed', `Text extraction failed, but document stored with basic metadata`);

        console.log(`[TextExtraction] Document ${documentId} stored with fallback text, continuing pipeline`);

        // Try to continue with metadata enhancement using the fallback text
        try {
          await this.queueMetadataEnhancement(documentId, 0, fallbackText);
        } catch (metadataError) {
          console.warn(`[TextExtraction] Could not queue metadata enhancement: ${metadataError.message}`);
          // This is OK - document is already stored with basic info
        }

      } catch (fallbackError) {
        console.error(`[TextExtraction] Fallback processing also failed for document ${documentId}: ${fallbackError.message}`);

        // Last resort: mark as completely failed
        await jobQueue.updateJobProgress(job.id, 0, 'failed', `Text extraction and fallback processing failed: ${error.message}`);

        await db
          .update(documents)
          .set({
            processingStatus: 'failed',
            processingError: `Complete processing failure: ${error.message}`,
            updatedAt: new Date(),
          })
          .where(eq(documents.id, documentId));

        throw error;
      }
    }
  }

  /**
   * Process metadata enhancement using Nova Micro AI
   */
  async processMetadataEnhancement(job: Job): Promise<void> {
    const payload = job.payload as MetadataEnhancementPayload;
    const { documentId, extractedText, folderPath, filename } = payload;

    try {
      await jobQueue.updateJobProgress(job.id, 10, 'processing', 'Starting metadata enhancement');

      // Validate payload parameters
      const missingParams: string[] = [];

      if (!extractedText || extractedText.trim().length === 0) {
        missingParams.push('extractedText (empty or null)');
      }

      if (!filename || filename.trim().length === 0) {
        missingParams.push('filename (empty or null)');
      }

      if (missingParams.length > 0) {
        const errorMessage = `Metadata enhancement failed - missing required parameters: ${missingParams.join(', ')}`;
        console.error(`[MetadataEnhancement] ${errorMessage} for document ${documentId}`);
        throw new Error(errorMessage);
      }

      // Use fallback for folder path if not provided
      const safeFolderPath = folderPath || '/unknown';

      console.log(`[MetadataEnhancement] Processing with parameters:`, {
        documentId,
        extractedTextLength: extractedText.length,
        folderPath: safeFolderPath,
        filename
      });

      // Get current document record
      const documentResult = await db
        .select()
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);

      if (documentResult.length === 0) {
        throw new Error(`Document ${documentId} not found`);
      }

      const document = documentResult[0];

      await jobQueue.updateJobProgress(job.id, 30, 'processing', 'Enhancing metadata with Nova Micro AI');

      // Enhance metadata using Nova Micro
      const enhancedMetadata = await enhancedMetadataExtractor.getEnhancedMetadata(
        extractedText,
        filename,
        safeFolderPath
      );

      await jobQueue.updateJobProgress(job.id, 70, 'processing', 'Updating document with enhanced metadata');

      // Update document with enhanced metadata
      const updateData = {
        // Enhanced metadata from Nova Micro
        supplierName: enhancedMetadata.supplierName,
        supplierNormalized: enhancedMetadata.supplierNormalized,
        ingredientName: enhancedMetadata.ingredientName,
        ingredientNormalized: enhancedMetadata.ingredientNormalized,
        ingredientInciName: enhancedMetadata.ingredientInciName,
        ingredientCasNumber: enhancedMetadata.ingredientCasNumber,
        ragDocumentType: enhancedMetadata.ragDocumentType as any,
        documentSubtype: enhancedMetadata.documentSubtype,

        // AI-enhanced metadata
        keywords: enhancedMetadata.keywords,
        casNumbers: enhancedMetadata.casNumbers,
        inciNames: enhancedMetadata.inciNames,
        allergens: enhancedMetadata.allergens,
        chemicalNames: enhancedMetadata.chemicalNames,
        productApplications: enhancedMetadata.productApplications,
        functionCategories: enhancedMetadata.functionCategories,

        // Quality and validation
        qualityScore: enhancedMetadata.qualityScore,
        validationStatus: enhancedMetadata.validationStatus as any,

        // Processing metadata
        processedDate: new Date(),
        updatedAt: new Date(),
      };

      await db
        .update(documents)
        .set(updateData)
        .where(eq(documents.id, documentId));

      await jobQueue.updateJobProgress(job.id, 100, 'completed', 'Metadata enhancement completed');

      // Queue next step: document chunking
      await this.queueDocumentChunking(documentId);

    } catch (error) {
      console.warn(`[MetadataEnhancement] Enhancement failed for document ${documentId}, continuing with basic metadata:`, error.message);

      // Instead of failing completely, mark as partially processed and continue
      await jobQueue.updateJobProgress(job.id, 100, 'completed', `Metadata enhancement skipped (${error.message}), continuing with basic metadata`);

      // Update document with basic metadata (keep existing values) and processing notes
      await db
        .update(documents)
        .set({
          processingStatus: 'processing', // Keep processing to continue pipeline
          processingError: `Metadata enhancement skipped: ${error.message}`, // Note the issue but don't fail
          validationStatus: 'pending', // Will need manual review due to enhancement failure
          qualityScore: 50, // Lower quality score due to missing enhanced metadata
          processedDate: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      // Continue to next step despite metadata enhancement failure
      try {
        await this.queueDocumentChunking(documentId);
        console.log(`[MetadataEnhancement] Successfully queued chunking for document ${documentId} despite metadata enhancement failure`);
      } catch (chunkingError) {
        console.error(`[MetadataEnhancement] Failed to queue chunking for document ${documentId}:`, chunkingError);
        // Even if chunking fails to queue, don't throw - let the job complete
      }
    }
  }

  /**
   * Process document chunking
   */
  async processDocumentChunking(job: Job): Promise<void> {
    const payload = job.payload as DocumentChunkingPayload;
    const { documentId, extractedText, documentType, tokenCount } = payload;

    try {
      await jobQueue.updateJobProgress(job.id, 5, 'processing', 'Starting document chunking validation');

      // Validate input parameters
      if (!documentId) {
        throw new Error('Document ID is required for document chunking');
      }

      if (!extractedText || typeof extractedText !== 'string') {
        throw new Error('Valid extracted text is required for document chunking');
      }

      const cleanText = extractedText.trim();
      if (cleanText.length === 0) {
        throw new Error('Extracted text is empty after trimming');
      }

      if (cleanText.length < 50) {
        console.warn(`[DocumentChunking] Text is very short (${cleanText.length} chars), creating single chunk`);
      }

      console.log(`[DocumentChunking] Processing chunking for document ${documentId}:`, {
        textLength: cleanText.length,
        documentType: documentType || 'unknown',
        tokenCount: tokenCount || 0
      });

      await jobQueue.updateJobProgress(job.id, 15, 'processing', `Chunking text (${cleanText.length} characters)`);

      let chunkingResult;

      try {
        // Chunk the document using our intelligent chunker
        chunkingResult = DocumentChunker.chunk(documentId, cleanText, documentType, tokenCount);

        console.log(`[DocumentChunking] DocumentChunker.chunk returned:`, {
          hasResult: !!chunkingResult,
          resultType: typeof chunkingResult,
          hasChunks: !!chunkingResult?.chunks,
          chunkCount: chunkingResult?.chunks?.length || 0
        });

      } catch (chunkerError) {
        console.error(`[DocumentChunking] DocumentChunker.chunk failed:`, chunkerError);

        // Fallback to basic chunking if the intelligent chunker fails
        console.log(`[DocumentChunking] Falling back to basic chunking strategy`);
        chunkingResult = this.createFallbackChunks(documentId, cleanText, documentType);
      }

      // Validate chunking result structure
      if (!chunkingResult) {
        throw new Error('Document chunking failed: No result returned from chunker');
      }

      if (typeof chunkingResult !== 'object') {
        throw new Error(`Document chunking failed: Invalid result type (${typeof chunkingResult})`);
      }

      if (!chunkingResult.chunks || !Array.isArray(chunkingResult.chunks)) {
        throw new Error('Document chunking failed: No chunks array in result');
      }

      if (chunkingResult.chunks.length === 0) {
        throw new Error('Document chunking failed: No chunks generated');
      }

      console.log(`[DocumentChunking] Successfully generated ${chunkingResult.chunks.length} chunks using strategy: ${chunkingResult.strategy_used || 'fallback'}`);

      await jobQueue.updateJobProgress(job.id, 40, 'processing', `Generated ${chunkingResult.chunks.length} chunks, validating format`);

      // Validate and standardize chunk format
      const validatedChunks = [];
      const invalidChunks = [];

      for (let i = 0; i < chunkingResult.chunks.length; i++) {
        const rawChunk = chunkingResult.chunks[i];

        try {
          // Validate chunk structure
          if (!rawChunk || typeof rawChunk !== 'object') {
            invalidChunks.push({ index: i, reason: 'Invalid chunk structure', chunk: rawChunk });
            continue;
          }

          // Extract and validate content
          const content = rawChunk.chunk_text || rawChunk.content || rawChunk.text;
          if (!content || typeof content !== 'string') {
            invalidChunks.push({ index: i, reason: 'Missing or invalid content', chunk: { hasContent: !!content, contentType: typeof content } });
            continue;
          }

          const cleanContent = content.trim();
          if (cleanContent.length === 0) {
            invalidChunks.push({ index: i, reason: 'Empty content after trimming', chunk: { originalLength: content.length } });
            continue;
          }

          if (cleanContent.length < 10) {
            console.warn(`[DocumentChunking] Very short chunk ${i}: ${cleanContent.length} characters`);
          }

          // Create standardized chunk format
          const standardizedChunk = {
            // Standard fields for embedding generation
            index: rawChunk.chunk_index !== undefined ? rawChunk.chunk_index : i,
            content: cleanContent,
            type: rawChunk.chunk_type || rawChunk.type || 'text',
            section: rawChunk.section_title || rawChunk.section || `section_${i}`,

            // Additional metadata for vector storage
            startChar: rawChunk.start_char || rawChunk.startChar || i * 1000,
            endChar: rawChunk.end_char || rawChunk.endChar || (i + 1) * 1000,
            tokenCount: (typeof rawChunk.token_count === 'number' && !isNaN(rawChunk.token_count)) ? rawChunk.token_count :
                       (typeof rawChunk.tokenCount === 'number' && !isNaN(rawChunk.tokenCount)) ? rawChunk.tokenCount :
                       Math.max(1, Math.ceil(cleanContent.length / 4)),

            // Quality and processing metadata
            chunkingStrategy: chunkingResult.strategy_used || 'fallback',
            confidence: rawChunk.confidence || 85,
            qualityScore: Math.min(100, cleanContent.length > 100 ? 90 : Math.max(60, cleanContent.length)),

            // Source metadata
            documentId: documentId,
            createdAt: new Date().toISOString()
          };

          // Validate final chunk
          if (standardizedChunk.content.length > 8000) {
            standardizedChunk.content = standardizedChunk.content.substring(0, 8000) + '...';
            standardizedChunk.wasTruncated = true;
            console.warn(`[DocumentChunking] Truncated chunk ${i} to 8000 characters`);
          }

          validatedChunks.push(standardizedChunk);

        } catch (error) {
          invalidChunks.push({
            index: i,
            reason: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            chunk: null
          });
        }
      }

      if (invalidChunks.length > 0) {
        console.warn(`[DocumentChunking] Found ${invalidChunks.length} invalid chunks:`, invalidChunks.slice(0, 5)); // Log first 5 invalid chunks
      }

      if (validatedChunks.length === 0) {
        throw new Error('Document chunking failed: No valid chunks after validation');
      }

      // If more than 30% of chunks are invalid, warn but continue
      const invalidRate = invalidChunks.length / chunkingResult.chunks.length;
      if (invalidRate > 0.3) {
        console.warn(`[DocumentChunking] High invalid chunk rate: ${(invalidRate * 100).toFixed(1)}% (${invalidChunks.length}/${chunkingResult.chunks.length})`);
      }

      console.log(`[DocumentChunking] Chunk validation complete: ${validatedChunks.length} valid, ${invalidChunks.length} invalid`);

      await jobQueue.updateJobProgress(job.id, 65, 'processing', `Validated ${validatedChunks.length}/${chunkingResult.chunks.length} chunks`);

      // Store chunking metadata in document
      const metadata = {
        chunkingStrategy: chunkingResult.strategy_used || 'fallback',
        totalChunks: validatedChunks.length,
        originalChunks: chunkingResult.chunks.length,
        invalidChunks: invalidChunks.length,
        avgChunkSize: Math.round(validatedChunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / validatedChunks.length),
        qualityMetrics: {
          averageQuality: Math.round(validatedChunks.reduce((sum, chunk) => sum + chunk.qualityScore, 0) / validatedChunks.length),
          averageConfidence: Math.round(validatedChunks.reduce((sum, chunk) => sum + chunk.confidence, 0) / validatedChunks.length),
          validationSuccess: (validatedChunks.length / chunkingResult.chunks.length) * 100
        }
      };

      await db
        .update(documents)
        .set({
          metadata: metadata,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      await jobQueue.updateJobProgress(job.id, 80, 'processing', 'Queueing embedding generation');

      // Queue next step: embedding generation with validated chunks
      await this.queueEmbeddingGeneration(documentId, validatedChunks);

      await jobQueue.updateJobProgress(job.id, 100, 'completed', `Document chunking completed: ${validatedChunks.length} chunks ready for embedding`);

      console.log(`[DocumentChunking] Successfully completed chunking for document ${documentId}:`, {
        totalChunks: validatedChunks.length,
        strategy: metadata.chunkingStrategy,
        avgSize: metadata.avgChunkSize,
        qualityScore: metadata.qualityMetrics.averageQuality
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during document chunking';
      console.error(`[DocumentChunking] Critical failure for document ${documentId}:`, errorMessage);

      await jobQueue.updateJobProgress(job.id, 0, 'failed', `Document chunking failed: ${errorMessage}`);

      // Update document status
      await db
        .update(documents)
        .set({
          processingStatus: 'failed',
          processingError: `Document chunking failed: ${errorMessage}`,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      throw error;
    }
  }

  /**
   * Process embedding generation with comprehensive error handling and recovery
   */
  async processEmbeddingGeneration(job: Job): Promise<void> {
    const payload = job.payload as EmbeddingGenerationPayload;
    const { documentId, chunks } = payload;

    try {
      await jobQueue.updateJobProgress(job.id, 5, 'processing', 'Starting embedding generation validation');

      // Validate input parameters
      if (!documentId) {
        throw new Error('Document ID is required for embedding generation');
      }

      if (!chunks || !Array.isArray(chunks)) {
        throw new Error('Valid chunks array is required for embedding generation');
      }

      if (chunks.length === 0) {
        throw new Error('No chunks provided for embedding generation');
      }

      console.log(`[EmbeddingGeneration] Processing ${chunks.length} chunks for document ${documentId}`);

      // Validate and filter chunks for content quality
      const validChunks = [];
      const skippedChunks = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        // Validate chunk structure
        if (!chunk || typeof chunk !== 'object') {
          skippedChunks.push({ index: i, reason: 'Invalid chunk structure' });
          continue;
        }

        // Validate chunk content
        if (!chunk.content || typeof chunk.content !== 'string') {
          skippedChunks.push({ index: i, reason: 'Missing or invalid content' });
          continue;
        }

        // Validate content length and quality
        const cleanContent = chunk.content.trim();
        if (cleanContent.length === 0) {
          skippedChunks.push({ index: i, reason: 'Empty content after trimming' });
          continue;
        }

        if (cleanContent.length < 10) {
          skippedChunks.push({ index: i, reason: 'Content too short (minimum 10 characters)' });
          continue;
        }

        if (cleanContent.length > 8000) {
          // Truncate very long chunks to prevent API issues
          chunk.content = cleanContent.substring(0, 8000) + '...';
          console.warn(`[EmbeddingGeneration] Truncated chunk ${i} to 8000 characters`);
        }

        validChunks.push({ ...chunk, originalIndex: i });
      }

      if (skippedChunks.length > 0) {
        console.warn(`[EmbeddingGeneration] Skipped ${skippedChunks.length} invalid chunks:`, skippedChunks);
      }

      if (validChunks.length === 0) {
        throw new Error('No valid chunks found for embedding generation. All chunks were invalid or empty.');
      }

      // If more than 50% of chunks were skipped, warn but continue
      if (skippedChunks.length > validChunks.length) {
        console.warn(`[EmbeddingGeneration] High failure rate: ${skippedChunks.length} skipped vs ${validChunks.length} valid chunks`);
      }

      await jobQueue.updateJobProgress(job.id, 15, 'processing', `Validated ${validChunks.length}/${chunks.length} chunks`);

      const chunksWithEmbeddings = [];
      const embeddingErrors = [];
      const totalValidChunks = validChunks.length;
      const maxRetries = 3;
      const retryDelay = 1000; // 1 second

      // Generate embeddings for each valid chunk with retry logic
      for (let i = 0; i < validChunks.length; i++) {
        const chunk = validChunks[i];
        let embeddingGenerated = false;
        let lastError = null;

        // Retry logic for embedding generation
        for (let retry = 0; retry < maxRetries && !embeddingGenerated; retry++) {
          try {
            if (retry > 0) {
              console.log(`[EmbeddingGeneration] Retry ${retry}/${maxRetries} for chunk ${chunk.originalIndex}`);
              await new Promise(resolve => setTimeout(resolve, retryDelay * retry));
            }

            console.log(`[EmbeddingGeneration] Generating embedding for chunk ${chunk.originalIndex} (${chunk.content.length} chars)`);

            // Generate embedding using AWS Titan v2
            const embedding = await titanEmbedder.generateEmbedding(chunk.content, 'search_document');

            // Validate embedding result
            if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
              throw new Error('Invalid embedding generated - empty or malformed result');
            }

            // Validate embedding dimensions (AWS Titan v2 should return 1024 dimensions)
            const expectedDimensions = 1024;
            if (embedding.length !== expectedDimensions) {
              console.warn(`[EmbeddingGeneration] Unexpected embedding dimensions: ${embedding.length}, expected: ${expectedDimensions}`);
            }

            chunksWithEmbeddings.push({
              ...chunk,
              embedding,
              tokenCount: Math.ceil(chunk.content.length / 4), // Rough estimate
              confidence: 95 - (retry * 10), // Reduce confidence for retried embeddings
              qualityScore: Math.min(100, chunk.content.length > 50 ? (90 - retry * 5) : (70 - retry * 5)),
              chunkingStrategy: 'semantic',
              startChar: chunk.originalIndex * 1000, // Approximate
              endChar: (chunk.originalIndex + 1) * 1000,
              retryCount: retry,
              embeddingDimensions: embedding.length
            });

            embeddingGenerated = true;
            console.log(`[EmbeddingGeneration] Successfully generated embedding for chunk ${chunk.originalIndex} (attempt ${retry + 1})`);

          } catch (error) {
            lastError = error;
            console.error(`[EmbeddingGeneration] Attempt ${retry + 1}/${maxRetries} failed for chunk ${chunk.originalIndex}:`, error instanceof Error ? error.message : 'Unknown error');

            // For rate limiting errors, wait longer
            if (error instanceof Error && error.message.includes('rate') || error.message.includes('throttle')) {
              console.log(`[EmbeddingGeneration] Rate limiting detected, waiting longer before retry`);
              await new Promise(resolve => setTimeout(resolve, retryDelay * (retry + 1) * 2));
            }
          }
        }

        if (!embeddingGenerated) {
          embeddingErrors.push({
            chunkIndex: chunk.originalIndex,
            error: lastError instanceof Error ? lastError.message : 'Unknown error',
            retries: maxRetries
          });
          console.error(`[EmbeddingGeneration] Failed to generate embedding for chunk ${chunk.originalIndex} after ${maxRetries} attempts`);
        }

        // Update progress
        const progress = 15 + Math.floor((i / totalValidChunks) * 70);
        await jobQueue.updateJobProgress(job.id, progress, 'processing', `Generated embeddings for ${i + 1}/${totalValidChunks} valid chunks`);

        // Add small delay between chunks to prevent overwhelming the service
        if (i < totalValidChunks - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Evaluate results and determine if we should continue
      const successfulEmbeddings = chunksWithEmbeddings.length;
      const failedEmbeddings = embeddingErrors.length;
      const successRate = successfulEmbeddings / (successfulEmbeddings + failedEmbeddings);

      console.log(`[EmbeddingGeneration] Results: ${successfulEmbeddings} successful, ${failedEmbeddings} failed, ${(successRate * 100).toFixed(1)}% success rate`);

      if (successfulEmbeddings === 0) {
        throw new Error(`No embeddings were generated successfully. Errors: ${embeddingErrors.map(e => e.error).join('; ')}`);
      }

      // If success rate is very low, warn but continue
      if (successRate < 0.5) {
        console.warn(`[EmbeddingGeneration] Low success rate (${(successRate * 100).toFixed(1)}%), but continuing with ${successfulEmbeddings} successful embeddings`);
      }

      await jobQueue.updateJobProgress(job.id, 90, 'processing', `Embedding generation completed. ${successfulEmbeddings}/${chunks.length} chunks processed successfully`);

      if (embeddingErrors.length > 0) {
        console.warn(`[EmbeddingGeneration] Some embeddings failed:`, embeddingErrors);
      }

      await jobQueue.updateJobProgress(job.id, 95, 'processing', 'Queueing vector storage');

      // Queue next step: vector storage
      await this.queueVectorStorage(documentId, chunksWithEmbeddings);

      await jobQueue.updateJobProgress(job.id, 100, 'completed', `Embedding generation completed with ${successfulEmbeddings}/${chunks.length} successful embeddings`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during embedding generation';
      console.error(`[EmbeddingGeneration] Critical failure for document ${documentId}:`, errorMessage);

      await jobQueue.updateJobProgress(job.id, 0, 'failed', `Embedding generation failed: ${errorMessage}`);

      // Update document status
      await db
        .update(documents)
        .set({
          processingStatus: 'failed',
          processingError: `Embedding generation failed: ${errorMessage}`,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      throw error;
    }
  }

  /**
   * Process vector storage with comprehensive error handling and recovery
   */
  async processVectorStorage(job: Job): Promise<void> {
    const payload = job.payload as VectorStoragePayload;
    const { documentId, chunksWithEmbeddings } = payload;

    try {
      await jobQueue.updateJobProgress(job.id, 5, 'processing', 'Starting vector storage validation');

      // Validate input parameters
      if (!documentId) {
        throw new Error('Document ID is required for vector storage');
      }

      if (!chunksWithEmbeddings || !Array.isArray(chunksWithEmbeddings)) {
        throw new Error('Valid chunks with embeddings array is required for vector storage');
      }

      if (chunksWithEmbeddings.length === 0) {
        throw new Error('No chunks with embeddings provided for vector storage');
      }

      console.log(`[VectorStorage] Processing ${chunksWithEmbeddings.length} chunks with embeddings for document ${documentId}`);

      // Validate and sanitize chunks before storage
      const validChunks = [];
      const invalidChunks = [];

      for (let i = 0; i < chunksWithEmbeddings.length; i++) {
        const chunk = chunksWithEmbeddings[i];

        try {
          // Validate chunk structure
          if (!chunk || typeof chunk !== 'object') {
            invalidChunks.push({ index: i, reason: 'Invalid chunk structure', chunk: null });
            continue;
          }

          // Validate required fields
          const requiredFields = ['content', 'embedding'];
          const missingFields = requiredFields.filter(field => !chunk[field]);

          if (missingFields.length > 0) {
            invalidChunks.push({
              index: i,
              reason: `Missing required fields: ${missingFields.join(', ')}`,
              chunk: { hasContent: !!chunk.content, hasEmbedding: !!chunk.embedding }
            });
            continue;
          }

          // Validate content
          if (typeof chunk.content !== 'string' || chunk.content.trim().length === 0) {
            invalidChunks.push({
              index: i,
              reason: 'Invalid or empty content',
              chunk: { contentType: typeof chunk.content, contentLength: chunk.content?.length || 0 }
            });
            continue;
          }

          // Validate embedding
          if (!Array.isArray(chunk.embedding) || chunk.embedding.length === 0) {
            invalidChunks.push({
              index: i,
              reason: 'Invalid embedding - must be non-empty array',
              chunk: { embeddingType: typeof chunk.embedding, embeddingLength: chunk.embedding?.length || 0 }
            });
            continue;
          }

          // Validate embedding dimensions
          const expectedDimensions = 1024; // AWS Titan v2 embedding dimensions
          if (chunk.embedding.length !== expectedDimensions) {
            // Still allow but warn about unexpected dimensions
            console.warn(`[VectorStorage] Chunk ${i} has unexpected embedding dimensions: ${chunk.embedding.length}, expected: ${expectedDimensions}`);
          }

          // Validate embedding values
          const invalidEmbeddings = chunk.embedding.some(val => typeof val !== 'number' || isNaN(val) || !isFinite(val));
          if (invalidEmbeddings) {
            invalidChunks.push({
              index: i,
              reason: 'Embedding contains invalid numeric values (NaN or Infinity)',
              chunk: { embeddingLength: chunk.embedding.length }
            });
            continue;
          }

          // Sanitize and prepare chunk for storage
          const sanitizedChunk = {
            ...chunk,
            content: chunk.content.trim(),
            // Ensure numeric fields are properly typed
            tokenCount: (chunk.tokenCount && !isNaN(Number(chunk.tokenCount))) ? Number(chunk.tokenCount) : Math.max(1, Math.ceil(chunk.content.length / 4)),
            confidence: chunk.confidence ? Number(chunk.confidence) : 95,
            qualityScore: chunk.qualityScore ? Number(chunk.qualityScore) : 85,
            // Ensure embedding is properly formatted
            embedding: chunk.embedding.map(val => Number(val)),
            // Add storage metadata
            storedAt: new Date().toISOString(),
            originalIndex: chunk.originalIndex !== undefined ? chunk.originalIndex : i
          };

          validChunks.push(sanitizedChunk);

        } catch (error) {
          invalidChunks.push({
            index: i,
            reason: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            chunk: null
          });
        }
      }

      if (invalidChunks.length > 0) {
        console.warn(`[VectorStorage] Found ${invalidChunks.length} invalid chunks:`, invalidChunks);
      }

      if (validChunks.length === 0) {
        throw new Error('No valid chunks found for vector storage. All chunks failed validation.');
      }

      // If more than 30% of chunks are invalid, warn but continue
      const invalidRate = invalidChunks.length / chunksWithEmbeddings.length;
      if (invalidRate > 0.3) {
        console.warn(`[VectorStorage] High invalid chunk rate: ${(invalidRate * 100).toFixed(1)}% (${invalidChunks.length}/${chunksWithEmbeddings.length})`);
      }

      await jobQueue.updateJobProgress(job.id, 15, 'processing', `Validated ${validChunks.length}/${chunksWithEmbeddings.length} chunks for storage`);

      const maxRetries = 3;
      const retryDelay = 2000; // 2 seconds
      let storageResult = null;
      let lastError = null;

      // Retry logic for vector storage
      for (let retry = 0; retry < maxRetries; retry++) {
        try {
          if (retry > 0) {
            console.log(`[VectorStorage] Retry ${retry}/${maxRetries} for document ${documentId}`);
            await new Promise(resolve => setTimeout(resolve, retryDelay * retry));
          }

          await jobQueue.updateJobProgress(job.id, 20 + (retry * 10), 'processing',
            retry === 0 ? 'Storing chunks in vector database' : `Retrying vector storage (attempt ${retry + 1})`);

          console.log(`[VectorStorage] Attempting to store ${validChunks.length} chunks (attempt ${retry + 1})`);

          // Store chunks with embeddings in vector database
          storageResult = await vectorStorage.storeDocumentChunks(documentId, validChunks);

          // Validate storage result
          if (!storageResult) {
            throw new Error('Vector storage returned null/undefined result');
          }

          if (typeof storageResult !== 'object') {
            throw new Error(`Vector storage returned invalid result type: ${typeof storageResult}`);
          }

          // Check for explicit failure
          if (storageResult.success === false) {
            const errorMessages = storageResult.errors ?
              storageResult.errors.map(e => e.error || e.message || 'Unknown error').join('; ') :
              'Unknown storage error';
            throw new Error(`Vector storage failed: ${errorMessages}`);
          }

          // Validate that some chunks were actually stored
          const storedCount = storageResult.stored || 0;
          if (storedCount === 0) {
            throw new Error('No chunks were successfully stored in vector database');
          }

          console.log(`[VectorStorage] Successfully stored ${storedCount}/${validChunks.length} chunks on attempt ${retry + 1}`);
          break; // Success, exit retry loop

        } catch (error) {
          lastError = error;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[VectorStorage] Attempt ${retry + 1}/${maxRetries} failed:`, errorMessage);

          if (retry === maxRetries - 1) {
            // This was the last retry, will throw after loop
            break;
          }

          // Check if error suggests temporary issue (network, rate limiting, etc.)
          const temporaryErrorPatterns = ['timeout', 'network', 'connection', 'rate', 'throttle', 'busy', 'unavailable'];
          const isTemporaryError = temporaryErrorPatterns.some(pattern =>
            errorMessage.toLowerCase().includes(pattern)
          );

          if (!isTemporaryError && retry < 2) {
            console.log(`[VectorStorage] Error doesn't appear temporary, but attempting one more retry`);
          }
        }
      }

      if (!storageResult) {
        const errorMessage = lastError instanceof Error ? lastError.message : 'Unknown error after all retries';
        throw new Error(`Vector storage failed after ${maxRetries} attempts: ${errorMessage}`);
      }

      await jobQueue.updateJobProgress(job.id, 70, 'processing', 'Vector storage completed, updating document status');

      // Evaluate storage results
      const storedCount = storageResult.stored || 0;
      const failedCount = storageResult.failed || 0;
      const totalChunks = storageResult.totalChunks || validChunks.length;
      const storageSuccessRate = storedCount / totalChunks;

      console.log(`[VectorStorage] Storage results: ${storedCount}/${totalChunks} chunks stored (${(storageSuccessRate * 100).toFixed(1)}% success rate)`);

      // Determine final status based on storage success rate
      let finalStatus = 'completed';
      let finalError = null;

      if (storedCount === 0) {
        finalStatus = 'failed';
        finalError = 'No chunks were successfully stored in vector database';
      } else if (storageSuccessRate < 0.5) {
        finalStatus = 'completed_with_errors';
        finalError = `Low storage success rate: ${storedCount}/${totalChunks} chunks stored`;
        console.warn(`[VectorStorage] Low storage success rate, but marking as completed with errors`);
      }

      await jobQueue.updateJobProgress(job.id, 85, 'processing', 'Updating document status in database');

      // Mark document as processed with appropriate status
      const updateData: any = {
        processingStatus: finalStatus,
        embeddingCompletedAt: new Date(),
        indexedAt: new Date(),
        updatedAt: new Date(),
      };

      if (finalError) {
        updateData.processingError = finalError;
      } else {
        updateData.processingError = null;
      }

      await db
        .update(documents)
        .set(updateData)
        .where(eq(documents.id, documentId));

      const completionMessage = finalError ?
        `Vector storage completed with issues: ${storedCount}/${totalChunks} chunks stored. ${finalError}` :
        `Vector storage completed successfully: ${storedCount}/${totalChunks} chunks stored`;

      await jobQueue.updateJobProgress(job.id, 100, 'completed', completionMessage);

      console.log(`[VectorStorage] Document processing pipeline completed for ${documentId}:`, {
        status: finalStatus,
        stored: storedCount,
        failed: failedCount,
        totalChunks: totalChunks,
        successRate: `${(storageSuccessRate * 100).toFixed(1)}%`,
        processingTime: storageResult.processingTime || 'unknown',
        hasErrors: !!finalError
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during vector storage';
      console.error(`[VectorStorage] Critical failure for document ${documentId}:`, errorMessage);

      await jobQueue.updateJobProgress(job.id, 0, 'failed', `Vector storage failed: ${errorMessage}`);

      // Update document status
      await db
        .update(documents)
        .set({
          processingStatus: 'failed',
          processingError: `Vector storage failed: ${errorMessage}`,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      throw error;
    }
  }

  // Helper methods to queue individual steps

  private async queueDocumentDownload(documentId: string, googleDriveFileId?: string, fileUrl?: string, userId?: string): Promise<string> {
    return jobQueue.addJob({
      type: JobType.DOCUMENT_DOWNLOAD,
      priority: JobPriority.NORMAL,
      payload: { documentId, googleDriveFileId, fileUrl, userId },
      metadata: { documentId, userId }
    });
  }

  private async queueTextExtraction(documentId: string): Promise<string> {
    // Get document details first
    const doc = await optimizedQuery(
      () => db.select().from(documents).where(eq(documents.id, documentId)).limit(1),
      `queue-text-extraction-document-${documentId}`
    );
    if (doc.length === 0) throw new Error(`Document ${documentId} not found`);

    // LEGACY PATH PROTECTION: Correct any legacy paths before queueing
    let effectiveFilePath = doc[0].filePath;
    if (doc[0].filePath) {
      try {
        effectiveFilePath = await this.correctLegacyFilePath(doc[0].filePath, documentId);

        // If path was corrected, update the database record
        if (effectiveFilePath !== doc[0].filePath) {
          console.log(`[QueueTextExtraction] Updating document ${documentId} with corrected file path`);
          await db
            .update(documents)
            .set({
              filePath: effectiveFilePath,
              updatedAt: new Date(),
            })
            .where(eq(documents.id, documentId));
        }
      } catch (error) {
        console.error(`[QueueTextExtraction] Legacy path correction failed for document ${documentId}:`, error instanceof Error ? error.message : 'Unknown error');
        // Don't fail the queueing, let the text extraction method handle the legacy path
        effectiveFilePath = doc[0].filePath;
      }
    }

    return jobQueue.addJob({
      type: JobType.TEXT_EXTRACTION,
      priority: JobPriority.NORMAL,
      payload: {
        documentId,
        filePath: effectiveFilePath,
        mimeType: doc[0].mimeType,
        originalFilename: doc[0].originalFilename
      },
      metadata: { documentId }
    });
  }

  private async queueMetadataEnhancement(documentId: string, retryCount: number = 0, extractedText?: string): Promise<string> {
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds

    // Get document details
    const doc = await optimizedQuery(
      () => db.select().from(documents).where(eq(documents.id, documentId)).limit(1),
      `queue-metadata-enhancement-document-${documentId}`
    );
    if (doc.length === 0) throw new Error(`Document ${documentId} not found`);

    const document = doc[0];

    // Validate required parameters before queueing metadata enhancement
    const missingParams: string[] = [];

    // Use provided extractedText parameter or fall back to database value
    const effectiveExtractedText = extractedText || document.extractedText;

    if (!effectiveExtractedText || effectiveExtractedText.trim().length === 0) {
      missingParams.push('extractedText (empty or null)');
    }

    if (!document.originalFilename || document.originalFilename.trim().length === 0) {
      missingParams.push('originalFilename (empty or null)');
    }

    // Note: googleDriveFolderPath is optional but helpful - provide fallback
    const folderPath = document.googleDriveFolderPath || '/unknown';

    if (missingParams.length > 0) {
      // If extractedText is missing and we haven't exhausted retries, wait and retry
      if (missingParams.includes('extractedText (empty or null)') && retryCount < maxRetries) {
        console.log(`[MetadataEnhancement] extractedText not yet available, retrying in ${retryDelay}ms (attempt ${retryCount + 1}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return this.queueMetadataEnhancement(documentId, retryCount + 1, extractedText);
      }

      const errorMessage = `Cannot queue metadata enhancement - missing required parameters: ${missingParams.join(', ')}`;
      console.error(`[MetadataEnhancement] ${errorMessage} for document ${documentId} after ${retryCount + 1} attempts`);

      // Update document status to failed
      await db
        .update(documents)
        .set({
          processingStatus: 'failed',
          processingError: errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      throw new Error(errorMessage);
    }

    console.log(`[MetadataEnhancement] Queueing with parameters:`, {
      documentId,
      extractedTextLength: effectiveExtractedText.length,
      folderPath,
      filename: document.originalFilename
    });

    return jobQueue.addJob({
      type: JobType.METADATA_ENHANCEMENT,
      priority: JobPriority.NORMAL,
      payload: {
        documentId,
        extractedText: effectiveExtractedText,
        folderPath,
        filename: document.originalFilename
      },
      metadata: { documentId }
    });
  }

  private async queueDocumentChunking(documentId: string): Promise<string> {
    // Get document details
    const doc = await optimizedQuery(
      () => db.select().from(documents).where(eq(documents.id, documentId)).limit(1),
      `queue-document-chunking-document-${documentId}`
    );
    if (doc.length === 0) throw new Error(`Document ${documentId} not found`);

    return jobQueue.addJob({
      type: JobType.DOCUMENT_CHUNKING,
      priority: JobPriority.NORMAL,
      payload: {
        documentId,
        extractedText: doc[0].extractedText,
        documentType: doc[0].ragDocumentType || 'other',
        tokenCount: doc[0].tokenCount || 0
      },
      metadata: { documentId }
    });
  }

  private async queueEmbeddingGeneration(documentId: string, chunks?: any[]): Promise<string> {
    let chunkData = chunks;

    if (!chunkData) {
      // Get chunks from chunking result or generate basic chunks
      const doc = await optimizedQuery(
        () => db.select().from(documents).where(eq(documents.id, documentId)).limit(1),
        `queue-embedding-generation-document-${documentId}`
      );
      if (doc.length === 0) throw new Error(`Document ${documentId} not found`);

      // Basic chunking if no chunks provided
      const text = doc[0].extractedText || '';
      chunkData = this.createBasicChunks(text);
    }

    return jobQueue.addJob({
      type: JobType.EMBEDDING_GENERATION,
      priority: JobPriority.NORMAL,
      payload: { documentId, chunks: chunkData },
      metadata: { documentId }
    });
  }

  private async queueVectorStorage(documentId: string, chunksWithEmbeddings?: any[]): Promise<string> {
    return jobQueue.addJob({
      type: JobType.VECTOR_STORAGE,
      priority: JobPriority.NORMAL,
      payload: { documentId, chunksWithEmbeddings },
      metadata: { documentId }
    });
  }

  private createBasicChunks(text: string): any[] {
    const chunkSize = 1000;
    const chunks = [];

    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push({
        index: Math.floor(i / chunkSize),
        content: text.slice(i, i + chunkSize),
        type: 'basic',
        section: `chunk_${Math.floor(i / chunkSize)}`
      });
    }

    return chunks;
  }

  /**
   * Create fallback chunks when DocumentChunker fails
   */
  private createFallbackChunks(documentId: string, text: string, documentType?: string): any {
    console.log(`[DocumentChunking] Creating fallback chunks for document ${documentId}`);

    const chunkSize = 1500; // Slightly larger chunks for fallback
    const overlap = 200;    // Overlap between chunks to maintain context
    const chunks = [];

    // If text is very short, create a single chunk
    if (text.length <= chunkSize) {
      chunks.push({
        chunk_index: 0,
        chunk_text: text,
        chunk_type: 'full_text',
        section_title: 'complete_document',
        start_char: 0,
        end_char: text.length,
        token_count: Math.max(1, Math.ceil((text?.length || 0) / 4)),
        confidence: 95
      });
    } else {
      // Create overlapping chunks
      let chunkIndex = 0;
      for (let i = 0; i < text.length; i += (chunkSize - overlap)) {
        const endPos = Math.min(i + chunkSize, text.length);
        const chunkText = text.slice(i, endPos);

        // Try to break at sentence boundaries if possible
        let finalText = chunkText;
        if (endPos < text.length && chunkText.length === chunkSize) {
          const lastSentence = chunkText.lastIndexOf('.');
          const lastParagraph = chunkText.lastIndexOf('\n');
          const breakPoint = Math.max(lastSentence, lastParagraph);

          if (breakPoint > chunkSize * 0.7) { // Only break if we keep at least 70% of the chunk
            finalText = chunkText.slice(0, breakPoint + 1);
          }
        }

        chunks.push({
          chunk_index: chunkIndex,
          chunk_text: finalText.trim(),
          chunk_type: 'text_segment',
          section_title: `section_${chunkIndex}`,
          start_char: i,
          end_char: i + finalText.length,
          token_count: Math.max(1, Math.ceil((finalText?.length || 0) / 4)),
          confidence: 85
        });

        chunkIndex++;

        // If we've processed all text, break
        if (endPos >= text.length) break;
      }
    }

    return {
      chunks: chunks,
      strategy_used: 'fallback_overlap',
      total_chunks: chunks.length,
      average_chunk_size: Math.round(chunks.reduce((sum, chunk) => sum + chunk.chunk_text.length, 0) / chunks.length),
      quality_metrics: {
        overlap_ratio: overlap / chunkSize,
        coverage: 100,
        coherence_score: 75 // Lower score for fallback strategy
      }
    };
  }

  /**
   * Attempt Mistral OCR with fallback settings
   */
  private async attemptMistralFallback(fileContent: Buffer, mimeType: string, originalFilename: string): Promise<any> {
    // Try with reduced processing requirements or alternative settings
    // This could involve retry logic with different parameters
    try {
      console.log(`[TextExtraction] Attempting Mistral OCR fallback for: ${originalFilename}`);

      // Add a small delay before retry to handle potential rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Retry the original extraction - sometimes temporary issues resolve
      const mistralOCRService = await getMistralOCRService();
      const result = await mistralOCRService.extractText(fileContent, mimeType, originalFilename);

      if (result.success && result.text && result.text.trim().length > 0) {
        return result;
      } else {
        throw new Error('Fallback extraction returned no text');
      }
    } catch (error) {
      console.warn(`[TextExtraction] Mistral fallback failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Generate minimal text for pipeline continuation when all extraction fails
   */
  private generateMinimalText(filename: string, fileSize: number, mimeType: string): string {
    const timestamp = new Date().toISOString();
    const fileSizeKB = Math.round(fileSize / 1024);

    // Generate meaningful placeholder text based on file properties
    let content = `Document: ${filename}\n`;
    content += `File Size: ${fileSizeKB} KB\n`;
    content += `Content Type: ${mimeType}\n`;
    content += `Processing Date: ${timestamp}\n\n`;

    // Add context based on file extension
    const extension = filename.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf':
        content += 'This appears to be a PDF document. Text extraction was not successful, but the document may contain valuable information that requires manual review.';
        break;
      case 'doc':
      case 'docx':
        content += 'This appears to be a Word document. Text extraction was not successful, but the document may contain structured content that requires manual review.';
        break;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'tiff':
        content += 'This appears to be an image document. OCR text extraction was not successful, but the image may contain text or diagrams that require manual review.';
        break;
      default:
        content += 'This document could not be processed automatically. Manual review may be required to extract content.';
    }

    content += '\n\nNote: This document should be marked for manual review due to automatic processing limitations.';

    return content;
  }
}

// Export enhanced job factory functions
export const EnhancedJobFactory = {
  completeDocumentPipeline: (
    documentId: string,
    userId: string,
    options: {
      googleDriveFileId?: string;
      fileUrl?: string;
      skipSteps?: string[];
      forceReprocess?: boolean;
      priority?: JobPriority;
    } = {}
  ): Omit<Job, 'id'> => ({
    type: JobType.COMPLETE_DOCUMENT_PIPELINE,
    priority: options.priority || JobPriority.NORMAL,
    payload: {
      documentId,
      userId,
      googleDriveFileId: options.googleDriveFileId,
      fileUrl: options.fileUrl,
      skipSteps: options.skipSteps || [],
      forceReprocess: options.forceReprocess || false,
    },
    metadata: { documentId, userId }
  }),

  textExtraction: (documentId: string, filePath: string, mimeType: string, originalFilename: string): Omit<Job, 'id'> => ({
    type: JobType.TEXT_EXTRACTION,
    priority: JobPriority.NORMAL,
    payload: { documentId, filePath, mimeType, originalFilename },
    metadata: { documentId }
  }),

  metadataEnhancement: (documentId: string, extractedText: string, folderPath?: string, filename?: string): Omit<Job, 'id'> => ({
    type: JobType.METADATA_ENHANCEMENT,
    priority: JobPriority.NORMAL,
    payload: { documentId, extractedText, folderPath, filename },
    metadata: { documentId }
  }),

  googleDriveFolderProcessing: (folderId: string, userId: string, options: { recursive?: boolean } = {}): Omit<Job, 'id'> => ({
    type: JobType.GDRIVE_FOLDER_PROCESSING,
    priority: JobPriority.LOW,
    payload: { folderId, userId, recursive: options.recursive || false },
    metadata: { userId, folderId }
  }),

  vectorReindexing: (documentIds: string[], priority: JobPriority = JobPriority.LOW): Omit<Job, 'id'> => ({
    type: JobType.VECTOR_REINDEXING,
    priority,
    payload: { documentIds },
    metadata: { batchSize: documentIds.length }
  })
};

// Export singleton instance
export const enhancedDocumentProcessor = new EnhancedDocumentProcessor();

// Export types for external use
export type {
  DocumentDownloadPayload,
  TextExtractionPayload,
  MetadataEnhancementPayload,
  DocumentChunkingPayload,
  EmbeddingGenerationPayload,
  VectorStoragePayload,
  CompleteDocumentPipelinePayload
};