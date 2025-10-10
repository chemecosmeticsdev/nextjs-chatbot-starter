const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Update processing step status in database
async function updateProcessingStep(executionArn, stepName, status, stepOrder, inputData = null, outputData = null, errorDetails = null) {
  try {
    // First, ensure execution record exists in step_function_executions table
    await ensureExecutionRecord(executionArn, inputData);

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
  } catch (error) {
    console.error('Failed to update processing step:', error);
    // Don't throw error to avoid breaking the pipeline
    console.log('Continuing pipeline execution despite tracking failure');
  }
}

// Ensure execution record exists in step_function_executions table
async function ensureExecutionRecord(executionArn, inputData = null) {
  try {
    const checkQuery = 'SELECT execution_arn FROM step_function_executions WHERE execution_arn = $1';
    const existingRecord = await pool.query(checkQuery, [executionArn]);

    if (existingRecord.rows.length === 0) {
      // Extract document_id from input data if available
      const documentId = inputData?.documentId || null;
      const s3Bucket = inputData?.s3Bucket || null;
      const s3Key = inputData?.s3Key || null;

      const insertQuery = `
        INSERT INTO step_function_executions (execution_arn, document_id, user_id, status, s3_bucket, s3_key, input_data, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (execution_arn) DO NOTHING
      `;

      await pool.query(insertQuery, [
        executionArn,
        documentId,
        '00000000-0000-0000-0000-000000000000', // Default user ID for automated processing
        'RUNNING',
        s3Bucket,
        s3Key,
        inputData
      ]);

      console.log(`Created execution record for: ${executionArn}`);
    }
  } catch (error) {
    console.error('Failed to ensure execution record:', error);
    // Don't throw - allow processing to continue
  }
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
    documentCategory = 'other',
    fileHash = null // Add file_hash parameter for deduplication
  } = documentData;

  const query = `
    INSERT INTO documents (
      id, original_filename, file_path, file_size_bytes, mime_type, metadata,
      extracted_text, text_length, page_count, word_count, extraction_method,
      ocr_confidence, processing_duration_ms, language, has_images, has_tables,
      uploaded_by, document_type, document_category, file_hash, processing_status,
      ocr_completed_at, processed_date, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
      $17, $18, $19, $20, 'processing', NOW(), NOW(), NOW(), NOW()
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
      file_hash = $20,
      processing_status = 'processing',
      ocr_completed_at = NOW(),
      processed_date = NOW(),
      updated_at = NOW()
    RETURNING id
  `;

  // Convert confidence from decimal (0.95) to percentage integer (95) for database compatibility
  // Handle both numeric and string inputs for robustness
  let confidenceAsPercentage = null;
  if (ocrConfidence != null) {
    const numericConfidence = typeof ocrConfidence === 'string' ? parseFloat(ocrConfidence) : ocrConfidence;
    confidenceAsPercentage = !isNaN(numericConfidence) ? Math.round(numericConfidence * 100) : null;
    console.log(`OCR confidence conversion: ${ocrConfidence} (${typeof ocrConfidence}) -> ${confidenceAsPercentage}`);
  }

  const values = [
    documentId, originalFilename, filePath, fileSizeBytes, mimeType,
    JSON.stringify(metadata), extractedText, textLength, pageCount, wordCount,
    extractionMethod, confidenceAsPercentage, processingDurationMs, language,
    hasImages, hasTables, uploadedBy, documentType, documentCategory, fileHash
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

// Transform chunks from Step Functions format to array format
function transformChunksFromStepFunctions(chunksInput) {
  // Handle both array format (legacy) and object format (from Step Functions)
  if (Array.isArray(chunksInput)) {
    return chunksInput; // Already in correct format
  }

  // Transform from Step Functions object format to array format
  if (chunksInput && typeof chunksInput === 'object') {
    const {
      chunkText = [],
      chunkIndex = [],
      embedding = [],
      tokenCount = [],
      confidence = 0.95,
      model = 'amazon.titan-embed-text-v2:0',
      metadata = []
    } = chunksInput;

    // Ensure all arrays have the same length
    const maxLength = Math.max(
      chunkText.length,
      chunkIndex.length,
      embedding.length,
      tokenCount.length
    );

    const transformedChunks = [];
    for (let i = 0; i < maxLength; i++) {
      transformedChunks.push({
        chunkText: chunkText[i] || '',
        chunkIndex: chunkIndex[i] || i,
        embedding: embedding[i] || [],
        tokenCount: tokenCount[i] || null,
        confidence: Array.isArray(confidence) ? confidence[i] : confidence,
        model: Array.isArray(model) ? model[i] : model,
        metadata: Array.isArray(metadata) ? metadata[i] : metadata || {}
      });
    }

    return transformedChunks;
  }

  return [];
}

// Insert document chunks with embeddings
async function insertDocumentChunks(client, documentId, chunksInput) {
  // Transform chunks to the expected array format
  const chunks = transformChunksFromStepFunctions(chunksInput);

  if (!chunks || chunks.length === 0) {
    return { inserted: 0, failed: 0 };
  }

  let inserted = 0;
  let failed = 0;
  const errors = [];

  // Check transaction health before starting
  try {
    await client.query('SELECT 1');
  } catch (error) {
    console.error('Transaction is not healthy, cannot proceed with chunk insertion:', error);
    throw error;
  }

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

      placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`);
      values.push(
        documentId, // document_id
        chunkIndex, // chunk_index
        chunk.chunkText, // content
        embeddingVector, // embedding as vector
        JSON.stringify(chunkMetadata) // metadata
      );
      paramIndex += 5;
    });

    if (placeholders.length === 0) {
      continue; // Skip this batch if all chunks were invalid
    }

    const query = `
      INSERT INTO document_chunks (document_id, chunk_index, content, embedding, metadata)
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

      // Check if this is a transaction-aborting error
      if (error.message && (
        error.message.includes('transaction is aborted') ||
        error.message.includes('invalid input syntax') ||
        error.message.includes('violates') ||
        error.message.includes('constraint') ||
        error.message.includes('column') ||
        error.message.includes('relation') ||
        error.message.includes('syntax error') ||
        error.message.includes('duplicate key') ||
        error.message.includes('null value') ||
        error.message.includes('character varying') ||
        error.message.includes('integer out of range') ||
        error.code === '22P02' || // Invalid text representation
        error.code === '23505' || // Unique violation
        error.code === '23503' || // Foreign key violation
        error.code === '23514' || // Check violation
        error.code === '23502' || // Not null violation
        error.code === '42703' || // Undefined column
        error.code === '42P01' || // Undefined table
        error.code === '42601' || // Syntax error
        error.code === '22003' || // Numeric value out of range
        error.code === '08P01'    // Protocol violation
      )) {
        // This is a critical error that aborts the transaction
        console.error('Critical database error detected, aborting transaction');
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          detail: error.detail,
          hint: error.hint
        });
        throw error;
      }

      // Check if this has a PostgreSQL error code (indicating a database error)
      if (error.code && typeof error.code === 'string' && (
        error.code.startsWith('22') || // Data exception
        error.code.startsWith('23') || // Integrity constraint violation
        error.code.startsWith('42') || // Syntax error or access rule violation
        error.code.startsWith('08') || // Connection exception
        error.code.startsWith('0A') || // Feature not supported
        error.code.startsWith('P0')    // PL/pgSQL error
      )) {
        console.error('Unhandled PostgreSQL error detected, aborting transaction');
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          detail: error.detail,
          hint: error.hint,
          where: error.where
        });
        throw error;
      }

      // Non-critical error, continue with next batch
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

  if (!event.chunks) {
    errors.push('Chunks data is required');
  } else {
    // Validate chunks (can be array or object format)
    const transformedChunks = transformChunksFromStepFunctions(event.chunks);
    if (transformedChunks.length === 0) {
      errors.push('At least one chunk is required');
    }
  }

  return errors;
}

// Main Lambda handler
exports.handler = async (event) => {
  const startTime = Date.now();
  console.log('Database insertion event:', JSON.stringify(event, null, 2));

  const {
    executionId,
    executionArn,
    documentId,
    documentData,
    chunks
  } = event;

  // Use provided execution ARN or construct fallback for backward compatibility
  const finalExecutionArn = executionArn || `arn:aws:states:${process.env.DEFAULT_REGION}:${process.env.ACCOUNT_ID}:execution:DocumentProcessingPipeline:${executionId}`;

  console.log(`Processing document ${documentId} with execution ARN: ${finalExecutionArn}`);

  try {
    // Update step status to RUNNING
    await updateProcessingStep(finalExecutionArn, 'DatabaseInsertion', 'RUNNING', 6, event);

    // Validate input
    const validationErrors = validateInput(event);
    if (validationErrors.length > 0) {
      throw new Error(`Input validation failed: ${validationErrors.join(', ')}`);
    }

    // Transform chunks to get proper count for logging
    const chunksForLogging = transformChunksFromStepFunctions(chunks);
    console.log(`Starting database insertion for document ${documentId} with ${chunksForLogging.length} chunks`);

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
      // Check transaction state before proceeding
      try {
        await client.query('SELECT 1');
      } catch (error) {
        console.error('Transaction is aborted, cannot mark document as completed:', error);
        throw new Error(`Transaction aborted during chunk insertion: ${error.message}`);
      }

      // Transform chunks to array format for stats calculation
      const transformedChunks = transformChunksFromStepFunctions(chunks);
      const stats = calculateProcessingStats(completeDocumentData, transformedChunks, insertionResult);
      console.log('Attempting to mark document as completed with stats:', {
        documentId,
        totalChunks: stats.totalChunks,
        chunksInserted: stats.chunksInserted,
        chunksFailed: stats.chunksFailed
      });

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
    await updateProcessingStep(finalExecutionArn, 'DatabaseInsertion', 'SUCCEEDED', 6, event, result);

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
      await updateProcessingStep(finalExecutionArn, 'DatabaseInsertion', 'FAILED', 6, event, null, errorDetails);
    } catch (dbError) {
      console.error('Failed to update step status:', dbError);
    }

    throw error;
  }
};