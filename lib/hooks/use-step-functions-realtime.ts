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
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error' | 'disabled';
  lastUpdate: RealtimeUpdate | null;
  execution: StepFunctionsExecution | null;
  progress: ProgressInfo | null;
  steps: ProcessingStep[];
  connect: () => void;
  disconnect: () => void;
  isConnected: boolean;
  error: string | null;
  isRealtimeEnabled: boolean;
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
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error' | 'disabled'>('disconnected');
  const [lastUpdate, setLastUpdate] = useState<RealtimeUpdate | null>(null);
  const [execution, setExecution] = useState<StepFunctionsExecution | null>(null);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [steps, setSteps] = useState<ProcessingStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRealtimeEnabled, setIsRealtimeEnabled] = useState<boolean>(true);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionIdRef = useRef<string | null>(null);
  const maxReconnectAttempts = useRef<number>(3);
  const reconnectAttempts = useRef<number>(0);

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
    // Check if real-time is disabled
    if (!isRealtimeEnabled) {
      console.log('Real-time updates disabled - skipping connection');
      setConnectionStatus('disabled');
      return;
    }

    if (eventSourceRef.current?.readyState === EventSource.OPEN) {
      return; // Already connected
    }

    // Check if we've exceeded max reconnect attempts
    if (reconnectAttempts.current >= maxReconnectAttempts.current) {
      console.warn('Max reconnect attempts reached - disabling real-time updates');
      setConnectionStatus('disabled');
      setIsRealtimeEnabled(false);
      setError('Real-time updates unavailable - working in offline mode');
      return;
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
      // Add timeout for connection attempts
      const connectionTimeout = setTimeout(() => {
        console.warn('SSE connection timeout - falling back to polling mode');
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }
        reconnectAttempts.current++;
        setConnectionStatus('error');
        setError('Connection timeout - working in offline mode');
      }, 10000); // 10 second timeout

      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log('SSE connection opened');
        setConnectionStatus('connected');
        setError(null);
        reconnectAttempts.current = 0; // Reset attempts on successful connection

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
          // Don't treat parse errors as connection failures
        }
      };

      eventSource.onerror = (event) => {
        clearTimeout(connectionTimeout);
        console.error('SSE connection error:', event);
        reconnectAttempts.current++;

        // Close the connection
        eventSource.close();

        // Check if we should continue retrying
        if (reconnectAttempts.current >= maxReconnectAttempts.current) {
          console.warn('Max reconnect attempts reached - disabling real-time updates');
          setConnectionStatus('disabled');
          setIsRealtimeEnabled(false);
          setError('Real-time updates unavailable - working in offline mode');
          return;
        }

        setConnectionStatus('error');
        setError(`Connection error (attempt ${reconnectAttempts.current}/${maxReconnectAttempts.current})`);

        // Auto-reconnect if enabled and under attempt limit
        if (autoReconnect && !reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`Attempting to reconnect... (${reconnectAttempts.current}/${maxReconnectAttempts.current})`);
            reconnectTimeoutRef.current = null;
            connect();
          }, reconnectInterval);
        }
      };

    } catch (connectionError) {
      console.error('Failed to create EventSource:', connectionError);
      reconnectAttempts.current++;
      setConnectionStatus('error');
      setError('Failed to establish connection - working in offline mode');

      // Disable real-time if we can't even create the EventSource
      if (reconnectAttempts.current >= 2) {
        setIsRealtimeEnabled(false);
        setConnectionStatus('disabled');
      }
    }
  }, [executionId, autoReconnect, reconnectInterval, handleMessage, isRealtimeEnabled]);

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

  // Auto-connect effect - only in development or when explicitly enabled
  useEffect(() => {
    if (executionId && isRealtimeEnabled) {
      // Add a small delay to prevent immediate connection attempts
      const connectTimer = setTimeout(() => {
        connect();
      }, 1000);

      return () => {
        clearTimeout(connectTimer);
        disconnect();
      };
    }

    return () => {
      disconnect();
    };
  }, [executionId, connect, disconnect, isRealtimeEnabled]);

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
    error,
    isRealtimeEnabled
  };
}

// Broadcast update utility (for use in components that need to send updates)
export async function broadcastStepFunctionsUpdate(
  type: string,
  data: any,
  executionId?: string
): Promise<boolean> {
  try {
    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('/api/websocket/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type,
        data,
        executionId
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('Failed to broadcast update - service may be unavailable:', response.status);
      return false;
    }

    const result = await response.json();
    console.log(`Broadcasted update to ${result.broadcastCount || 0} connections`);
    return true;

  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('Broadcast timeout - WebSocket service may be unavailable');
    } else {
      console.warn('Broadcast error - working in offline mode:', error);
    }
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