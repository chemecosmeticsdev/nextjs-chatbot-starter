import { NextRequest, NextResponse } from 'next/server';
import { SFNClient, DescribeExecutionCommand, StopExecutionCommand } from '@aws-sdk/client-sfn';
import { db } from '@/lib/db';
import { stepFunctionExecutions, processingSteps } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

// Initialize AWS Step Functions
const stepFunctions = new SFNClient({
  region: process.env.DEFAULT_REGION || 'ap-southeast-1',
  credentials: {
    accessKeyId: process.env.BAWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.BAWS_SECRET_ACCESS_KEY!,
  },
});

export async function GET(
  request: NextRequest,
  { params }: { params: { executionId: string } }
) {
  try {
    const { executionId } = params;

    if (!executionId) {
      return NextResponse.json(
        { error: 'Execution ID is required' },
        { status: 400 }
      );
    }

    // Get execution record from database
    const executionRecord = await db
      .select()
      .from(stepFunctionExecutions)
      .where(eq(stepFunctionExecutions.id, executionId))
      .limit(1);

    if (executionRecord.length === 0) {
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      );
    }

    const execution = executionRecord[0];

    // Get current status from Step Functions
    let stepFunctionsStatus = null;
    try {
      const describeResult = await stepFunctions.send(new DescribeExecutionCommand({
        executionArn: execution.executionArn
      }));

      stepFunctionsStatus = {
        status: describeResult.status,
        startDate: describeResult.startDate,
        stopDate: describeResult.stopDate,
        output: describeResult.output ? JSON.parse(describeResult.output) : null,
        error: describeResult.error || null
      };

      // Update local database if status has changed
      if (execution.status !== describeResult.status) {
        await db
          .update(stepFunctionExecutions)
          .set({
            status: describeResult.status,
            output: stepFunctionsStatus.output,
            error: stepFunctionsStatus.error,
            endedAt: describeResult.stopDate || null,
            updatedAt: new Date()
          })
          .where(eq(stepFunctionExecutions.id, executionId));
      }

    } catch (stepFunctionsError) {
      console.error('Failed to get Step Functions status:', stepFunctionsError);
      // Continue with database status if Step Functions is unavailable
    }

    // Get processing steps from database
    const executionArn = execution.executionArn;
    const steps = await db
      .select()
      .from(processingSteps)
      .where(eq(processingSteps.executionArn, executionArn))
      .orderBy(desc(processingSteps.stepOrder));

    // Calculate progress
    const totalSteps = 7; // FileValidation, OCR, Chunking, Embedding, DatabaseInsertion, MetadataEnhancement, Completion
    const completedSteps = steps.filter(step => step.status === 'SUCCEEDED').length;
    const failedSteps = steps.filter(step => step.status === 'FAILED').length;
    const runningSteps = steps.filter(step => step.status === 'RUNNING').length;

    const progress = {
      percentage: Math.round((completedSteps / totalSteps) * 100),
      completed: completedSteps,
      total: totalSteps,
      failed: failedSteps,
      running: runningSteps
    };

    // Determine overall status
    let overallStatus = execution.status;
    if (stepFunctionsStatus) {
      overallStatus = stepFunctionsStatus.status;
    }

    // Get current step info
    let currentStep = null;
    const runningStep = steps.find(step => step.status === 'RUNNING');
    if (runningStep) {
      currentStep = {
        name: runningStep.stepName,
        status: runningStep.status,
        startedAt: runningStep.startedAt
      };
    } else if (overallStatus === 'RUNNING' && completedSteps < totalSteps) {
      // Infer next step based on completed steps
      const stepNames = [
        'FileValidation',
        'OCRProcessing',
        'DocumentChunking',
        'VectorEmbedding',
        'DatabaseInsertion',
        'MetadataEnhancement',
        'Completion'
      ];
      currentStep = {
        name: stepNames[completedSteps] || 'Unknown',
        status: 'PENDING',
        startedAt: null
      };
    }

    // Get processing duration
    const startTime = execution.startedAt;
    const endTime = execution.endedAt || (overallStatus === 'RUNNING' ? new Date() : null);
    const durationMs = endTime && startTime ? endTime.getTime() - startTime.getTime() : null;

    return NextResponse.json({
      execution: {
        id: execution.id,
        documentId: execution.documentId,
        fileName: execution.fileName,
        status: overallStatus,
        startedAt: execution.startedAt,
        endedAt: execution.endedAt,
        durationMs,
        progress,
        currentStep,
        error: execution.error || stepFunctionsStatus?.error || null
      },
      steps: steps.map(step => ({
        name: step.stepName,
        order: step.stepOrder,
        status: step.status,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
        errorDetails: step.errorDetails,
        outputData: step.outputData
      })),
      stepFunctionsStatus
    });

  } catch (error) {
    console.error('Status check error:', error);

    return NextResponse.json(
      {
        error: 'Failed to get execution status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// PUT endpoint to update execution (for manual status updates or cancellation)
export async function PUT(
  request: NextRequest,
  { params }: { params: { executionId: string } }
) {
  try {
    const { executionId } = params;
    const body = await request.json();

    if (!executionId) {
      return NextResponse.json(
        { error: 'Execution ID is required' },
        { status: 400 }
      );
    }

    // Get execution record
    const executionRecord = await db
      .select()
      .from(stepFunctionExecutions)
      .where(eq(stepFunctionExecutions.id, executionId))
      .limit(1);

    if (executionRecord.length === 0) {
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      );
    }

    const execution = executionRecord[0];

    // Handle different update actions
    if (body.action === 'cancel') {
      try {
        // Stop the Step Functions execution
        await stepFunctions.send(new StopExecutionCommand({
          executionArn: execution.executionArn,
          cause: 'User requested cancellation'
        }));

        // Update database
        await db
          .update(stepFunctionExecutions)
          .set({
            status: 'ABORTED',
            endedAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(stepFunctionExecutions.id, executionId));

        return NextResponse.json({
          success: true,
          message: 'Execution cancelled successfully'
        });

      } catch (stepFunctionsError) {
        console.error('Failed to cancel Step Functions execution:', stepFunctionsError);
        return NextResponse.json(
          { error: 'Failed to cancel execution' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Invalid action specified' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Execution update error:', error);

    return NextResponse.json(
      {
        error: 'Failed to update execution',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}