import { NextRequest, NextResponse } from 'next/server';
import { SFNClient, StartExecutionCommand, ListStateMachinesCommand } from '@aws-sdk/client-sfn';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import { stepFunctionExecutions, documents } from '@/lib/db/schema';

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

interface StartExecutionRequest {
  fileName: string;
  fileKey: string;
  fileSize: number;
  mimeType: string;
  uploadedBy?: string;
  documentType?: string;
  documentCategory?: string;
  metadata?: Record<string, any>;
}

export async function POST(request: NextRequest) {
  try {
    // Get AWS clients (will throw if not configured)
    let stepFunctions: SFNClient;
    let s3: S3Client;

    try {
      const clients = getAWSClients();
      stepFunctions = clients.stepFunctions;
      s3 = clients.s3;
    } catch (clientError) {
      return NextResponse.json(
        {
          error: 'AWS services not configured',
          details: clientError instanceof Error ? clientError.message : 'Unknown configuration error'
        },
        { status: 503 }
      );
    }

    const body: StartExecutionRequest = await request.json();

    // Validate required fields
    const { fileName, fileKey, fileSize, mimeType } = body;
    if (!fileName || !fileKey || !fileSize || !mimeType) {
      return NextResponse.json(
        { error: 'Missing required fields: fileName, fileKey, fileSize, mimeType' },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: 'File not found in S3 bucket' },
        { status: 404 }
      );
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
      uploadedBy: body.uploadedBy || null,
      documentType: body.documentType || 'inci',
      documentCategory: body.documentCategory || 'other',
      metadata: body.metadata || {},
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
    console.log('Environment variables status:', envDebug);

    // Debug: Log the constructed stepFunctionsInput object
    console.log('Step Functions Input Object:', JSON.stringify(stepFunctionsInput, null, 2));

    // Start Step Functions execution
    const stateMachineArn = process.env.STEPFUNCTIONS_STATE_MACHINE_ARN ||
      `arn:aws:states:${process.env.DEFAULT_REGION}:${process.env.ACCOUNT_ID || process.env.AWS_ACCOUNT_ID}:stateMachine:DocumentProcessingPipeline`;

    const executionParams = {
      stateMachineArn,
      name: `DocumentProcessing-${executionId}`,
      input: JSON.stringify(stepFunctionsInput)
    };

    // Debug: Log the final execution parameters (secure)
    console.log('Step Functions Execution Params:', {
      stateMachineArnLength: stateMachineArn.length,
      stateMachineArnValid: stateMachineArn.includes('DocumentProcessingPipeline'),
      name: executionParams.name,
      inputLength: executionParams.input.length,
      inputHasDocumentId: executionParams.input.includes('documentId'),
      inputHasFileName: executionParams.input.includes('fileName')
    });

    console.log('Starting Step Functions execution:', {
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
        metadata: body.metadata || {},
        processingStatus: 'pending' as any,
        uploadedBy: null // No user authentication in this flow
      });

      // Then create the step function execution record
      await db.insert(stepFunctionExecutions).values({
        executionArn: executionResult.executionArn!,
        documentId,
        fileName,
        fileKey,
        uploadedBy: body.uploadedBy || null, // Use the uploadedBy from request or null for anonymous uploads
        status: 'RUNNING',
        input: stepFunctionsInput
      });
    } catch (dbError) {
      console.error('Failed to store execution record:', dbError);
      // Continue execution even if database insert fails
    }

    // Return execution details
    return NextResponse.json({
      success: true,
      execution: {
        executionId,
        documentId,
        executionArn: executionResult.executionArn,
        fileName,
        status: 'RUNNING',
        startedAt: new Date().toISOString(),
        stepFunctionsInput
      }
    });

  } catch (error) {
    console.error('Step Functions execution error:', error);

    // Provide detailed error information for debugging
    const errorResponse: any = {
      error: 'Failed to start document processing',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };

    // In development, include secure environment diagnostic (no sensitive values)
    if (process.env.NODE_ENV === 'development') {
      errorResponse.debug = {
        hasCredentials: !!(process.env.BAWS_ACCESS_KEY_ID && process.env.BAWS_SECRET_ACCESS_KEY),
        hasRegion: !!process.env.DEFAULT_REGION,
        hasAccountId: !!(process.env.ACCOUNT_ID || process.env.AWS_ACCOUNT_ID),
        hasStateMachineArn: !!process.env.STEPFUNCTIONS_STATE_MACHINE_ARN,
        hasBucket: !!process.env.STEPFUNCTIONS_S3_BUCKET
      };
    }

    return NextResponse.json(errorResponse, { status: 500 });
  }
}

// GET endpoint to check if Step Functions is properly configured
// Force cache refresh - environment variables should be available after job 54 & 55
export async function GET() {
  try {
    // Check if required environment variables are set
    const requiredEnvVars = [
      'BAWS_ACCESS_KEY_ID',
      'BAWS_SECRET_ACCESS_KEY',
      'DEFAULT_REGION',
      'STEPFUNCTIONS_S3_BUCKET'
    ];

    const missingVars = requiredEnvVars.filter(varName => {
      const value = process.env[varName];
      const isMissing = !value || value.trim() === '';

      // Debug: Log each variable check
      console.log(`Checking ${varName}:`, {
        exists: !!value,
        length: value?.length || 0,
        isEmpty: !value || value.trim() === '',
        value: varName.includes('SECRET') ? '[REDACTED]' : value
      });

      return isMissing;
    });

    if (missingVars.length > 0) {
      return NextResponse.json({
        configured: false,
        error: `Missing environment variables: ${missingVars.join(', ')}`
      });
    }

    // Get AWS clients (will throw if not configured)
    let stepFunctions: SFNClient;

    try {
      const clients = getAWSClients();
      stepFunctions = clients.stepFunctions;
    } catch (clientError) {
      // Enhanced error reporting to understand why getAWSClients() fails
      return NextResponse.json({
        configured: false,
        error: 'Failed to initialize AWS clients',
        details: clientError instanceof Error ? clientError.message : 'Unknown error',
        diagnostics: {
          BAWS_ACCESS_KEY_ID_present: !!process.env.BAWS_ACCESS_KEY_ID,
          BAWS_SECRET_ACCESS_KEY_present: !!process.env.BAWS_SECRET_ACCESS_KEY,
          DEFAULT_REGION_present: !!process.env.DEFAULT_REGION,
          STEPFUNCTIONS_S3_BUCKET_present: !!process.env.STEPFUNCTIONS_S3_BUCKET,
          values: {
            DEFAULT_REGION: process.env.DEFAULT_REGION,
            STEPFUNCTIONS_S3_BUCKET: process.env.STEPFUNCTIONS_S3_BUCKET
          }
        }
      });
    }

    // Try to list state machines to verify connectivity
    try {
      const result = await stepFunctions.send(new ListStateMachinesCommand({ maxResults: 1 }));

      return NextResponse.json({
        configured: true,
        region: process.env.DEFAULT_REGION,
        stateMachinesFound: result.stateMachines?.length || 0,
        s3Bucket: process.env.STEPFUNCTIONS_S3_BUCKET
      });
    } catch (awsError) {
      return NextResponse.json({
        configured: false,
        error: 'Failed to connect to AWS Step Functions',
        details: awsError instanceof Error ? awsError.message : 'Unknown AWS error'
      });
    }

  } catch (error) {
    return NextResponse.json(
      {
        configured: false,
        error: 'Configuration check failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}