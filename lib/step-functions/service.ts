import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import { stepFunctionExecutions, documents } from '@/lib/db/schema';

/**
 * Step Functions service for starting document processing workflows
 * Shared between upload route and start API endpoint
 */

// Helper function to get AWS clients
function getAWSClients() {
  // Check if environment variables are available
  if (!process.env.BAWS_ACCESS_KEY_ID || !process.env.BAWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS credentials not configured');
  }

  const stepFunctions = new SFNClient({
    region: process.env.DEFAULT_REGION || 'ap-southeast-1',
    credentials: {
      accessKeyId: process.env.BAWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY,
    },
  });

  const s3 = new S3Client({
    region: process.env.DEFAULT_REGION || 'ap-southeast-1',
    credentials: {
      accessKeyId: process.env.BAWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY,
    },
  });

  return { stepFunctions, s3 };
}

export interface StartExecutionRequest {
  fileName: string;
  fileKey: string;
  fileSize: number;
  mimeType: string;
  uploadedBy?: string;
  documentType?: string;
  documentCategory?: string;
  metadata?: Record<string, any>;
}

export interface StartExecutionResult {
  success: boolean;
  execution?: {
    executionId: string;
    documentId: string;
    executionArn: string;
    fileName: string;
    status: string;
    startedAt: string;
    stepFunctionsInput: any;
  };
  error?: string;
  details?: string;
}

/**
 * Start Step Functions execution for document processing
 * Core shared function used by both upload route and start API endpoint
 */
export async function startStepFunctionExecution(request: StartExecutionRequest): Promise<StartExecutionResult> {
  try {
    // Get AWS clients (will throw if not configured)
    let stepFunctions: SFNClient;
    let s3: S3Client;

    try {
      const clients = getAWSClients();
      stepFunctions = clients.stepFunctions;
      s3 = clients.s3;
    } catch (clientError) {
      return {
        success: false,
        error: 'AWS services not configured',
        details: clientError instanceof Error ? clientError.message : 'Unknown configuration error'
      };
    }

    // Validate required fields
    const { fileName, fileKey, fileSize, mimeType } = request;
    if (!fileName || !fileKey || !fileSize || !mimeType) {
      return {
        success: false,
        error: 'Missing required fields: fileName, fileKey, fileSize, mimeType'
      };
    }

    // Generate unique execution ID
    const executionId = uuidv4();
    const documentId = uuidv4();

    // Verify file exists in S3
    const bucketName = process.env.STEPFUNCTIONS_S3_BUCKET || 'stepfunctions-document-processing';

    try {
      await s3.send(new HeadObjectCommand({
        Bucket: bucketName,
        Key: fileKey
      }));
    } catch (s3Error) {
      console.error('File not found in S3:', s3Error);
      return {
        success: false,
        error: 'File not found in S3 bucket'
      };
    }

    // Prepare Step Functions input
    const stepFunctionsInput = {
      executionId,
      documentId,
      fileName,
      fileKey,
      s3Key: fileKey, // State machine expects s3Key parameter
      fileSize,
      mimeType,
      s3Bucket: bucketName,
      uploadedBy: request.uploadedBy || null,
      documentType: request.documentType || 'inci',
      documentCategory: request.documentCategory || 'other',
      metadata: request.metadata || {},
      timestamp: new Date().toISOString(),
      // Processing configuration
      enableAIEnhancement: false, // Can be made configurable
      chunkingStrategy: 'semantic', // Can be made configurable
      embeddingModel: 'amazon.titan-embed-text-v2:0'
    };

    // Debug: Log environment variables status (secure - no sensitive values)
    const envDebug = {
      hasDefaultRegion: !!process.env.DEFAULT_REGION,
      hasAccountId: !!(process.env.ACCOUNT_ID || process.env.AWS_ACCOUNT_ID),
      hasStateMachineArn: !!process.env.STEPFUNCTIONS_STATE_MACHINE_ARN,
      hasS3Bucket: !!process.env.STEPFUNCTIONS_S3_BUCKET,
      hasBAWSCredentials: !!(process.env.BAWS_ACCESS_KEY_ID && process.env.BAWS_SECRET_ACCESS_KEY),
      regionValue: process.env.DEFAULT_REGION || 'not-set',
      bucketValue: process.env.STEPFUNCTIONS_S3_BUCKET || 'not-set'
    };
    console.log('Step Functions Service - Environment variables status:', envDebug);

    // Debug: Log the constructed stepFunctionsInput object
    console.log('Step Functions Service - Input Object:', JSON.stringify(stepFunctionsInput, null, 2));

    // Start Step Functions execution
    const stateMachineArn = process.env.STEPFUNCTIONS_STATE_MACHINE_ARN ||
      `arn:aws:states:${process.env.DEFAULT_REGION}:${process.env.ACCOUNT_ID || process.env.AWS_ACCOUNT_ID}:stateMachine:DocumentProcessingPipeline`;

    const executionParams = {
      stateMachineArn,
      name: `DocumentProcessing-${executionId}`,
      input: JSON.stringify(stepFunctionsInput)
    };

    // Debug: Log the final execution parameters (secure)
    console.log('Step Functions Service - Execution Params:', {
      stateMachineArnLength: stateMachineArn.length,
      stateMachineArnValid: stateMachineArn.includes('DocumentProcessingPipeline'),
      name: executionParams.name,
      inputLength: executionParams.input.length,
      inputHasDocumentId: executionParams.input.includes('documentId'),
      inputHasFileName: executionParams.input.includes('fileName')
    });

    console.log('Step Functions Service - Starting execution:', {
      executionId,
      documentId,
      fileName,
      fileKey
    });

    const executionResult = await stepFunctions.send(new StartExecutionCommand(executionParams));

    // Store execution record in database
    try {
      // First create a document record
      await db.insert(documents).values({
        id: documentId,
        documentType: 'inci' as any, // Cast to avoid type issues with USER-DEFINED type
        originalFilename: fileName,
        filePath: fileKey,
        fileSizeBytes: BigInt(fileSize),
        mimeType: mimeType,
        metadata: request.metadata || {},
        processingStatus: 'pending' as any,
        uploadedBy: null // No user authentication in this flow
      });

      // Then create the step function execution record
      await db.insert(stepFunctionExecutions).values({
        executionArn: executionResult.executionArn!,
        documentId,
        fileName,
        fileKey,
        uploadedBy: request.uploadedBy || null, // Use the uploadedBy from request or null for anonymous uploads
        status: 'RUNNING',
        input: stepFunctionsInput
      });
    } catch (dbError) {
      console.error('Step Functions Service - Failed to store execution record:', dbError);
      // Continue execution even if database insert fails
    }

    // Return execution details
    return {
      success: true,
      execution: {
        executionId,
        documentId,
        executionArn: executionResult.executionArn!,
        fileName,
        status: 'RUNNING',
        startedAt: new Date().toISOString(),
        stepFunctionsInput
      }
    };

  } catch (error) {
    console.error('Step Functions Service - Execution error:', error);

    return {
      success: false,
      error: 'Failed to start document processing',
      details: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}