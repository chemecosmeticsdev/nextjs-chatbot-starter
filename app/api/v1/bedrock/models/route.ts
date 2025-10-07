import { NextRequest, NextResponse } from 'next/server';
import { AuthTokenService } from '@/lib/auth';
import { UserSyncService } from '@/lib/user-sync';

// Mock Bedrock models - in production, this would come from AWS Bedrock API
const BEDROCK_MODELS = [
  {
    modelId: 'amazon.nova-micro-v1:0',
    modelName: 'Nova Micro',
    providerName: 'Amazon',
    inputModalities: ['TEXT'],
    outputModalities: ['TEXT'],
    description: 'Fast and efficient model for basic text generation tasks',
    category: 'TEXT_GENERATION'
  },
  {
    modelId: 'amazon.nova-lite-v1:0',
    modelName: 'Nova Lite',
    providerName: 'Amazon',
    inputModalities: ['TEXT'],
    outputModalities: ['TEXT'],
    description: 'Lightweight model optimized for speed and efficiency',
    category: 'TEXT_GENERATION'
  },
  {
    modelId: 'amazon.nova-pro-v1:0',
    modelName: 'Nova Pro',
    providerName: 'Amazon',
    inputModalities: ['TEXT'],
    outputModalities: ['TEXT'],
    description: 'Professional-grade model with enhanced capabilities',
    category: 'TEXT_GENERATION'
  },
  {
    modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
    modelName: 'Claude 3 Haiku',
    providerName: 'Anthropic',
    inputModalities: ['TEXT'],
    outputModalities: ['TEXT'],
    description: 'Fast and capable model for a wide range of tasks',
    category: 'TEXT_GENERATION'
  },
  {
    modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
    modelName: 'Claude 3 Sonnet',
    providerName: 'Anthropic',
    inputModalities: ['TEXT'],
    outputModalities: ['TEXT'],
    description: 'Balanced model offering good performance and capability',
    category: 'TEXT_GENERATION'
  },
  {
    modelId: 'anthropic.claude-3-opus-20240229-v1:0',
    modelName: 'Claude 3 Opus',
    providerName: 'Anthropic',
    inputModalities: ['TEXT'],
    outputModalities: ['TEXT'],
    description: 'Most capable model for complex reasoning tasks',
    category: 'TEXT_GENERATION'
  },
  {
    modelId: 'meta.llama3-70b-instruct-v1:0',
    modelName: 'Llama 3 70B Instruct',
    providerName: 'Meta',
    inputModalities: ['TEXT'],
    outputModalities: ['TEXT'],
    description: 'Large language model optimized for instruction following',
    category: 'TEXT_GENERATION'
  },
  {
    modelId: 'cohere.command-r-plus-v1:0',
    modelName: 'Command R+',
    providerName: 'Cohere',
    inputModalities: ['TEXT'],
    outputModalities: ['TEXT'],
    description: 'Advanced model for complex reasoning and generation',
    category: 'TEXT_GENERATION'
  }
];

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('session')?.value;

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'No session found', code: 'NO_SESSION' },
        { status: 401 }
      );
    }

    // Verify session and check admin role
    const session = await AuthTokenService.verifySession(sessionToken);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid session', code: 'INVALID_SESSION' },
        { status: 401 }
      );
    }

    const dbUser = await UserSyncService.getUserById(session.userId);
    if (!dbUser || dbUser.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Access denied. Super admin role required.', code: 'ACCESS_DENIED' },
        { status: 403 }
      );
    }

    // Get query parameters for filtering
    const url = new URL(request.url);
    const category = url.searchParams.get('category');
    const provider = url.searchParams.get('provider');

    let filteredModels = BEDROCK_MODELS;

    if (category) {
      filteredModels = filteredModels.filter(model =>
        model.category.toLowerCase() === category.toLowerCase()
      );
    }

    if (provider) {
      filteredModels = filteredModels.filter(model =>
        model.providerName.toLowerCase() === provider.toLowerCase()
      );
    }

    // Group by provider for better UI organization
    const groupedModels = filteredModels.reduce((acc, model) => {
      if (!acc[model.providerName]) {
        acc[model.providerName] = [];
      }
      acc[model.providerName].push(model);
      return acc;
    }, {} as Record<string, typeof BEDROCK_MODELS>);

    return NextResponse.json({
      success: true,
      models: filteredModels,
      groupedModels: groupedModels,
      totalCount: filteredModels.length,
      availableProviders: [...new Set(BEDROCK_MODELS.map(m => m.providerName))],
      availableCategories: [...new Set(BEDROCK_MODELS.map(m => m.category))]
    });

  } catch (error: any) {
    console.error('Get Bedrock models error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}