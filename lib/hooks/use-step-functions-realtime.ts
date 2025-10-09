'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface StepFunctionsExecution {
  id: string;
  documentId: string;
  fileName: string;
  status: string;
  startedAt: string;
  endedAt?: string;
}

export interface ProcessingStep {
  name: string;
  status: string;
  order: number;
  startedAt?: string;
  completedAt?: string;
}

export interface ProgressInfo {
  percentage: number;
  completed: number;
  total: number;
  running: number;
  failed: number;
}

export interface RealtimeUpdate {
  type: 'execution_update' | 'step_update' | 'error' | 'heartbeat' | 'connection_status';
  data: any;
  executionId?: string;
  timestamp: string;
}

export interface UseStepFunctionsRealtimeProps {
  executionId?: string;
  onUpdate?: (update: RealtimeUpdate) => void;
  onExecutionStatusChange?: (execution: StepFunctionsExecution) => void;
  onProgressChange?: (progress: ProgressInfo) => void;
  onStepChange?: (steps: ProcessingStep[]) => void;
  autoReconnect?: boolean;
  reconnectInterval?: number;
}

export interface UseStepFunctionsRealtimeReturn {
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastUpdate: RealtimeUpdate | null;
  execution: StepFunctionsExecution | null;
  progress: ProgressInfo | null;
  steps: ProcessingStep[];
  connect: () => void;
  disconnect: () => void;
  isConnected: boolean;
  error: string | null;
}

export function useStepFunctionsRealtime({
  executionId,
  onUpdate,
  onExecutionStatusChange,
  onProgressChange,
  onStepChange,
  autoReconnect = true,
  reconnectInterval = 5000
}: UseStepFunctionsRealtimeProps = {}): UseStepFunctionsRealtimeReturn {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [lastUpdate, setLastUpdate] = useState<RealtimeUpdate | null>(null);
  const [execution, setExecution] = useState<StepFunctionsExecution | null>(null);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [steps, setSteps] = useState<ProcessingStep[]>([]);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionIdRef = useRef<string | null>(null);

  const handleMessage = useCallback((update: RealtimeUpdate) => {
    console.log('Realtime update received:', update);

    setLastUpdate(update);
    setError(null);

    // Call general update callback
    onUpdate?.(update);

    // Handle specific update types
    switch (update.type) {
      case 'execution_update':
        if (update.data.execution) {
          setExecution(update.data.execution);
          onExecutionStatusChange?.(update.data.execution);
        }
        if (update.data.progress) {
          setProgress(update.data.progress);
          onProgressChange?.(update.data.progress);
        }
        if (update.data.steps) {
          setSteps(update.data.steps);
          onStepChange?.(update.data.steps);
        }
        break;

      case 'step_update':
        if (update.data.steps) {
          setSteps(update.data.steps);
          onStepChange?.(update.data.steps);
        }
        if (update.data.progress) {
          setProgress(update.data.progress);
          onProgressChange?.(update.data.progress);
        }
        break;

      case 'connection_status':
        if (update.data.connected) {
          setConnectionStatus('connected');
          connectionIdRef.current = update.data.connectionId;
        }
        break;

      case 'error':
        setError(update.data.message || 'Unknown error');
        setConnectionStatus('error');
        break;

      case 'heartbeat':
        // Keep connection alive
        break;
    }
  }, [onUpdate, onExecutionStatusChange, onProgressChange, onStepChange]);

  const connect = useCallback(() => {
    if (eventSourceRef.current?.readyState === EventSource.OPEN) {
      return; // Already connected
    }

    setConnectionStatus('connecting');
    setError(null);

    // Build SSE URL
    const params = new URLSearchParams();
    if (executionId) {
      params.append('executionId', executionId);
    }
    if (connectionIdRef.current) {
      params.append('connectionId', connectionIdRef.current);
    }

    const url = `/api/websocket/events?${params.toString()}`;

    try {
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('SSE connection opened');
        setConnectionStatus('connected');
        setError(null);

        // Clear any pending reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      eventSource.onmessage = (event) => {
        try {
          const update: RealtimeUpdate = JSON.parse(event.data);
          handleMessage(update);
        } catch (parseError) {
          console.error('Failed to parse SSE message:', parseError);
        }
      };

      eventSource.onerror = (event) => {
        console.error('SSE connection error:', event);
        setConnectionStatus('error');
        setError('Connection error');

        // Close the connection
        eventSource.close();

        // Auto-reconnect if enabled
        if (autoReconnect && !reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('Attempting to reconnect...');
            reconnectTimeoutRef.current = null;
            connect();
          }, reconnectInterval);
        }
      };

    } catch (connectionError) {
      console.error('Failed to create EventSource:', connectionError);
      setConnectionStatus('error');
      setError('Failed to establish connection');
    }
  }, [executionId, autoReconnect, reconnectInterval, handleMessage]);

  const disconnect = useCallback(() => {
    console.log('Disconnecting from realtime updates');

    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setConnectionStatus('disconnected');
    connectionIdRef.current = null;
  }, []);

  // Auto-connect effect
  useEffect(() => {
    if (executionId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [executionId, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const isConnected = connectionStatus === 'connected';

  return {
    connectionStatus,
    lastUpdate,
    execution,
    progress,
    steps,
    connect,
    disconnect,
    isConnected,
    error
  };
}

// Broadcast update utility (for use in components that need to send updates)
export async function broadcastStepFunctionsUpdate(
  type: string,
  data: any,
  executionId?: string
): Promise<boolean> {
  try {
    const response = await fetch('/api/websocket/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type,
        data,
        executionId
      })
    });

    if (!response.ok) {
      console.error('Failed to broadcast update:', await response.text());
      return false;
    }

    const result = await response.json();
    console.log(`Broadcasted update to ${result.broadcastCount} connections`);
    return true;

  } catch (error) {
    console.error('Broadcast error:', error);
    return false;
  }
}

// Context for sharing realtime state across components
import { createContext, useContext } from 'react';

export const StepFunctionsRealtimeContext = createContext<UseStepFunctionsRealtimeReturn | null>(null);

export function useStepFunctionsRealtimeContext() {
  const context = useContext(StepFunctionsRealtimeContext);
  if (!context) {
    throw new Error('useStepFunctionsRealtimeContext must be used within a StepFunctionsRealtimeProvider');
  }
  return context;
}