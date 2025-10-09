import { NextRequest, NextResponse } from 'next/server';
import { SFNClient, DescribeStateMachineCommand } from '@aws-sdk/client-sfn';

/**
 * Step Functions health check endpoint
 * Tests AWS credentials and Step Functions service accessibility
 */
export async function GET(request: NextRequest) {
  try {
    const start = Date.now();

    // Check if required environment variables are present
    const requiredVars = {
      accessKeyId: process.env.BAWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY,
      region: process.env.DEFAULT_REGION,
      stateMachineArn: process.env.STEPFUNCTIONS_STATE_MACHINE_ARN
    };

    const missingVars = Object.entries(requiredVars)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missingVars.length > 0) {
      return NextResponse.json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        step_functions: {
          configured: false,
          error: `Missing environment variables: ${missingVars.join(', ')}`,
          missing_variables: missingVars
        }
      }, { status: 503 });
    }

    // Initialize Step Functions client
    const sfnClient = new SFNClient({
      region: requiredVars.region,
      credentials: {
        accessKeyId: requiredVars.accessKeyId!,
        secretAccessKey: requiredVars.secretAccessKey!
      }
    });

    try {
      // Test by describing the state machine
      const command = new DescribeStateMachineCommand({
        stateMachineArn: requiredVars.stateMachineArn!
      });

      const response = await sfnClient.send(command);
      const duration = Date.now() - start;

      return NextResponse.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        step_functions: {
          configured: true,
          accessible: true,
          response_time_ms: duration,
          state_machine: {
            name: response.name,
            status: response.status,
            creation_date: response.creationDate?.toISOString(),
            // Don't expose full ARN or definition for security
            arn_configured: !!response.stateMachineArn
          }
        }
      });

    } catch (awsError: any) {
      const duration = Date.now() - start;

      // Handle specific AWS errors
      let errorCategory = 'unknown';
      let userMessage = 'Step Functions service error';

      if (awsError.name === 'AccessDeniedException') {
        errorCategory = 'authorization';
        userMessage = 'AWS credentials lack Step Functions permissions';
      } else if (awsError.name === 'StateMachineDoesNotExist') {
        errorCategory = 'configuration';
        userMessage = 'State machine not found or ARN incorrect';
      } else if (awsError.name === 'InvalidParameterValueException') {
        errorCategory = 'configuration';
        userMessage = 'Invalid state machine ARN format';
      } else if (awsError.code === 'NetworkingError' || awsError.code === 'TimeoutError') {
        errorCategory = 'network';
        userMessage = 'Network connectivity issue with AWS';
      }

      return NextResponse.json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        step_functions: {
          configured: true,
          accessible: false,
          response_time_ms: duration,
          error: {
            category: errorCategory,
            message: userMessage,
            aws_error_code: awsError.name || awsError.code,
            aws_error_message: awsError.message
          }
        }
      }, { status: 503 });
    }

  } catch (error) {
    console.error('Step Functions health check failed:', error);

    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      step_functions: {
        configured: false,
        accessible: false,
        error: {
          category: 'system',
          message: 'Health check system error',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }, { status: 500 });
  }
}