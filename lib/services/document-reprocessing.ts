import { db } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { jobQueue, JobType, JobPriority } from './job-queue';

/**
 * Document Reprocessing Service
 *
 * Safely restarts document processing for recovered documents
 * Uses enhanced pipeline with circuit breaker and defensive error handling
 */
export class DocumentReprocessingService {

  /**
   * Safely reprocess all pending documents in batches
   */
  async reprocessPendingDocuments(options: {
    batchSize?: number;
    delayBetweenBatches?: number;
    dryRun?: boolean;
  } = {}): Promise<{
    totalPending: number;
    processed: number;
    queued: number;
    errors: string[];
  }> {
    const {
      batchSize = 10,
      delayBetweenBatches = 5000, // 5 seconds between batches
      dryRun = false
    } = options;

    console.log(`[DocumentReprocessing] Starting safe reprocessing (batchSize: ${batchSize}, dryRun: ${dryRun})`);

    const results = {
      totalPending: 0,
      processed: 0,
      queued: 0,
      errors: [] as string[]
    };

    try {
      // Get all pending documents
      const pendingDocuments = await db
        .select()
        .from(documents)
        .where(eq(documents.processingStatus, 'pending'));

      results.totalPending = pendingDocuments.length;
      console.log(`[DocumentReprocessing] Found ${pendingDocuments.length} pending documents`);

      if (pendingDocuments.length === 0) {
        console.log('[DocumentReprocessing] No pending documents to process');
        return results;
      }

      // Process in batches to avoid overwhelming the system
      for (let i = 0; i < pendingDocuments.length; i += batchSize) {
        const batch = pendingDocuments.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(pendingDocuments.length / batchSize);

        console.log(`[DocumentReprocessing] Processing batch ${batchNumber}/${totalBatches} (${batch.length} documents)`);

        for (const doc of batch) {
          try {
            results.processed++;

            if (!dryRun) {
              // Queue document for complete pipeline reprocessing
              const jobId = await this.queueDocumentReprocessing(doc);
              results.queued++;
              console.log(`[DocumentReprocessing] Queued document ${doc.id} (${doc.originalFilename}) - Job: ${jobId}`);
            } else {
              console.log(`[DocumentReprocessing] [DRY RUN] Would queue document ${doc.id} (${doc.originalFilename})`);
            }

          } catch (error) {
            const errorMessage = `Failed to queue document ${doc.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            results.errors.push(errorMessage);
            console.error(`[DocumentReprocessing] ${errorMessage}`);
          }
        }

        // Delay between batches to prevent overwhelming the job queue
        if (i + batchSize < pendingDocuments.length) {
          console.log(`[DocumentReprocessing] Waiting ${delayBetweenBatches}ms before next batch...`);
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }

      console.log(`[DocumentReprocessing] Reprocessing complete:`, results);
      return results;

    } catch (error) {
      const errorMessage = `Document reprocessing failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      results.errors.push(errorMessage);
      console.error(`[DocumentReprocessing] ${errorMessage}`);
      return results;
    }
  }

  /**
   * Queue a single document for reprocessing using enhanced pipeline
   */
  private async queueDocumentReprocessing(doc: any): Promise<string> {
    // Validate document has required fields
    if (!doc.id) {
      throw new Error('Document missing ID');
    }

    if (!doc.uploadedBy) {
      throw new Error('Document missing uploadedBy');
    }

    if (!doc.googleDriveFileId && !doc.fileUrl) {
      console.warn(`[DocumentReprocessing] Document ${doc.id} has no Google Drive file ID or URL - will attempt using existing file path`);
    }

    // Queue complete document pipeline with enhanced error handling
    const jobId = await jobQueue.addJob({
      type: JobType.COMPLETE_DOCUMENT_PIPELINE,
      priority: JobPriority.LOW, // Use low priority for recovery jobs
      payload: {
        documentId: doc.id,
        userId: doc.uploadedBy,
        googleDriveFileId: doc.googleDriveFileId,
        fileUrl: doc.fileUrl,
        forceReprocess: true,
        skipSteps: [] // Don't skip any steps to ensure complete reprocessing
      },
      metadata: {
        documentId: doc.id,
        userId: doc.uploadedBy,
        isRecoveryJob: true,
        originalFilename: doc.originalFilename,
        recoveryTimestamp: new Date().toISOString()
      }
    });

    return jobId;
  }

  /**
   * Monitor reprocessing progress
   */
  async getReprocessingProgress(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
  }> {
    const statusCounts = await db
      .select()
      .from(documents);

    const stats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      total: statusCounts.length
    };

    statusCounts.forEach(doc => {
      switch (doc.processingStatus) {
        case 'pending':
          stats.pending++;
          break;
        case 'processing':
          stats.processing++;
          break;
        case 'completed':
          stats.completed++;
          break;
        case 'failed':
          stats.failed++;
          break;
      }
    });

    return stats;
  }

  /**
   * Emergency stop - pause all document processing
   */
  async emergencyStop(): Promise<void> {
    console.log('🚨 [DocumentReprocessing] EMERGENCY STOP - Pausing document processing');

    // Mark all pending documents as paused
    await db
      .update(documents)
      .set({
        processingStatus: 'paused' as any,
        processingError: 'Processing paused due to emergency stop',
        updatedAt: new Date()
      })
      .where(eq(documents.processingStatus, 'pending'));

    console.log('✅ [DocumentReprocessing] All pending documents paused');
  }

  /**
   * Resume processing after emergency stop
   */
  async resumeProcessing(): Promise<number> {
    console.log('[DocumentReprocessing] Resuming processing...');

    const result = await db
      .update(documents)
      .set({
        processingStatus: 'pending',
        processingError: null,
        updatedAt: new Date()
      })
      .where(eq(documents.processingStatus, 'paused' as any));

    console.log(`✅ [DocumentReprocessing] Resumed processing for documents`);
    return 0; // Drizzle doesn't return affected count easily
  }
}

export const documentReprocessingService = new DocumentReprocessingService();