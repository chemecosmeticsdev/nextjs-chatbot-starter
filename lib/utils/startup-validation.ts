/**
 * Startup validation utilities for production configuration checks
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  recommendations: string[];
}

export interface ConfigValidation {
  name: string;
  value: string | undefined;
  required: boolean;
  validator?: (value: string) => { valid: boolean; error?: string };
}

/**
 * Validate environment configuration at startup
 */
export function validateEnvironmentConfig(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // Define configuration requirements
  const configurations: ConfigValidation[] = [
    // Database
    {
      name: 'DATABASE_URL',
      value: process.env.DATABASE_URL,
      required: true,
      validator: (value) => {
        if (!value.startsWith('postgresql://')) {
          return { valid: false, error: 'DATABASE_URL must be a PostgreSQL connection string' };
        }
        return { valid: true };
      }
    },

    // AWS Core Configuration
    {
      name: 'BAWS_ACCESS_KEY_ID',
      value: process.env.BAWS_ACCESS_KEY_ID,
      required: true,
      validator: (value) => {
        if (value.length < 16) {
          return { valid: false, error: 'AWS Access Key ID appears to be invalid (too short)' };
        }
        return { valid: true };
      }
    },
    {
      name: 'BAWS_SECRET_ACCESS_KEY',
      value: process.env.BAWS_SECRET_ACCESS_KEY,
      required: true,
      validator: (value) => {
        if (value.length < 20) {
          return { valid: false, error: 'AWS Secret Access Key appears to be invalid (too short)' };
        }
        return { valid: true };
      }
    },
    {
      name: 'DEFAULT_REGION',
      value: process.env.DEFAULT_REGION,
      required: true,
      validator: (value) => {
        const validRegionPattern = /^[a-z]{2}-[a-z]+-\d$/;
        if (!validRegionPattern.test(value)) {
          return { valid: false, error: 'DEFAULT_REGION must be a valid AWS region (e.g., us-east-1)' };
        }
        return { valid: true };
      }
    },
    {
      name: 'BEDROCK_REGION',
      value: process.env.BEDROCK_REGION,
      required: true,
      validator: (value) => {
        const validRegionPattern = /^[a-z]{2}-[a-z]+-\d$/;
        if (!validRegionPattern.test(value)) {
          return { valid: false, error: 'BEDROCK_REGION must be a valid AWS region (e.g., us-east-1)' };
        }
        return { valid: true };
      }
    },
    {
      name: 'AWS_ACCOUNT_ID',
      value: process.env.AWS_ACCOUNT_ID,
      required: true,
      validator: (value) => {
        if (!/^\d{12}$/.test(value)) {
          return { valid: false, error: 'AWS_ACCOUNT_ID must be a 12-digit AWS account ID' };
        }
        return { valid: true };
      }
    },

    // S3 Configuration
    {
      name: 'S3_DOCUMENT_BUCKET',
      value: process.env.S3_DOCUMENT_BUCKET,
      required: true
    },
    {
      name: 'STEPFUNCTIONS_S3_BUCKET',
      value: process.env.STEPFUNCTIONS_S3_BUCKET,
      required: true
    },

    // Step Functions (optional but recommended)
    {
      name: 'STEPFUNCTIONS_STATE_MACHINE_ARN',
      value: process.env.STEPFUNCTIONS_STATE_MACHINE_ARN,
      required: false,
      validator: (value) => {
        if (!value.startsWith('arn:aws:states:')) {
          return { valid: false, error: 'STEPFUNCTIONS_STATE_MACHINE_ARN must be a valid Step Functions ARN' };
        }
        return { valid: true };
      }
    },

    // Application Configuration
    {
      name: 'NEXT_PUBLIC_APP_URL',
      value: process.env.NEXT_PUBLIC_APP_URL,
      required: true,
      validator: (value) => {
        try {
          new URL(value);
          return { valid: true };
        } catch {
          return { valid: false, error: 'NEXT_PUBLIC_APP_URL must be a valid URL' };
        }
      }
    },
    {
      name: 'JWT_SECRET',
      value: process.env.JWT_SECRET,
      required: true,
      validator: (value) => {
        if (value.length < 32) {
          return { valid: false, error: 'JWT_SECRET should be at least 32 characters for security' };
        }
        return { valid: true };
      }
    },

    // Optional services
    {
      name: 'MISTRAL_API_KEY',
      value: process.env.MISTRAL_API_KEY,
      required: false
    },
    {
      name: 'GITHUB_PAT',
      value: process.env.GITHUB_PAT,
      required: false
    },
    {
      name: 'NEXT_PUBLIC_WS_URL',
      value: process.env.NEXT_PUBLIC_WS_URL,
      required: false
    }
  ];

  // Validate each configuration
  configurations.forEach(config => {
    if (!config.value || config.value.trim() === '') {
      if (config.required) {
        errors.push(`Missing required environment variable: ${config.name}`);
      } else {
        warnings.push(`Optional environment variable not set: ${config.name}`);
      }
    } else if (config.validator) {
      const validation = config.validator(config.value);
      if (!validation.valid) {
        if (config.required) {
          errors.push(`Invalid ${config.name}: ${validation.error}`);
        } else {
          warnings.push(`Invalid ${config.name}: ${validation.error}`);
        }
      }
    }
  });

  // Add specific recommendations based on missing configuration
  if (!process.env.STEPFUNCTIONS_STATE_MACHINE_ARN) {
    recommendations.push('Deploy Step Functions state machine for document processing capabilities');
  }

  if (!process.env.MISTRAL_API_KEY) {
    recommendations.push('Configure Mistral API key for enhanced OCR processing');
  }

  if (!process.env.NEXT_PUBLIC_WS_URL) {
    recommendations.push('Set WebSocket URL for real-time updates in production');
  }

  // Check for common configuration issues
  if (process.env.NODE_ENV === 'production') {
    if (process.env.JWT_SECRET === 'production-jwt-secret-key-change-immediately') {
      errors.push('JWT_SECRET is still using the default value - this is a security risk');
    }

    if (!process.env.NEXT_PUBLIC_WS_URL) {
      warnings.push('WebSocket URL not configured - real-time features will be disabled');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    recommendations
  };
}

/**
 * Check if critical services are available
 */
export async function validateServiceAvailability(): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  try {
    // Test database connectivity
    try {
      const dbResponse = await fetch('/api/health/database');
      if (!dbResponse.ok) {
        errors.push('Database is not accessible');
      }
    } catch (error) {
      errors.push(`Database connectivity check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Test Step Functions if configured
    if (process.env.STEPFUNCTIONS_STATE_MACHINE_ARN) {
      try {
        const sfResponse = await fetch('/api/health/step-functions');
        if (!sfResponse.ok) {
          warnings.push('Step Functions service is not accessible');
          recommendations.push('Check AWS credentials and Step Functions permissions');
        }
      } catch (error) {
        warnings.push('Step Functions connectivity check failed');
        recommendations.push('Verify AWS configuration and network connectivity');
      }
    }

  } catch (error) {
    errors.push(`Service availability check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    recommendations
  };
}

/**
 * Comprehensive startup validation
 */
export async function performStartupValidation(): Promise<ValidationResult> {
  const configValidation = validateEnvironmentConfig();
  const serviceValidation = await validateServiceAvailability();

  return {
    valid: configValidation.valid && serviceValidation.valid,
    errors: [...configValidation.errors, ...serviceValidation.errors],
    warnings: [...configValidation.warnings, ...serviceValidation.warnings],
    recommendations: [...configValidation.recommendations, ...serviceValidation.recommendations]
  };
}

/**
 * Log validation results with appropriate levels
 */
export function logValidationResults(results: ValidationResult, context: string = 'Startup') {
  if (results.errors.length > 0) {
    console.error(`${context} validation failed:`, results.errors);
  }

  if (results.warnings.length > 0) {
    console.warn(`${context} validation warnings:`, results.warnings);
  }

  if (results.recommendations.length > 0) {
    console.info(`${context} recommendations:`, results.recommendations);
  }

  if (results.valid) {
    console.log(`${context} validation passed successfully`);
  }
}

/**
 * Check if Step Functions features should be enabled based on configuration
 */
export function shouldEnableStepFunctions(): boolean {
  return !!(
    process.env.STEPFUNCTIONS_STATE_MACHINE_ARN &&
    process.env.STEPFUNCTIONS_S3_BUCKET &&
    process.env.BAWS_ACCESS_KEY_ID &&
    process.env.BAWS_SECRET_ACCESS_KEY
  );
}

/**
 * Check if real-time features should be enabled
 */
export function shouldEnableRealtime(): boolean {
  return !!(process.env.NEXT_PUBLIC_WS_URL || process.env.NODE_ENV === 'development');
}