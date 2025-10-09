const AWS = require('aws-sdk');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Update processing step status in database
async function updateProcessingStep(executionArn, stepName, status, stepOrder, inputData = null, outputData = null, errorDetails = null) {
  const query = `
    INSERT INTO processing_steps (execution_arn, step_name, step_order, status, input_data, output_data, error_details, started_at, completed_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
    ON CONFLICT (execution_arn, step_order)
    DO UPDATE SET
      status = $4,
      output_data = $6,
      error_details = $7,
      completed_at = $8
  `;

  const completedAt = status === 'SUCCEEDED' || status === 'FAILED' ? new Date() : null;

  await pool.query(query, [
    executionArn,
    stepName,
    stepOrder,
    status,
    inputData,
    outputData,
    errorDetails,
    completedAt
  ]);
}

// Insert or update document record
async function upsertDocument(client, documentData) {
  const {
    documentId,
    originalFilename,
    filePath,
    fileSizeBytes,
    mimeType,
    metadata,
    extractedText,
    textLength,
    pageCount,
    wordCount,
    extractionMethod,
    ocrConfidence,
    processingDurationMs,
    language,
    hasImages,
    hasTables,
    uploadedBy = null,
    documentType = 'inci', // Default document type
    documentCategory = 'other'
  } = documentData;

  const query = `
    INSERT INTO documents (
      id, original_filename, file_path, file_size_bytes, mime_type, metadata,
      extracted_text, text_length, page_count, word_count, extraction_method,
      ocr_confidence, processing_duration_ms, language, has_images, has_tables,
      uploaded_by, document_type, document_category, processing_status,
      ocr_completed_at, processed_date, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
      $17, $18, $19, 'processing', NOW(), NOW(), NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      extracted_text = $7,
      text_length = $8,
      page_count = $9,
      word_count = $10,
      extraction_method = $11,
      ocr_confidence = $12,
      processing_duration_ms = $13,
      language = $14,
      has_images = $15,
      has_tables = $16,
      processing_status = 'processing',
      ocr_completed_at = NOW(),
      processed_date = NOW(),
      updated_at = NOW()
    RETURNING id
  `;

  const values = [
    documentId, originalFilename, filePath, fileSizeBytes, mimeType,
    JSON.stringify(metadata), extractedText, textLength, pageCount, wordCount,
    extractionMethod, ocrConfidence, processingDurationMs, language,
    hasImages, hasTables, uploadedBy, documentType, documentCategory
  ];

  const result = await client.query(query, values);
  return result.rows[0];
}

// Delete existing chunks for the document (for reprocessing scenarios)
async function deleteExistingChunks(client, documentId) {
  const query = 'DELETE FROM document_chunks WHERE document_id = $1';
  const result = await client.query(query, [documentId]);
  return result.rowCount;
}

// Insert document chunks with embeddings
async function insertDocumentChunks(client, documentId, chunks) {
  if (!chunks || chunks.length === 0) {
    return { inserted: 0, failed: 0 };
  }

  let inserted = 0;
  let failed = 0;
  const errors = [];

  // Process chunks in batches to avoid overwhelming the database
  const batchSize = 10;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);

    const values = [];
    const placeholders = [];
    let paramIndex = 1;

    batch.forEach((chunk, batchIdx) => {
      const chunkIndex = i + batchIdx;

      // Validate chunk data
      if (!chunk.chunkText || typeof chunk.chunkText !== 'string') {
        console.error(`Invalid chunk text at index ${chunkIndex}:`, chunk);
        failed++;
        return;
      }

      if (!chunk.embedding || !Array.isArray(chunk.embedding)) {
        console.error(`Invalid embedding at index ${chunkIndex}:`, chunk);
        failed++;
        return;
      }

      // Convert embedding array to PostgreSQL vector format
      const embeddingVector = `[${chunk.embedding.join(',')}]`;

      // Prepare chunk metadata
      const chunkMetadata = {
        originalIndex: chunkIndex,
        embeddingModel: chunk.model || 'amazon.titan-embed-text-v2:0',
        dimensions: chunk.embedding.length,
        confidence: chunk.confidence || null,
        tokenCount: chunk.tokenCount || null,
        ...chunk.metadata
      };

      placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5})`);
      values.push(
        uuidv4(), // id
        documentId, // document_id
        chunkIndex, // chunk_index
        chunk.chunkText, // content
        embeddingVector, // embedding as vector
        JSON.stringify(chunkMetadata) // metadata
      );
      paramIndex += 6;
    });

    if (placeholders.length === 0) {
      continue; // Skip this batch if all chunks were invalid
    }

    const query = `
      INSERT INTO document_chunks (id, document_id, chunk_index, content, embedding, metadata, created_at)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (document_id, chunk_index) DO UPDATE SET
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        metadata = EXCLUDED.metadata,
        created_at = NOW()
    `;

    try {
      const result = await client.query(query, values);
      inserted += result.rowCount;
      console.log(`Inserted batch ${Math.floor(i/batchSize) + 1}: ${result.rowCount} chunks`);
    } catch (error) {
      console.error(`Failed to insert batch ${Math.floor(i/batchSize) + 1}:`, error);
      failed += batch.length;
      errors.push({
        batchIndex: Math.floor(i/batchSize) + 1,
        error: error.message,
        chunkIndexes: batch.map((_, idx) => i + idx)
      });
    }
  }

  return { inserted, failed, errors };
}

// Update document status to completed
async function markDocumentCompleted(client, documentId, stats) {
  const query = `
    UPDATE documents
    SET
      processing_status = 'completed',
      embedding_completed_at = NOW(),
      token_count = $2,
      indexed_at = NOW(),
      updated_at = NOW()
    WHERE id = $1
    RETURNING processing_status, embedding_completed_at
  `;

  const result = await client.query(query, [documentId, stats.totalTokens || null]);
  return result.rows[0];
}

// Calculate processing statistics
function calculateProcessingStats(documentData, chunks, insertionResult) {
  const stats = {
    documentId: documentData.documentId,
    totalChunks: chunks ? chunks.length : 0,
    chunksInserted: insertionResult.inserted,
    chunksFailed: insertionResult.failed,
    successRate: chunks && chunks.length > 0 ? (insertionResult.inserted / chunks.length) * 100 : 0,
    totalTokens: chunks ? chunks.reduce((sum, chunk) => sum + (chunk.tokenCount || 0), 0) : 0,
    averageEmbeddingDimensions: chunks && chunks.length > 0 && chunks[0].embedding ? chunks[0].embedding.length : 0,
    textLength: documentData.textLength,
    wordCount: documentData.wordCount,
    processingDurationMs: documentData.processingDurationMs
  };

  return stats;
}

// Validate input data
function validateInput(event) {
  const errors = [];

  if (!event.documentId) {
    errors.push('Document ID is required');
  }

  if (!event.documentData) {
    errors.push('Document data is required');
  } else {
    if (!event.documentData.originalFilename) {
      errors.push('Original filename is required');
    }
    if (!event.documentData.filePath) {
      errors.push('File path is required');
    }
  }

  if (!event.chunks || !Array.isArray(event.chunks)) {
    errors.push('Chunks array is required');
  } else if (event.chunks.length === 0) {
    errors.push('At least one chunk is required');
  }

  return errors;
}

// Main Lambda handler
exports.handler = async (event) => {
  const startTime = Date.now();
  console.log('Database insertion event:', JSON.stringify(event, null, 2));

  const { executionId, documentId, documentData, chunks } = event;
  const executionArn = `arn:aws:states:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:execution:DocumentProcessingWorkflow:${executionId}`;

  try {
    // Update step status to RUNNING
    await updateProcessingStep(executionArn, 'DatabaseInsertion', 'RUNNING', 6, event);

    // Validate input
    const validationErrors = validateInput(event);
    if (validationErrors.length > 0) {
      throw new Error(`Input validation failed: ${validationErrors.join(', ')}`);
    }

    console.log(`Starting database insertion for document ${documentId} with ${chunks.length} chunks`);

    // Start database transaction
    const client = await pool.connect();
    let result;

    try {
      await client.query('BEGIN');

      // Ensure document data includes required fields
      const completeDocumentData = {
        documentId,
        ...documentData,
        extractionMethod: documentData.extractionMethod || 'mistral_ocr'
      };

      // 1. Insert/update document record
      console.log('Inserting/updating document record...');
      const documentResult = await upsertDocument(client, completeDocumentData);
      console.log('Document upserted:', documentResult);

      // 2. Delete existing chunks (for reprocessing scenarios)
      const deletedChunks = await deleteExistingChunks(client, documentId);
      if (deletedChunks > 0) {
        console.log(`Deleted ${deletedChunks} existing chunks for reprocessing`);
      }

      // 3. Insert document chunks with embeddings
      console.log('Inserting document chunks...');
      const insertionResult = await insertDocumentChunks(client, documentId, chunks);
      console.log('Chunk insertion result:', insertionResult);

      // 4. Update document status to completed
      const stats = calculateProcessingStats(completeDocumentData, chunks, insertionResult);
      const documentUpdateResult = await markDocumentCompleted(client, documentId, stats);
      console.log('Document marked as completed:', documentUpdateResult);

      // Commit transaction
      await client.query('COMMIT');

      // Prepare the result
      result = {
        documentId,
        stats,
        insertionResult,
        documentStatus: documentUpdateResult,
        processingTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };

      console.log(`Database insertion completed successfully for document ${documentId}:`, {
        chunksInserted: insertionResult.inserted,
        chunksFailed: insertionResult.failed,
        successRate: `${stats.successRate.toFixed(1)}%`,
        totalTokens: stats.totalTokens
      });

    } catch (error) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // Update step status to SUCCEEDED
    await updateProcessingStep(executionArn, 'DatabaseInsertion', 'SUCCEEDED', 6, event, result);

    return result;

  } catch (error) {
    console.error('Database insertion error:', error);

    const errorDetails = {
      message: error.message,
      stack: error.stack,
      processingTimeMs: Date.now() - startTime
    };

    // Update step status to FAILED
    try {
      await updateProcessingStep(executionArn, 'DatabaseInsertion', 'FAILED', 6, event, null, errorDetails);
    } catch (dbError) {
      console.error('Failed to update step status:', dbError);
    }

    throw error;
  }
};