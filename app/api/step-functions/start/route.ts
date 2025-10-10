import { NextRequest, NextResponse } from 'next/server';
import { SFNClient, ListStateMachinesCommand } from '@aws-sdk/client-sfn';
import { startStepFunctionExecution, StartExecutionRequest } from '@/lib/step-functions/service';

// Helper function to get AWS clients for the GET endpoint configuration check
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

  return { stepFunctions };
}

export async function POST(request: NextRequest) {
  try {
    console.log('Step Functions Start API - Received request');

    const body: StartExecutionRequest = await request.json();

    // Use the shared service function to start execution
    const result = await startStepFunctionExecution(body);

    if (result.success) {
      return NextResponse.json({
        success: true,
        execution: result.execution
      });
    } else {
      // Determine appropriate HTTP status code based on error type
      let statusCode = 500;
      if (result.error?.includes('Missing required fields')) {
        statusCode = 400;
      } else if (result.error?.includes('File not found')) {
        statusCode = 404;
      } else if (result.error?.includes('AWS services not configured')) {
        statusCode = 503;
      }

      return NextResponse.json({
        error: result.error,
        details: result.details,
        timestamp: new Date().toISOString()
      }, { status: statusCode });
    }

  } catch (error) {
    console.error('Step Functions Start API - Unexpected error:', error);

    return NextResponse.json({
      error: 'Failed to start document processing',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

// GET endpoint to check if Step Functions is properly configured
// Force cache refresh - environment variables should be available after job 54 & 55
export async function GET() {
  try {
    // TEMPORARILY DISABLED: Environment variable check to test Step Functions directly
    console.log('STEP FUNCTIONS GET ENDPOINT - ENVIRONMENT VARIABLES:', {
      BAWS_ACCESS_KEY_ID: !!process.env.BAWS_ACCESS_KEY_ID,
      BAWS_SECRET_ACCESS_KEY: !!process.env.BAWS_SECRET_ACCESS_KEY,
      DEFAULT_REGION: process.env.DEFAULT_REGION,
      STEPFUNCTIONS_S3_BUCKET: process.env.STEPFUNCTIONS_S3_BUCKET,
      timestamp: new Date().toISOString()
    });

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