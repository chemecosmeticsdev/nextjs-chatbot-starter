import { NextRequest, NextResponse } from 'next/server';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import { stepFunctionExecutions, processingSteps } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Initialize AWS Step Functions
const stepFunctions = new SFNClient({
  region: process.env.DEFAULT_REGION || 'ap-southeast-1',
  credentials: {
    accessKeyId: process.env.BAWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY!,
  },
});

interface RetryRequest {
  originalExecutionId: string;
  retryType?: 'full' | 'from_failure';
  skipSteps?: string[];
  customInput?: Record<string, any>;
}

export async function POST(request: NextRequest) {
  try {
    const body: RetryRequest = await request.json();
    const { originalExecutionId, retryType = 'full', skipSteps = [], customInput = {} } = body;

    if (!originalExecutionId) {
      return NextResponse.json(
        { error: 'Original execution ID is required' },
        { status: 400 }
      );
    }

    // Get original execution
    const originalExecution = await db
      .select()
      .from(stepFunctionExecutions)
      .where(eq(stepFunctionExecutions.id, originalExecutionId))
      .limit(1);

    if (originalExecution.length === 0) {
      return NextResponse.json(
        { error: 'Original execution not found' },
        { status: 404 }
      );
    }

    const original = originalExecution[0];

    // Ensure original execution is in a retryable state
    if (['RUNNING', 'PENDING'].includes(original.status)) {
      return NextResponse.json(
        { error: 'Cannot retry a running execution' },
        { status: 400 }
      );
    }

    // Generate new execution ID
    const newExecutionId = uuidv4();

    // Prepare retry input based on original input
    let retryInput = { ...original.input };

    // Update execution ID and timestamp
    retryInput.executionId = newExecutionId;
    retryInput.timestamp = new Date().toISOString();
    retryInput.retryInfo = {
      originalExecutionId,
      retryType,
      retryCount: (original.retryCount || 0) + 1,
      retryedAt: new Date().toISOString()
    };

    // Apply custom input overrides
    retryInput = { ...retryInput, ...customInput };

    // Handle different retry types
    if (retryType === 'from_failure') {
      // Get the last failed step to determine where to resume
      const failedSteps = await db
        .select()
        .from(processingSteps)
        .where(eq(processingSteps.executionArn, original.executionArn))
        .orderBy(processingSteps.stepOrder);

      const lastFailedStep = failedSteps.find(step => step.status === 'FAILED');

      if (lastFailedStep) {
        retryInput.resumeFromStep = lastFailedStep.stepName;
        retryInput.skipSteps = skipSteps;

        console.log(`Retry from failure - resuming from step: ${lastFailedStep.stepName}`);
      }
    }

    // Start new Step Functions execution
    const stateMachineArn = process.env.STEPFUNCTIONS_STATE_MACHINE_ARN ||
      `arn:aws:states:${process.env.DEFAULT_REGION}:${process.env.AWS_ACCOUNT_ID}:stateMachine:DocumentProcessingWorkflow`;

    const executionParams = {
      stateMachineArn,
      name: `DocumentProcessing-Retry-${newExecutionId}`,
      input: JSON.stringify(retryInput)
    };

    console.log('Starting retry execution:', {
      newExecutionId,
      originalExecutionId,
      retryType,
      fileName: original.fileName
    });

    const executionResult = await stepFunctions.send(new StartExecutionCommand(executionParams));

    // Store new execution record
    await db.insert(stepFunctionExecutions).values({
      id: newExecutionId,
      executionArn: executionResult.executionArn,
      documentId: original.documentId, // Same document
      fileName: original.fileName,
      fileKey: original.fileKey,
      status: 'RUNNING',
      input: retryInput,
      startedAt: new Date(),
      uploadedBy: original.uploadedBy,
      originalExecutionId,
      retryCount: (original.retryCount || 0) + 1
    });

    // Update original execution to mark it as retried
    await db
      .update(stepFunctionExecutions)
      .set({
        retryExecutionId: newExecutionId,
        updatedAt: new Date()
      })
      .where(eq(stepFunctionExecutions.id, originalExecutionId));

    return NextResponse.json({
      success: true,
      retry: {
        newExecutionId,
        originalExecutionId,
        executionArn: executionResult.executionArn,
        retryType,
        retryCount: (original.retryCount || 0) + 1,
        startedAt: new Date().toISOString(),
        fileName: original.fileName,
        status: 'RUNNING'
      }
    });

  } catch (error) {
    console.error('Retry execution error:', error);

    return NextResponse.json(
      {
        error: 'Failed to retry execution',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET endpoint to get retry history for an execution
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const executionId = searchParams.get('executionId');

    if (!executionId) {
      return NextResponse.json(
        { error: 'Execution ID is required' },
        { status: 400 }
      );
    }

    // Get the execution and its retry chain
    const execution = await db
      .select()
      .from(stepFunctionExecutions)
      .where(eq(stepFunctionExecutions.id, executionId))
      .limit(1);

    if (execution.length === 0) {
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      );
    }

    const originalExecutionId = execution[0].originalExecutionId || executionId;

    // Get all executions in the retry chain
    const retryChain = await db
      .select({
        id: stepFunctionExecutions.id,
        documentId: stepFunctionExecutions.documentId,
        fileName: stepFunctionExecutions.fileName,
        status: stepFunctionExecutions.status,
        startedAt: stepFunctionExecutions.startedAt,
        endedAt: stepFunctionExecutions.endedAt,
        retryCount: stepFunctionExecutions.retryCount,
        originalExecutionId: stepFunctionExecutions.originalExecutionId,
        retryExecutionId: stepFunctionExecutions.retryExecutionId,
        error: stepFunctionExecutions.error
      })
      .from(stepFunctionExecutions)
      .where(
        eq(stepFunctionExecutions.originalExecutionId, originalExecutionId)
      );

    // Also get the original execution if it exists
    const originalExecution = await db
      .select({
        id: stepFunctionExecutions.id,
        documentId: stepFunctionExecutions.documentId,
        fileName: stepFunctionExecutions.fileName,
        status: stepFunctionExecutions.status,
        startedAt: stepFunctionExecutions.startedAt,
        endedAt: stepFunctionExecutions.endedAt,
        retryCount: stepFunctionExecutions.retryCount,
        originalExecutionId: stepFunctionExecutions.originalExecutionId,
        retryExecutionId: stepFunctionExecutions.retryExecutionId,
        error: stepFunctionExecutions.error
      })
      .from(stepFunctionExecutions)
      .where(eq(stepFunctionExecutions.id, originalExecutionId))
      .limit(1);

    // Combine and sort by retry count
    const allExecutions = [...originalExecution, ...retryChain]
      .sort((a, b) => (a.retryCount || 0) - (b.retryCount || 0));

    // Calculate durations and additional info
    const enrichedExecutions = allExecutions.map(exec => {
      const durationMs = exec.endedAt && exec.startedAt
        ? exec.endedAt.getTime() - exec.startedAt.getTime()
        : null;

      return {
        ...exec,
        durationMs,
        isOriginal: exec.id === originalExecutionId,
        isActive: ['RUNNING', 'PENDING'].includes(exec.status)
      };
    });

    // Get retry statistics
    const totalRetries = allExecutions.length - 1; // Exclude original
    const successfulRetries = allExecutions.filter(exec => exec.status === 'SUCCEEDED').length;
    const failedRetries = allExecutions.filter(exec => exec.status === 'FAILED').length;
    const activeRetries = allExecutions.filter(exec => ['RUNNING', 'PENDING'].includes(exec.status)).length;

    return NextResponse.json({
      originalExecutionId,
      retryChain: enrichedExecutions,
      statistics: {
        totalRetries,
        successfulRetries,
        failedRetries,
        activeRetries,
        hasActiveRetry: activeRetries > 0
      }
    });

  } catch (error) {
    console.error('Failed to get retry history:', error);

    return NextResponse.json(
      {
        error: 'Failed to get retry history',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}