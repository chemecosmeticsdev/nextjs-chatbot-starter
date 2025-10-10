import { SFNClient } from '@aws-sdk/client-sfn';
import { S3Client } from '@aws-sdk/client-s3';

let stepFunctionsClient: SFNClient | null = null;
let s3Client: S3Client | null = null;

/**
 * Get a singleton instance of the Step Functions client.
 * This prevents module-level initialization errors when environment variables are not yet available.
 */
export function getStepFunctionsClient(): SFNClient {
  if (!stepFunctionsClient) {
    if (!process.env.BAWS_ACCESS_KEY_ID || !process.env.BAWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not configured (BAWS_ACCESS_KEY_ID and BAWS_SECRET_ACCESS_KEY required)');
    }

    stepFunctionsClient = new SFNClient({
      region: process.env.DEFAULT_REGION || 'ap-southeast-1',
      credentials: {
        accessKeyId: process.env.BAWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY,
      },
    });
  }

  return stepFunctionsClient;
}

/**
 * Get a singleton instance of the S3 client.
 * This prevents module-level initialization errors when environment variables are not yet available.
 */
export function getS3Client(): S3Client {
  if (!s3Client) {
    if (!process.env.BAWS_ACCESS_KEY_ID || !process.env.BAWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not configured (BAWS_ACCESS_KEY_ID and BAWS_SECRET_ACCESS_KEY required)');
    }

    s3Client = new S3Client({
      region: process.env.DEFAULT_REGION || 'ap-southeast-1',
      credentials: {
        accessKeyId: process.env.BAWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY,
      },
    });
  }

  return s3Client;
}

/**
 * Check if AWS credentials are configured
 */
export function isAWSConfigured(): boolean {
  return !!(
    process.env.BAWS_ACCESS_KEY_ID &&
    process.env.BAWS_SECRET_ACCESS_KEY &&
    process.env.DEFAULT_REGION
  );
}

/**
 * Get missing AWS configuration variables
 */
export function getMissingAWSConfig(): string[] {
  const required = ['BAWS_ACCESS_KEY_ID', 'BAWS_SECRET_ACCESS_KEY', 'DEFAULT_REGION', 'STEPFUNCTIONS_S3_BUCKET'];
  return required.filter(key => !process.env[key]);
}