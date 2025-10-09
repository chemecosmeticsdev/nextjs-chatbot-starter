import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { stepFunctionExecutions, pipelineActivityLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Store active connections
const activeConnections = new Map<string, ResponseWithWriter>();

interface ResponseWithWriter extends Response {
  writer?: WritableStreamDefaultWriter;
}

interface SSEMessage {
  type: 'execution_update' | 'step_update' | 'error' | 'heartbeat' | 'connection_status';
  data: any;
  executionId?: string;
  timestamp: string;
}

// SSE endpoint for real-time Step Functions updates
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const executionId = searchParams.get('executionId');
  const connectionId = searchParams.get('connectionId') || crypto.randomUUID();

  // Set up SSE headers
  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  const encoder = new TextEncoder();

  // Store connection for broadcasting
  const response = new Response(responseStream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  }) as ResponseWithWriter;

  response.writer = writer;
  activeConnections.set(connectionId, response);

  // Send initial connection message
  await sendSSEMessage(writer, {
    type: 'connection_status',
    data: {
      connected: true,
      connectionId,
      executionId: executionId || null,
      timestamp: new Date().toISOString()
    },
    timestamp: new Date().toISOString()
  });

  // If monitoring specific execution, send current status
  if (executionId) {
    try {
      const currentStatus = await getExecutionStatus(executionId);
      if (currentStatus) {
        await sendSSEMessage(writer, {
          type: 'execution_update',
          data: currentStatus,
          executionId,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Failed to get initial status:', error);
    }
  }

  // Set up heartbeat
  const heartbeatInterval = setInterval(async () => {
    try {
      await sendSSEMessage(writer, {
        type: 'heartbeat',
        data: { timestamp: new Date().toISOString() },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Heartbeat failed:', error);
      clearInterval(heartbeatInterval);
      activeConnections.delete(connectionId);
    }
  }, 30000); // 30 seconds

  // Handle connection cleanup
  request.signal.addEventListener('abort', () => {
    console.log(`SSE connection ${connectionId} closed`);
    clearInterval(heartbeatInterval);
    activeConnections.delete(connectionId);
    writer.close();
  });

  return response;
}

// POST endpoint to broadcast updates to connected clients
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, data, executionId, targetConnections } = body;

    if (!type || !data) {
      return NextResponse.json(
        { error: 'Type and data are required' },
        { status: 400 }
      );
    }

    const message: SSEMessage = {
      type,
      data,
      executionId,
      timestamp: new Date().toISOString()
    };

    let broadcastCount = 0;

    // Broadcast to all or specific connections
    for (const [connectionId, response] of activeConnections.entries()) {
      try {
        // Filter by execution ID if specified
        if (executionId && response.writer) {
          // Only send to connections monitoring this execution or all executions
          await sendSSEMessage(response.writer, message);
          broadcastCount++;
        } else if (!executionId && response.writer) {
          // Broadcast to all connections
          await sendSSEMessage(response.writer, message);
          broadcastCount++;
        }
      } catch (error) {
        console.error(`Failed to send to connection ${connectionId}:`, error);
        // Remove dead connection
        activeConnections.delete(connectionId);
      }
    }

    return NextResponse.json({
      success: true,
      broadcastCount,
      activeConnections: activeConnections.size
    });

  } catch (error) {
    console.error('Broadcast error:', error);
    return NextResponse.json(
      { error: 'Failed to broadcast message' },
      { status: 500 }
    );
  }
}

// Helper function to send SSE messages
async function sendSSEMessage(writer: WritableStreamDefaultWriter, message: SSEMessage) {
  const encoder = new TextEncoder();

  // Format as SSE
  const sseData = `data: ${JSON.stringify(message)}\n\n`;
  await writer.write(encoder.encode(sseData));
}

// Get current execution status
async function getExecutionStatus(executionId: string) {
  try {
    // Get execution record
    const execution = await db
      .select()
      .from(stepFunctionExecutions)
      .where(eq(stepFunctionExecutions.id, executionId))
      .limit(1);

    if (execution.length === 0) {
      return null;
    }

    // Get processing steps
    const steps = await db
      .select()
      .from(pipelineActivityLogs)
      .where(eq(pipelineActivityLogs.executionId, execution[0].id))
      .orderBy(pipelineActivityLogs.timestamp);

    // Calculate progress
    const totalSteps = 7;
    const completedSteps = steps.filter(step => step.logLevel === 'INFO' && step.message?.includes('completed')).length;
    const runningSteps = steps.filter(step => step.logLevel === 'INFO' && step.message?.includes('started')).length;
    const failedSteps = steps.filter(step => step.logLevel === 'ERROR').length;

    return {
      execution: {
        id: execution[0].id,
        documentId: execution[0].documentId,
        fileName: execution[0].fileName,
        status: execution[0].status,
        startedAt: execution[0].startedAt,
        endedAt: execution[0].endedAt
      },
      progress: {
        percentage: Math.round((completedSteps / totalSteps) * 100),
        completed: completedSteps,
        total: totalSteps,
        running: runningSteps,
        failed: failedSteps
      },
      steps: steps.map(step => ({
        name: step.stage,
        message: step.message,
        logLevel: step.logLevel,
        timestamp: step.timestamp,
        details: step.details
      }))
    };

  } catch (error) {
    console.error('Failed to get execution status:', error);
    return null;
  }
}

// GET endpoint to check active connections
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const connectionId = searchParams.get('connectionId');

  if (connectionId && activeConnections.has(connectionId)) {
    const connection = activeConnections.get(connectionId);
    if (connection?.writer) {
      try {
        await connection.writer.close();
      } catch (error) {
        console.error('Error closing connection:', error);
      }
    }
    activeConnections.delete(connectionId);

    return NextResponse.json({
      success: true,
      message: 'Connection closed'
    });
  }

  return NextResponse.json({
    success: false,
    message: 'Connection not found'
  });
}

// Export function to broadcast updates (for use by other parts of the application)
export async function broadcastUpdate(type: string, data: any, executionId?: string) {
  const message: SSEMessage = {
    type: type as any,
    data,
    executionId,
    timestamp: new Date().toISOString()
  };

  let broadcastCount = 0;

  for (const [connectionId, response] of activeConnections.entries()) {
    try {
      if (response.writer) {
        await sendSSEMessage(response.writer, message);
        broadcastCount++;
      }
    } catch (error) {
      console.error(`Failed to broadcast to connection ${connectionId}:`, error);
      activeConnections.delete(connectionId);
    }
  }

  return broadcastCount;
}