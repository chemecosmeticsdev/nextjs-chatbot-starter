const AWS = require('aws-sdk');
const { Pool } = require('pg');

// Initialize AWS services
const bedrock = new AWS.BedrockRuntime({
  region: process.env.BEDROCK_REGION || 'us-east-1' // Bedrock is primarily available in us-east-1
});

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

// Generate embeddings using AWS Bedrock Titan v2
async function generateEmbedding(text, modelId = 'amazon.titan-embed-text-v2:0') {
  try {
    const params = {
      modelId: modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        inputText: text,
        dimensions: 1024, // Titan v2 supports 1024 dimensions
        normalize: true   // Normalize the embedding vector
      })
    };

    console.log(`Generating embedding for text (${text.length} chars) using model ${modelId}`);

    const response = await bedrock.invokeModel(params).promise();
    const responseBody = JSON.parse(response.body.toString());

    if (!responseBody.embedding) {
      throw new Error('No embedding returned from Bedrock');
    }

    return {
      embedding: responseBody.embedding,
      dimensions: responseBody.embedding.length,
      model: modelId,
      inputTokenCount: responseBody.inputTokenCount || null
    };

  } catch (error) {
    console.error('Bedrock embedding error:', error);

    // Handle specific Bedrock errors
    if (error.code === 'ThrottlingException') {
      throw new Error('Bedrock API throttled. Please retry.');
    } else if (error.code === 'ModelTimeoutException') {
      throw new Error('Bedrock model timeout. Please retry.');
    } else if (error.code === 'ValidationException') {
      throw new Error(`Bedrock validation error: ${error.message}`);
    }

    throw new Error(`Bedrock embedding failed: ${error.message}`);
  }
}

// Process embeddings for chunks with batching and rate limiting
async function processChunkEmbeddings(chunks, modelId, maxConcurrent = 3) {
  const embeddings = [];
  const errors = [];

  console.log(`Processing ${chunks.length} chunks with max ${maxConcurrent} concurrent requests`);

  // Process chunks in batches to avoid overwhelming Bedrock
  for (let i = 0; i < chunks.length; i += maxConcurrent) {
    const batch = chunks.slice(i, i + maxConcurrent);

    console.log(`Processing batch ${Math.floor(i/maxConcurrent) + 1}/${Math.ceil(chunks.length/maxConcurrent)}`);

    const batchPromises = batch.map(async (chunk, batchIndex) => {
      const chunkIndex = i + batchIndex;

      try {
        // Add small delay to avoid rate limiting
        if (batchIndex > 0) {
          await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
        }

        const embeddingResult = await generateEmbedding(chunk.chunk_text, modelId);

        return {
          chunkIndex,
          chunkId: chunk.chunk_id,
          embedding: embeddingResult.embedding,
          dimensions: embeddingResult.dimensions,
          model: embeddingResult.model,
          inputTokenCount: embeddingResult.inputTokenCount,
          success: true
        };
      } catch (error) {
        console.error(`Failed to generate embedding for chunk ${chunkIndex}:`, error);

        errors.push({
          chunkIndex,
          chunkId: chunk.chunk_id,
          error: error.message
        });

        return {
          chunkIndex,
          chunkId: chunk.chunk_id,
          embedding: null,
          error: error.message,
          success: false
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    embeddings.push(...batchResults);

    // Add longer delay between batches
    if (i + maxConcurrent < chunks.length) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second between batches
    }
  }

  // Filter out failed embeddings
  const successfulEmbeddings = embeddings.filter(result => result.success);

  console.log(`Successfully generated ${successfulEmbeddings.length}/${chunks.length} embeddings`);

  if (errors.length > 0) {
    console.warn(`Failed to generate embeddings for ${errors.length} chunks:`, errors);
  }

  return {
    embeddings: successfulEmbeddings,
    errors,
    successCount: successfulEmbeddings.length,
    failureCount: errors.length,
    totalCount: chunks.length
  };
}

// Validate embeddings quality
function validateEmbeddings(embeddingsResult) {
  const { embeddings, successCount, totalCount } = embeddingsResult;

  const issues = [];

  // Check success rate
  const successRate = totalCount > 0 ? (successCount / totalCount) : 0;
  if (successRate < 0.8) {
    issues.push(`Low embedding success rate: ${(successRate * 100).toFixed(1)}%`);
  }

  // Check embedding dimensions consistency
  if (embeddings.length > 0) {
    const expectedDimensions = embeddings[0].dimensions;
    const inconsistentDimensions = embeddings.some(emb => emb.dimensions !== expectedDimensions);

    if (inconsistentDimensions) {
      issues.push('Inconsistent embedding dimensions detected');
    }

    // Check for zero vectors (potentially invalid embeddings)
    const zeroVectors = embeddings.filter(emb => {
      const magnitude = Math.sqrt(emb.embedding.reduce((sum, val) => sum + val * val, 0));
      return magnitude < 0.001; // Very small magnitude indicates potential issue
    });

    if (zeroVectors.length > 0) {
      issues.push(`Found ${zeroVectors.length} potentially invalid zero-magnitude embeddings`);
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
    quality: {
      successRate: successRate * 100,
      totalEmbeddings: successCount,
      averageDimensions: embeddings.length > 0 ? embeddings[0].dimensions : 0,
      modelUsed: embeddings.length > 0 ? embeddings[0].model : 'unknown'
    }
  };
}

// Calculate embedding statistics
function calculateEmbeddingStats(embeddings) {
  if (embeddings.length === 0) {
    return {
      totalEmbeddings: 0,
      averageDimensions: 0,
      totalTokensUsed: 0,
      averageTokensPerChunk: 0
    };
  }

  const totalTokens = embeddings.reduce((sum, emb) => sum + (emb.inputTokenCount || 0), 0);

  return {
    totalEmbeddings: embeddings.length,
    averageDimensions: embeddings[0].dimensions,
    totalTokensUsed: totalTokens,
    averageTokensPerChunk: totalTokens / embeddings.length,
    modelUsed: embeddings[0].model
  };
}

// Main Lambda handler
exports.handler = async (event) => {
  const startTime = Date.now();
  console.log('Vector embedding event:', JSON.stringify(event, null, 2));

  const { executionId, documentId, chunks, model = 'amazon.titan-embed-text-v2:0' } = event;
  const executionArn = `arn:aws:states:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:execution:DocumentProcessingWorkflow:${executionId}`;

  try {
    // Update step status to RUNNING
    await updateProcessingStep(executionArn, 'VectorEmbedding', 'RUNNING', 5, event);

    // Validate input
    if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
      throw new Error('No chunks provided for embedding generation');
    }

    console.log(`Starting embedding generation for ${chunks.length} chunks using model ${model}`);

    // Process all chunks to generate embeddings
    const embeddingResult = await processChunkEmbeddings(chunks, model);

    // Validate embedding quality
    const validation = validateEmbeddings(embeddingResult);

    if (!validation.isValid) {
      console.warn('Embedding quality issues detected:', validation.issues);

      // If success rate is too low, fail the step
      if (validation.quality.successRate < 50) {
        throw new Error(`Embedding generation failed: ${validation.issues.join(', ')}`);
      }
    }

    // Calculate statistics
    const stats = calculateEmbeddingStats(embeddingResult.embeddings);

    // Prepare the result
    const result = {
      embeddings: embeddingResult.embeddings,
      stats,
      validation: validation.quality,
      qualityIssues: validation.issues,
      processingTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };

    // Update step status to SUCCEEDED
    await updateProcessingStep(executionArn, 'VectorEmbedding', 'SUCCEEDED', 5, event, result);

    console.log(`Vector embedding completed successfully for document ${documentId}:`, {
      totalEmbeddings: stats.totalEmbeddings,
      successRate: `${validation.quality.successRate.toFixed(1)}%`,
      dimensions: stats.averageDimensions,
      model: model
    });

    return result;

  } catch (error) {
    console.error('Vector embedding error:', error);

    const errorDetails = {
      message: error.message,
      stack: error.stack,
      processingTimeMs: Date.now() - startTime
    };

    // Update step status to FAILED
    try {
      await updateProcessingStep(executionArn, 'VectorEmbedding', 'FAILED', 5, event, null, errorDetails);
    } catch (dbError) {
      console.error('Failed to update step status:', dbError);
    }

    throw error;
  }
};