import { db } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { eq, and, isNull, like } from 'drizzle-orm';
import { jobQueue, JobType, JobPriority } from './job-queue';

/**
 * Document Recovery Service
 *
 * Handles recovery of failed documents from the JobQueue crisis
 * Addresses missing userId, legacy file paths, and pipeline failures
 */
export class DocumentRecoveryService {

  /**
   * Phase 2: Comprehensive document recovery strategy
   * Attempts to recover and reprocess failed documents
   */
  async recoverFailedDocuments(options: {
    dryRun?: boolean;
    batchSize?: number;
    systemUserId?: string;
  } = {}): Promise<{
    analyzed: number;
    recoverable: number;
    unrecoverable: number;
    fixed: number;
    reprocessed: number;
    errors: string[];
  }> {
    const {
      dryRun = false,
      batchSize = 50,
      systemUserId = 'system-recovery'
    } = options;

    console.log(`[DocumentRecovery] Starting recovery analysis (dryRun: ${dryRun})`);

    const results = {
      analyzed: 0,
      recoverable: 0,
      unrecoverable: 0,
      fixed: 0,
      reprocessed: 0,
      errors: [] as string[]
    };

    try {
      // Get all failed documents
      const failedDocuments = await db
        .select()
        .from(documents)
        .where(eq(documents.processingStatus, 'failed'))
        .limit(batchSize);

      results.analyzed = failedDocuments.length;
      console.log(`[DocumentRecovery] Found ${failedDocuments.length} failed documents to analyze`);

      for (const doc of failedDocuments) {
        try {
          const recovery = await this.analyzeDocumentRecovery(doc);

          if (recovery.isRecoverable) {
            results.recoverable++;

            if (!dryRun) {
              // Apply fixes
              if (recovery.needsUserIdRecovery || recovery.needsPathCorrection) {
                await this.fixDocumentRecord(doc, recovery, systemUserId);
                results.fixed++;
              }

              // Reprocess if possible
              if (recovery.shouldReprocess) {
                await this.reprocessDocument(doc.id, recovery.reprocessStrategy, systemUserId);
                results.reprocessed++;
              }
            }

            console.log(`[DocumentRecovery] Document ${doc.id} (${doc.originalFilename}): ${recovery.recoveryPlan}`);
          } else {
            results.unrecoverable++;
            console.warn(`[DocumentRecovery] Document ${doc.id} unrecoverable: ${recovery.reason}`);
          }

        } catch (error) {
          const errorMessage = `Document ${doc.id} recovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
          results.errors.push(errorMessage);
          console.error(`[DocumentRecovery] ${errorMessage}`);
        }
      }

      console.log(`[DocumentRecovery] Recovery complete:`, results);
      return results;

    } catch (error) {
      const errorMessage = `Document recovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      results.errors.push(errorMessage);
      console.error(`[DocumentRecovery] ${errorMessage}`);
      return results;
    }
  }

  /**
   * Analyze a single document for recovery potential
   */
  private async analyzeDocumentRecovery(doc: any): Promise<{
    isRecoverable: boolean;
    reason?: string;
    recoveryPlan: string;
    needsUserIdRecovery: boolean;
    needsPathCorrection: boolean;
    shouldReprocess: boolean;
    reprocessStrategy: 'full' | 'from_text_extraction' | 'from_chunking' | 'from_embeddings';
  }> {
    const analysis = {
      isRecoverable: false,
      reason: '',
      recoveryPlan: '',
      needsUserIdRecovery: false,
      needsPathCorrection: false,
      shouldReprocess: false,
      reprocessStrategy: 'full' as const
    };

    // Check for missing userId
    if (!doc.uploadedBy || doc.uploadedBy.trim().length === 0) {
      analysis.needsUserIdRecovery = true;
    }

    // Check for legacy file paths
    if (doc.filePath && doc.filePath.startsWith('/google-drive/')) {
      analysis.needsPathCorrection = true;
    }

    // Analyze processing error for recovery strategy
    const error = doc.processingError || '';

    if (error.includes('File not found')) {
      if (analysis.needsPathCorrection) {
        analysis.isRecoverable = true;
        analysis.shouldReprocess = true;
        analysis.reprocessStrategy = 'full';
        analysis.recoveryPlan = 'Fix legacy path and reprocess from download';
      } else {
        analysis.isRecoverable = false;
        analysis.reason = 'File not found and no legacy path to correct';
      }
    } else if (error.includes('Google Drive authentication failed')) {
      if (analysis.needsUserIdRecovery) {
        analysis.isRecoverable = true;
        analysis.shouldReprocess = true;
        analysis.reprocessStrategy = 'full';
        analysis.recoveryPlan = 'Fix missing userId and reprocess from download';
      } else {
        analysis.isRecoverable = false;
        analysis.reason = 'Authentication failed but userId appears valid';
      }
    } else if (error.includes('No chunks provided') || error.includes('No valid chunks found')) {
      // Text extraction may have succeeded but chunking failed
      if (doc.extractedText && doc.extractedText.trim().length > 0) {
        analysis.isRecoverable = true;
        analysis.shouldReprocess = true;
        analysis.reprocessStrategy = 'from_chunking';
        analysis.recoveryPlan = 'Reprocess from chunking stage (text extraction exists)';
      } else {
        analysis.isRecoverable = true;
        analysis.shouldReprocess = true;
        analysis.reprocessStrategy = 'from_text_extraction';
        analysis.recoveryPlan = 'Reprocess from text extraction (file should exist)';
      }
    } else if (error.includes('Embedding generation failed')) {
      analysis.isRecoverable = true;
      analysis.shouldReprocess = true;
      analysis.reprocessStrategy = 'from_embeddings';
      analysis.recoveryPlan = 'Reprocess from embeddings (chunking should exist)';
    } else if (error.includes('Vector storage failed')) {
      analysis.isRecoverable = true;
      analysis.shouldReprocess = true;
      analysis.reprocessStrategy = 'from_embeddings';
      analysis.recoveryPlan = 'Reprocess from embeddings (retry vector storage)';
    } else {
      // Unknown error - attempt basic recovery
      if (analysis.needsUserIdRecovery || analysis.needsPathCorrection) {
        analysis.isRecoverable = true;
        analysis.shouldReprocess = true;
        analysis.reprocessStrategy = 'full';
        analysis.recoveryPlan = 'Fix basic issues and full reprocess';
      } else {
        analysis.isRecoverable = false;
        analysis.reason = `Unknown error type: ${error.substring(0, 100)}...`;
      }
    }

    return analysis;
  }

  /**
   * Fix document record issues (userId, file paths)
   */
  private async fixDocumentRecord(
    doc: any,
    recovery: any,
    systemUserId: string
  ): Promise<void> {
    const updates: any = {
      updatedAt: new Date()
    };

    // Fix missing userId
    if (recovery.needsUserIdRecovery) {
      updates.uploadedBy = systemUserId;
      console.log(`[DocumentRecovery] Fixed missing userId for document ${doc.id}: ${systemUserId}`);
    }

    // Fix legacy file path
    if (recovery.needsPathCorrection && doc.filePath && doc.filePath.startsWith('/google-drive/')) {
      const path = await import('path');
      const fileId = path.basename(doc.filePath);

      // Construct corrected relative path
      const correctedPath = path.join(process.cwd(), 'temp', 'google-drive', doc.id, doc.originalFilename || fileId);
      updates.filePath = correctedPath;
      console.log(`[DocumentRecovery] Fixed legacy path for document ${doc.id}: ${doc.filePath} -> ${correctedPath}`);
    }

    // Reset processing status for reprocessing
    updates.processingStatus = 'pending';
    updates.processingError = null;

    await db
      .update(documents)
      .set(updates)
      .where(eq(documents.id, doc.id));

    console.log(`[DocumentRecovery] Updated document record for ${doc.id}`);
  }

  /**
   * Reprocess document based on recovery strategy
   */
  private async reprocessDocument(
    documentId: string,
    strategy: 'full' | 'from_text_extraction' | 'from_chunking' | 'from_embeddings',
    userId: string
  ): Promise<void> {
    console.log(`[DocumentRecovery] Reprocessing document ${documentId} using strategy: ${strategy}`);

    switch (strategy) {
      case 'full':
        // Complete pipeline reprocessing
        await jobQueue.addJob({
          type: JobType.COMPLETE_DOCUMENT_PIPELINE,
          priority: JobPriority.LOW, // Lower priority for recovery jobs
          payload: {
            documentId,
            userId,
            forceReprocess: true,
            skipSteps: [] // Don't skip any steps
          },
          metadata: {
            documentId,
            userId,
            isRecoveryJob: true,
            originalStrategy: strategy
          }
        });
        break;

      case 'from_text_extraction':
        // Skip download, start from text extraction
        await jobQueue.addJob({
          type: JobType.COMPLETE_DOCUMENT_PIPELINE,
          priority: JobPriority.LOW,
          payload: {
            documentId,
            userId,
            forceReprocess: true,
            skipSteps: ['download']
          },
          metadata: {
            documentId,
            userId,
            isRecoveryJob: true,
            originalStrategy: strategy
          }
        });
        break;

      case 'from_chunking':
        // Skip download and text extraction
        await jobQueue.addJob({
          type: JobType.COMPLETE_DOCUMENT_PIPELINE,
          priority: JobPriority.LOW,
          payload: {
            documentId,
            userId,
            forceReprocess: true,
            skipSteps: ['download', 'extraction']
          },
          metadata: {
            documentId,
            userId,
            isRecoveryJob: true,
            originalStrategy: strategy
          }
        });
        break;

      case 'from_embeddings':
        // Skip to embedding generation
        await jobQueue.addJob({
          type: JobType.COMPLETE_DOCUMENT_PIPELINE,
          priority: JobPriority.LOW,
          payload: {
            documentId,
            userId,
            forceReprocess: true,
            skipSteps: ['download', 'extraction', 'metadata', 'chunking']
          },
          metadata: {
            documentId,
            userId,
            isRecoveryJob: true,
            originalStrategy: strategy
          }
        });
        break;
    }

    console.log(`[DocumentRecovery] Queued recovery job for document ${documentId} (strategy: ${strategy})`);
  }

  /**
   * Quick recovery for documents with missing userId only
   */
  async quickUserIdRecovery(systemUserId: string = 'system-recovery'): Promise<{
    fixed: number;
    errors: string[];
  }> {
    console.log(`[DocumentRecovery] Starting quick userId recovery`);

    const results = {
      fixed: 0,
      errors: [] as string[]
    };

    try {
      // Find documents with missing userId
      const documentsWithMissingUserId = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.processingStatus, 'failed'),
            isNull(documents.uploadedBy)
          )
        );

      console.log(`[DocumentRecovery] Found ${documentsWithMissingUserId.length} documents with missing userId`);

      for (const doc of documentsWithMissingUserId) {
        try {
          await db
            .update(documents)
            .set({
              uploadedBy: systemUserId,
              processingStatus: 'pending',
              processingError: null,
              updatedAt: new Date()
            })
            .where(eq(documents.id, doc.id));

          results.fixed++;
          console.log(`[DocumentRecovery] Fixed userId for document ${doc.id}: ${doc.originalFilename}`);

        } catch (error) {
          const errorMessage = `Failed to fix userId for document ${doc.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          results.errors.push(errorMessage);
          console.error(`[DocumentRecovery] ${errorMessage}`);
        }
      }

      console.log(`[DocumentRecovery] Quick userId recovery complete: ${results.fixed} fixed, ${results.errors.length} errors`);
      return results;

    } catch (error) {
      const errorMessage = `Quick userId recovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      results.errors.push(errorMessage);
      console.error(`[DocumentRecovery] ${errorMessage}`);
      return results;
    }
  }

  /**
   * Get recovery statistics
   */
  async getRecoveryStats(): Promise<{
    totalFailed: number;
    missingUserId: number;
    legacyPaths: number;
    recentFailures: number;
    oldFailures: number;
  }> {
    const [
      totalFailedResult,
      missingUserIdResult,
      legacyPathsResult,
      recentFailuresResult,
      oldFailuresResult
    ] = await Promise.all([
      // Total failed documents
      db.select().from(documents).where(eq(documents.processingStatus, 'failed')),

      // Documents with missing userId
      db.select().from(documents).where(
        and(
          eq(documents.processingStatus, 'failed'),
          isNull(documents.uploadedBy)
        )
      ),

      // Documents with legacy paths
      db.select().from(documents).where(
        and(
          eq(documents.processingStatus, 'failed'),
          like(documents.filePath, '/google-drive/%')
        )
      ),

      // Recent failures (last 24 hours)
      db.select().from(documents).where(
        and(
          eq(documents.processingStatus, 'failed'),
          eq(documents.updatedAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
        )
      ),

      // Older failures (more than 24 hours)
      db.select().from(documents).where(
        and(
          eq(documents.processingStatus, 'failed'),
          eq(documents.updatedAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
        )
      )
    ]);

    return {
      totalFailed: totalFailedResult.length,
      missingUserId: missingUserIdResult.length,
      legacyPaths: legacyPathsResult.length,
      recentFailures: recentFailuresResult.length,
      oldFailures: oldFailuresResult.length
    };
  }
}

// Export singleton instance
export const documentRecoveryService = new DocumentRecoveryService();