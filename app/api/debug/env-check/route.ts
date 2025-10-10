import { NextResponse } from 'next/server';

/**
 * Debug endpoint to check environment variables in production
 *
 * SECURITY WARNING: This endpoint should be removed or protected in production.
 * It's only for debugging the Step Functions integration issues.
 */
export async function GET() {
  try {
    const envCheck = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,

      // AWS Credentials (check presence only, don't expose values)
      awsCredentials: {
        BAWS_ACCESS_KEY_ID: !!process.env.BAWS_ACCESS_KEY_ID,
        BAWS_SECRET_ACCESS_KEY: !!process.env.BAWS_SECRET_ACCESS_KEY,
        // Check for alternative names
        AWS_ACCESS_KEY_ID: !!process.env.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: !!process.env.AWS_SECRET_ACCESS_KEY,
      },

      // AWS Configuration
      awsConfig: {
        DEFAULT_REGION: process.env.DEFAULT_REGION,
        ACCOUNT_ID: process.env.ACCOUNT_ID,
        AWS_ACCOUNT_ID: process.env.AWS_ACCOUNT_ID,
        // Check alternative names
        AWS_REGION: process.env.AWS_REGION,
        AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION,
      },

      // Step Functions Configuration
      stepFunctionsConfig: {
        STEPFUNCTIONS_S3_BUCKET: process.env.STEPFUNCTIONS_S3_BUCKET,
        STEPFUNCTIONS_STATE_MACHINE_ARN: process.env.STEPFUNCTIONS_STATE_MACHINE_ARN,
        // Check for alternative names
        STATE_MACHINE_ARN: process.env.STATE_MACHINE_ARN,
        S3_BUCKET: process.env.S3_BUCKET,
      },

      // Database
      database: {
        DATABASE_URL: !!process.env.DATABASE_URL,
      },

      // All environment variable keys (not values)
      allEnvKeys: Object.keys(process.env).filter(key =>
        key.includes('AWS') ||
        key.includes('STEP') ||
        key.includes('BAWS') ||
        key.includes('REGION') ||
        key.includes('ACCOUNT')
      ).sort(),
    };

    return NextResponse.json({
      success: true,
      debug: envCheck
    });

  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check environment',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
