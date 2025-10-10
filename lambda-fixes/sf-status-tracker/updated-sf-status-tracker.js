/**
 * Step Functions Status Tracker - Fixed Version
 * Tracks pipeline execution status using existing database schema
 */

const { Client } = require('pg');

exports.handler = async (event) => {
  const startTime = Date.now();
  console.log('Status Tracker started:', JSON.stringify(event, null, 2));

  let client;

  try {
    const {
      executionId,
      documentId,
      fileName,
      status,
      ocrResult,
      enhancedMetadata,
      chunkingResult,
      embeddingResult,
      insertionResult,
      error
    } = event;

    // Validate required parameters
    if (!executionId || !documentId) {
      throw new Error('Missing required parameters: executionId, documentId');
    }

    // Construct execution ARN from executionId
    const awsRegion = process.env.DEFAULT_REGION || process.env.AWS_REGION || 'ap-southeast-1';
    const executionArn = `arn:aws:states:${awsRegion}:${process.env.ACCOUNT_ID}:execution:DocumentProcessingPipeline:${executionId}`;

    console.log(`Tracking status for execution: ${executionId}, document: ${fileName} (${documentId})`);
    console.log(`Execution ARN: ${executionArn}`);
    console.log(`Current status: ${status}`);

    // Initialize database connection
    client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();
    console.log('Connected to Neon PostgreSQL database');

    // Track execution status using existing database schema
    const trackingResult = await trackExecutionStatus(
      client,
      executionArn,
      executionId,
      documentId,
      fileName,
      status,
      event,
      error
    );

    // Generate execution summary
    const executionSummary = generateExecutionSummary(event, trackingResult);

    // Prepare response
    const response = {
      ...event,
      trackingResult: {
        executionId: executionId,
        executionArn: executionArn,
        documentId: documentId,
        fileName: fileName,
        finalStatus: status,
        trackingUpdated: trackingResult.updated,
        logEntryCreated: trackingResult.logCreated,
        executionSummary: executionSummary,
        processingTime: Date.now() - startTime,
        trackingMetadata: {
          trackedAt: new Date().toISOString(),
          trackingVersion: '2.0.0',
          databaseUpdated: trackingResult.updated
        }
      },
      // Update execution status
      status: status === 'INSERTION_COMPLETED' ? 'PIPELINE_COMPLETED' : status,
      updatedAt: new Date().toISOString()
    };

    console.log(`Status tracking completed for ${fileName}. Final status: ${response.status}`);
    return response;

  } catch (error) {
    console.error('Status tracking failed:', error);

    // Return error response that Step Functions can handle
    return {
      ...event,
      status: 'TRACKING_FAILED',
      error: {
        type: error.name || 'TrackingError',
        message: error.message,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - startTime
      },
      updatedAt: new Date().toISOString()
    };
  } finally {
    if (client) {
      await client.end();
      console.log('Database connection closed');
    }
  }
};

/**
 * Track execution status using existing database schema
 */
async function trackExecutionStatus(client, executionArn, executionId, documentId, fileName, status, eventData, errorData) {
  try {
    // Insert or update execution record in step_function_executions table
    const executionResult = await upsertExecutionRecord(
      client,
      executionArn,
      executionId,
      documentId,
      fileName,
      status,
      eventData,
      errorData
    );

    // Create processing step entry in processing_steps table
    const stepResult = await createProcessingStepEntry(
      client,
      executionArn,
      status,
      eventData,
      errorData
    );

    return {
      updated: executionResult.updated,
      logCreated: stepResult.created,
      executionArn: executionArn
    };

  } catch (error) {
    console.error('Database tracking failed:', error);
    throw new Error(`Database tracking failed: ${error.message}`);
  }
}

/**
 * Insert or update execution record in step_function_executions table
 */
async function upsertExecutionRecord(client, executionArn, executionId, documentId, fileName, status, eventData, errorData) {
  try {
    // Check if execution exists
    const existingExecution = await client.query(
      'SELECT execution_arn, created_at FROM step_function_executions WHERE execution_arn = $1',
      [executionArn]
    );

    const isCompleted = ['PIPELINE_COMPLETED', 'INSERTION_COMPLETED', 'OCR_FAILED', 'METADATA_ENHANCEMENT_FAILED', 'CHUNKING_FAILED', 'EMBEDDING_FAILED', 'INSERTION_FAILED'].includes(status);
    const completedAt = isCompleted ? new Date() : null;

    // Calculate processing duration if completing
    const durationMs = isCompleted && existingExecution.rows.length > 0
      ? Date.now() - new Date(existingExecution.rows[0].created_at).getTime()
      : null;

    if (existingExecution.rows.length > 0) {
      // Update existing execution
      await client.query(`
        UPDATE step_function_executions SET
          status = $2,
          current_step = $3,
          updated_at = $4,
          completed_at = $5,
          error_details = $6,
          output_data = $7,
          duration_ms = $8
        WHERE execution_arn = $1
      `, [
        executionArn,
        status,
        getStepNameFromStatus(status),
        new Date(),
        completedAt,
        errorData ? JSON.stringify(errorData) : null,
        JSON.stringify(generateOutputData(eventData)),
        durationMs
      ]);

      console.log(`Updated execution record: ${executionArn}`);
      return { updated: true, created: false };

    } else {
      // Insert new execution record
      // Note: We need to create a document record first if it doesn't exist
      await ensureDocumentExists(client, documentId, fileName);

      await client.query(`
        INSERT INTO step_function_executions (
          execution_arn, document_id, user_id, status, current_step,
          input_data, output_data, error_details, duration_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        executionArn,
        documentId,
        await getDefaultUserId(client), // Get a default user ID
        status,
        getStepNameFromStatus(status),
        JSON.stringify(eventData),
        JSON.stringify(generateOutputData(eventData)),
        errorData ? JSON.stringify(errorData) : null,
        durationMs
      ]);

      console.log(`Created execution record: ${executionArn}`);
      return { updated: true, created: true };
    }

  } catch (error) {
    console.error('Failed to upsert execution record:', error);
    throw error;
  }
}

/**
 * Create processing step entry in processing_steps table
 */
async function createProcessingStepEntry(client, executionArn, status, eventData, errorData) {
  try {
    const stepName = getStepNameFromStatus(status);
    const stepOrder = getStepOrderFromStatus(status);
    const processingTime = getProcessingTimeFromEvent(eventData);

    // Use ON CONFLICT to handle duplicate step orders
    await client.query(`
      INSERT INTO processing_steps (
        execution_arn, step_name, step_order, status,
        input_data, output_data, error_details, duration_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (execution_arn, step_order)
      DO UPDATE SET
        status = $4,
        output_data = $6,
        error_details = $7,
        duration_ms = $8,
        completed_at = CASE WHEN $4 IN ('SUCCEEDED', 'FAILED') THEN NOW() ELSE processing_steps.completed_at END
    `, [
      executionArn,
      stepName,
      stepOrder,
      status.includes('FAILED') ? 'FAILED' : 'SUCCEEDED',
      JSON.stringify(eventData),
      JSON.stringify(generateStepOutput(eventData, status)),
      errorData ? JSON.stringify(errorData) : null,
      processingTime
    ]);

    console.log(`Created/Updated processing step entry: ${stepName} (order: ${stepOrder})`);
    return { created: true };

  } catch (error) {
    console.error('Failed to create processing step entry:', error);
    return { created: false };
  }
}

/**
 * Ensure document exists in documents table
 */
async function ensureDocumentExists(client, documentId, fileName) {
  try {
    // Check if document exists
    const existing = await client.query(
      'SELECT id FROM documents WHERE id = $1',
      [documentId]
    );

    if (existing.rows.length === 0) {
      // Create minimal document record
      await client.query(`
        INSERT INTO documents (
          id, filename, file_type, file_size, status, uploaded_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO NOTHING
      `, [
        documentId,
        fileName,
        'application/octet-stream', // Default type
        0, // Unknown size
        'processing',
        await getDefaultUserId(client)
      ]);

      console.log(`Created document record: ${documentId}`);
    }
  } catch (error) {
    console.error('Failed to ensure document exists:', error);
    // Don't throw - this is not critical for tracking
  }
}

/**
 * Get default user ID for system operations
 */
async function getDefaultUserId(client) {
  try {
    // Try to get a system user or admin user
    const result = await client.query(
      "SELECT id FROM users WHERE email LIKE '%admin%' OR email LIKE '%system%' LIMIT 1"
    );

    if (result.rows.length > 0) {
      return result.rows[0].id;
    }

    // Fallback: get any user
    const fallback = await client.query('SELECT id FROM users LIMIT 1');
    if (fallback.rows.length > 0) {
      return fallback.rows[0].id;
    }

    // Last resort: create a system user
    const systemUserId = require('crypto').randomUUID();
    await client.query(`
      INSERT INTO users (id, email, name, role)
      VALUES ($1, 'system@stepfunctions.local', 'Step Functions System', 'admin')
      ON CONFLICT (email) DO NOTHING
    `, [systemUserId]);

    return systemUserId;

  } catch (error) {
    console.error('Failed to get default user ID:', error);
    // Return a random UUID as last resort
    return require('crypto').randomUUID();
  }
}

/**
 * Generate output data from event data
 */
function generateOutputData(eventData) {
  const output = {
    lastUpdated: new Date().toISOString(),
    totalSteps: 5,
    completedSteps: getCompletedStepsCount(eventData)
  };

  // Add step-specific output data
  if (eventData.ocrResult) {
    output.ocrResult = {
      method: eventData.ocrResult.method,
      confidence: eventData.ocrResult.confidence,
      textLength: eventData.ocrResult.textLength || eventData.ocrResult.text?.length,
      processingTime: eventData.ocrResult.processingTime
    };
  }

  if (eventData.enhancedMetadata) {
    output.enhancedMetadata = {
      categoriesFound: eventData.enhancedMetadata.categories?.length || 0,
      entitiesFound: Object.keys(eventData.enhancedMetadata.entities || {}).length,
      processingTime: eventData.enhancedMetadata.processingTime
    };
  }

  if (eventData.chunkingResult) {
    output.chunkingResult = {
      strategy: eventData.chunkingResult.strategy,
      totalChunks: eventData.chunkingResult.totalChunks,
      processingTime: eventData.chunkingResult.processingTime
    };
  }

  if (eventData.embeddingResult) {
    output.embeddingResult = {
      totalEmbeddings: eventData.embeddingResult.statistics?.totalEmbeddings,
      successRate: eventData.embeddingResult.statistics?.successRate,
      processingTime: eventData.embeddingResult.statistics?.processingTime
    };
  }

  if (eventData.insertionResult) {
    output.insertionResult = {
      chunksInserted: eventData.insertionResult.chunksInserted,
      processingTime: eventData.insertionResult.processingTime
    };
  }

  return output;
}

/**
 * Generate step-specific output
 */
function generateStepOutput(eventData, status) {
  const stepName = getStepNameFromStatus(status);

  switch (stepName) {
    case 'OCRProcessing':
      return eventData.ocrResult || {};
    case 'MetadataEnhancement':
      return eventData.enhancedMetadata || {};
    case 'DocumentChunking':
      return eventData.chunkingResult || {};
    case 'VectorEmbedding':
      return eventData.embeddingResult || {};
    case 'DatabaseInsertion':
      return eventData.insertionResult || {};
    default:
      return {};
  }
}

/**
 * Generate execution summary
 */
function generateExecutionSummary(eventData, trackingResult) {
  const summary = {
    executionArn: trackingResult.executionArn,
    status: eventData.status,
    isCompleted: ['PIPELINE_COMPLETED', 'INSERTION_COMPLETED'].includes(eventData.status),
    isError: eventData.status?.includes('FAILED') || false,
    totalSteps: 5,
    completedSteps: getCompletedStepsCount(eventData),
    errorDetails: eventData.error || null,
    performance: {
      totalProcessingTime: calculateTotalProcessingTime(eventData),
      averageStepTime: calculateAverageStepTime(eventData)
    }
  };

  return summary;
}

/**
 * Helper functions
 */
function getStepNameFromStatus(status) {
  const stepMap = {
    'PROCESSING_STARTED': 'TrackStartStatus',
    'OCR_COMPLETED': 'OCRProcessing',
    'OCR_FAILED': 'OCRProcessing',
    'METADATA_ENHANCED': 'MetadataEnhancement',
    'METADATA_ENHANCEMENT_FAILED': 'MetadataEnhancement',
    'CHUNKING_COMPLETED': 'DocumentChunking',
    'CHUNKING_FAILED': 'DocumentChunking',
    'EMBEDDING_COMPLETED': 'VectorEmbedding',
    'EMBEDDING_FAILED': 'VectorEmbedding',
    'INSERTION_COMPLETED': 'DatabaseInsertion',
    'INSERTION_FAILED': 'DatabaseInsertion',
    'PIPELINE_COMPLETED': 'ProcessingCompleted'
  };

  return stepMap[status] || 'UnknownStep';
}

function getStepOrderFromStatus(status) {
  const orderMap = {
    'PROCESSING_STARTED': 1,
    'OCR_COMPLETED': 2,
    'OCR_FAILED': 2,
    'METADATA_ENHANCED': 3,
    'METADATA_ENHANCEMENT_FAILED': 3,
    'CHUNKING_COMPLETED': 4,
    'CHUNKING_FAILED': 4,
    'EMBEDDING_COMPLETED': 5,
    'EMBEDDING_FAILED': 5,
    'INSERTION_COMPLETED': 6,
    'INSERTION_FAILED': 6,
    'PIPELINE_COMPLETED': 7
  };

  return orderMap[status] || 0;
}

function getProcessingTimeFromEvent(eventData) {
  // Try to extract processing time from various result objects
  if (eventData.ocrResult?.processingTimeMs) return eventData.ocrResult.processingTimeMs;
  if (eventData.ocrResult?.processingTime) return eventData.ocrResult.processingTime;
  if (eventData.enhancedMetadata?.processingTime) return eventData.enhancedMetadata.processingTime;
  if (eventData.chunkingResult?.processingTime) return eventData.chunkingResult.processingTime;
  if (eventData.embeddingResult?.statistics?.processingTime) return eventData.embeddingResult.statistics.processingTime;
  if (eventData.insertionResult?.processingTime) return eventData.insertionResult.processingTime;

  return null;
}

function calculateTotalProcessingTime(eventData) {
  let total = 0;

  if (eventData.ocrResult?.processingTime) total += eventData.ocrResult.processingTime;
  if (eventData.enhancedMetadata?.processingTime) total += eventData.enhancedMetadata.processingTime;
  if (eventData.chunkingResult?.processingTime) total += eventData.chunkingResult.processingTime;
  if (eventData.embeddingResult?.statistics?.processingTime) total += eventData.embeddingResult.statistics.processingTime;
  if (eventData.insertionResult?.processingTime) total += eventData.insertionResult.processingTime;

  return total;
}

function calculateAverageStepTime(eventData) {
  const times = [];

  if (eventData.ocrResult?.processingTime) times.push(eventData.ocrResult.processingTime);
  if (eventData.enhancedMetadata?.processingTime) times.push(eventData.enhancedMetadata.processingTime);
  if (eventData.chunkingResult?.processingTime) times.push(eventData.chunkingResult.processingTime);
  if (eventData.embeddingResult?.statistics?.processingTime) times.push(eventData.embeddingResult.statistics.processingTime);
  if (eventData.insertionResult?.processingTime) times.push(eventData.insertionResult.processingTime);

  return times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
}

function getCompletedStepsCount(eventData) {
  let completed = 0;

  if (eventData.ocrResult) completed++;
  if (eventData.enhancedMetadata) completed++;
  if (eventData.chunkingResult) completed++;
  if (eventData.embeddingResult) completed++;
  if (eventData.insertionResult) completed++;

  return completed;
}