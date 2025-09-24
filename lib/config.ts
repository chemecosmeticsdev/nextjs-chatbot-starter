// Configuration constants for the application

export const config = {
  database: {
    url: process.env.DATABASE_URL!,
  },
  aws: {
    region: process.env.DEFAULT_REGION || 'ap-southeast-1',
    bedrockRegion: process.env.BEDROCK_REGION || 'us-east-1',
    accessKeyId: process.env.BAWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY!,
  },
  cognito: {
    userPoolId: process.env.COGNITO_USER_POOL_ID!,
    clientId: process.env.COGNITO_CLIENT_ID!,
    clientSecret: process.env.COGNITO_CLIENT_SECRET!,
    region: process.env.COGNITO_REGION || 'ap-southeast-1',
    userPoolArn: process.env.COGNITO_USER_POOL_ARN!,
  },
  app: {
    name: 'Chatbot Application',
    description: 'AI chatbot powered by AWS Bedrock Nova Micro',
    version: '1.0.0',
  },
  bedrock: {
    modelId: 'amazon.nova-micro-v1:0',
    maxTokens: 1000,
    temperature: 0.7,
    topP: 0.9,
  },
} as const

// Validate required environment variables
export function validateConfig() {
  const required = [
    'DATABASE_URL',
    'BAWS_ACCESS_KEY_ID',
    'BAWS_SECRET_ACCESS_KEY',
    'COGNITO_USER_POOL_ID',
    'COGNITO_CLIENT_ID',
    'COGNITO_CLIENT_SECRET',
  ]

  const missing = required.filter(key => !process.env[key])

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}