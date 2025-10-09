import { NextRequest, NextResponse } from 'next/server';
import { SFNClient, StartExecutionCommand, ListStateMachinesCommand } from '@aws-sdk/client-sfn';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import { stepFunctionExecutions } from '@/lib/db/schema';

// Initialize AWS services
const stepFunctions = new SFNClient({
  region: process.env.DEFAULT_REGION || 'ap-southeast-1',
  credentials: {
    accessKeyId: process.env.BAWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY!,
  },
});

const s3 = new S3Client({
  region: process.env.DEFAULT_REGION || 'ap-southeast-1',
  credentials: {
    accessKeyId: process.env.BAWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY!,
  },
});

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

    // Start Step Functions execution
    const stateMachineArn = process.env.STEPFUNCTIONS_STATE_MACHINE_ARN ||
      `arn:aws:states:${process.env.DEFAULT_REGION}:${process.env.ACCOUNT_ID}:stateMachine:DocumentProcessingWorkflow`;

    const executionParams = {
      stateMachineArn,
      name: `DocumentProcessing-${executionId}`,
      input: JSON.stringify(stepFunctionsInput)
    };

    console.log('Starting Step Functions execution:', {
      executionId,
      documentId,
      fileName,
      fileKey
    });

    const executionResult = await stepFunctions.send(new StartExecutionCommand(executionParams));

    // Store execution record in database
    try {
      await db.insert(stepFunctionExecutions).values({
        id: executionId,
        executionArn: executionResult.executionArn,
        documentId,
        fileName,
        fileKey,
        status: 'RUNNING',
        input: stepFunctionsInput,
        startedAt: new Date(),
        uploadedBy: body.uploadedBy || null
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

    return NextResponse.json(
      {
        error: 'Failed to start document processing',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
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

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
      return NextResponse.json({
        configured: false,
        error: `Missing environment variables: ${missingVars.join(', ')}`
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