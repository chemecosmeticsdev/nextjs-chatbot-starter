import crypto from 'crypto';
import { db } from '@/lib/db';

/**
 * Generates a SHA-256 hash from file buffer
 */
export function generateFileHash(fileBuffer: Buffer): string {
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * Checks if a document with the same hash, filename, and size already exists
 */
export async function findDuplicateDocument(
  fileHash: string,
  originalFilename: string,
  fileSizeBytes: number
): Promise<{
  id: string;
  originalFilename: string;
  processingStatus: string;
  createdAt: Date;
} | null> {
  try {
    const result = await db.execute(`
      SELECT id, original_filename, processing_status, created_at
      FROM documents
      WHERE file_hash = $1
        AND original_filename = $2
        AND file_size_bytes = $3
        AND deleted_at IS NULL
        AND is_duplicate = false
      ORDER BY created_at ASC
      LIMIT 1
    `, [fileHash, originalFilename, fileSizeBytes]);

    return result.rows[0] || null;
  } catch (error) {
    console.error('Error checking for duplicate document:', error);
    return null;
  }
}

/**
 * Creates a deduplication key for idempotency
 */
export function createDeduplicationKey(
  fileHash: string,
  originalFilename: string,
  fileSizeBytes: number,
  uploadedBy?: string
): string {
  const data = `${fileHash}:${originalFilename}:${fileSizeBytes}:${uploadedBy || 'anonymous'}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Marks a document as a duplicate of another document
 */
export async function markAsDuplicate(
  duplicateDocumentId: string,
  originalDocumentId: string,
  reason: string = 'Identical file content and metadata detected'
): Promise<void> {
  try {
    await db.execute(`
      UPDATE documents
      SET
        is_duplicate = true,
        duplicate_of = $2,
        duplicate_reason = $3,
        processing_status = 'completed',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [duplicateDocumentId, originalDocumentId, reason]);
  } catch (error) {
    console.error('Error marking document as duplicate:', error);
    throw error;
  }
}

/**
 * Enhanced duplicate check with different similarity levels
 */
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingDocument?: {
    id: string;
    originalFilename: string;
    processingStatus: string;
    createdAt: Date;
  };
  similarityLevel: 'identical' | 'filename_size' | 'none';
  action: 'reject' | 'mark_duplicate' | 'proceed';
}

export async function checkForDuplicates(
  fileHash: string,
  originalFilename: string,
  fileSizeBytes: number
): Promise<DuplicateCheckResult> {
  // First check for identical files (same hash)
  const identicalDocument = await findDuplicateDocument(fileHash, originalFilename, fileSizeBytes);

  if (identicalDocument) {
    return {
      isDuplicate: true,
      existingDocument: identicalDocument,
      similarityLevel: 'identical',
      action: identicalDocument.processingStatus === 'completed' ? 'reject' : 'mark_duplicate'
    };
  }

  // Check for filename + size match (potentially same file, different hash due to metadata changes)
  try {
    const result = await db.execute(`
      SELECT id, original_filename, processing_status, created_at, file_hash
      FROM documents
      WHERE original_filename = $1
        AND file_size_bytes = $2
        AND deleted_at IS NULL
        AND is_duplicate = false
        AND file_hash != $3
      ORDER BY created_at ASC
      LIMIT 1
    `, [originalFilename, fileSizeBytes, fileHash]);

    if (result.rows[0]) {
      return {
        isDuplicate: true,
        existingDocument: result.rows[0],
        similarityLevel: 'filename_size',
        action: 'mark_duplicate'
      };
    }
  } catch (error) {
    console.error('Error checking filename/size duplicates:', error);
  }

  return {
    isDuplicate: false,
    similarityLevel: 'none',
    action: 'proceed'
  };
}

/**
 * Processes duplicate detection result and updates database accordingly
 */
export async function processDuplicateResult(
  duplicateResult: DuplicateCheckResult,
  newDocumentId: string
): Promise<{
  shouldProceed: boolean;
  message: string;
  existingDocumentId?: string;
}> {
  if (!duplicateResult.isDuplicate) {
    return {
      shouldProceed: true,
      message: 'No duplicates found, proceeding with processing'
    };
  }

  const existingDoc = duplicateResult.existingDocument!;

  switch (duplicateResult.action) {
    case 'reject':
      return {
        shouldProceed: false,
        message: `Document already exists and has been processed (ID: ${existingDoc.id})`,
        existingDocumentId: existingDoc.id
      };

    case 'mark_duplicate':
      await markAsDuplicate(
        newDocumentId,
        existingDoc.id,
        `${duplicateResult.similarityLevel} duplicate detected`
      );
      return {
        shouldProceed: false,
        message: `Document marked as duplicate of existing document (ID: ${existingDoc.id})`,
        existingDocumentId: existingDoc.id
      };

    case 'proceed':
    default:
      return {
        shouldProceed: true,
        message: 'Proceeding with processing despite potential similarity'
      };
  }
}