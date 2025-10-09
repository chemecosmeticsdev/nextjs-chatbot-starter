'use client';

import React, { ReactNode } from 'react';
import {
  useStepFunctionsRealtime,
  StepFunctionsRealtimeContext,
  UseStepFunctionsRealtimeProps,
  RealtimeUpdate,
  StepFunctionsExecution,
  ProgressInfo,
  ProcessingStep
} from '@/lib/hooks/use-step-functions-realtime';

interface StepFunctionsRealtimeProviderProps extends UseStepFunctionsRealtimeProps {
  children: ReactNode;
  onGlobalUpdate?: (update: RealtimeUpdate) => void;
  onGlobalExecutionStatusChange?: (execution: StepFunctionsExecution) => void;
  onGlobalProgressChange?: (progress: ProgressInfo) => void;
  onGlobalStepChange?: (steps: ProcessingStep[]) => void;
}

export function StepFunctionsRealtimeProvider({
  children,
  executionId,
  onUpdate,
  onExecutionStatusChange,
  onProgressChange,
  onStepChange,
  onGlobalUpdate,
  onGlobalExecutionStatusChange,
  onGlobalProgressChange,
  onGlobalStepChange,
  autoReconnect = true,
  reconnectInterval = 5000
}: StepFunctionsRealtimeProviderProps) {

  // Combine callbacks
  const handleUpdate = (update: RealtimeUpdate) => {
    onUpdate?.(update);
    onGlobalUpdate?.(update);
  };

  const handleExecutionStatusChange = (execution: StepFunctionsExecution) => {
    onExecutionStatusChange?.(execution);
    onGlobalExecutionStatusChange?.(execution);
  };

  const handleProgressChange = (progress: ProgressInfo) => {
    onProgressChange?.(progress);
    onGlobalProgressChange?.(progress);
  };

  const handleStepChange = (steps: ProcessingStep[]) => {
    onStepChange?.(steps);
    onGlobalStepChange?.(steps);
  };

  const realtimeState = useStepFunctionsRealtime({
    executionId,
    onUpdate: handleUpdate,
    onExecutionStatusChange: handleExecutionStatusChange,
    onProgressChange: handleProgressChange,
    onStepChange: handleStepChange,
    autoReconnect,
    reconnectInterval
  });

  return (
    <StepFunctionsRealtimeContext.Provider value={realtimeState}>
      {children}
    </StepFunctionsRealtimeContext.Provider>
  );
}

// Utility component for showing connection status
export function ConnectionStatus() {
  const { connectionStatus, error, isConnected } = useStepFunctionsRealtime();

  return (
    <div className={`flex items-center gap-2 text-sm ${
      isConnected ? 'text-green-600' : connectionStatus === 'error' ? 'text-red-600' : 'text-yellow-600'
    }`}>
      <div className={`w-2 h-2 rounded-full ${
        isConnected ? 'bg-green-500' : connectionStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500'
      }`} />
      <span>
        {connectionStatus === 'connecting' && 'Connecting...'}
        {connectionStatus === 'connected' && 'Connected'}
        {connectionStatus === 'disconnected' && 'Disconnected'}
        {connectionStatus === 'error' && `Error: ${error || 'Connection failed'}`}
      </span>
    </div>
  );
}

// Utility component for displaying realtime updates
export function RealtimeUpdateLogger({ maxUpdates = 10 }: { maxUpdates?: number }) {
  const [updates, setUpdates] = React.useState<RealtimeUpdate[]>([]);

  const { lastUpdate } = useStepFunctionsRealtime({
    onUpdate: (update) => {
      if (update.type !== 'heartbeat') { // Don't log heartbeats
        setUpdates(prev => [update, ...prev].slice(0, maxUpdates));
      }
    }
  });

  if (updates.length === 0) {
    return (
      <div className="text-sm text-gray-500">
        No updates yet...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Recent Updates</h3>
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {updates.map((update, index) => (
          <div
            key={`${update.timestamp}-${index}`}
            className="text-xs p-2 bg-gray-50 rounded border-l-2 border-blue-200"
          >
            <div className="flex justify-between items-start gap-2">
              <span className="font-medium text-blue-600">{update.type}</span>
              <span className="text-gray-500">
                {new Date(update.timestamp).toLocaleTimeString()}
              </span>
            </div>
            {update.executionId && (
              <div className="text-gray-600 mt-1">
                Execution: {update.executionId.slice(0, 8)}...
              </div>
            )}
            <pre className="text-gray-700 mt-1 whitespace-pre-wrap text-xs">
              {JSON.stringify(update.data, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

// Component for debugging realtime connections
export function RealtimeDebugPanel() {
  const realtimeState = useStepFunctionsRealtime();

  return (
    <div className="p-4 border rounded-lg bg-gray-50 space-y-4">
      <h2 className="text-lg font-semibold">Realtime Debug Panel</h2>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="font-medium mb-2">Connection</h3>
          <ConnectionStatus />
        </div>

        <div>
          <h3 className="font-medium mb-2">Controls</h3>
          <div className="flex gap-2">
            <button
              onClick={realtimeState.connect}
              disabled={realtimeState.isConnected}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded disabled:bg-gray-300"
            >
              Connect
            </button>
            <button
              onClick={realtimeState.disconnect}
              disabled={!realtimeState.isConnected}
              className="px-3 py-1 text-sm bg-red-500 text-white rounded disabled:bg-gray-300"
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>

      {realtimeState.execution && (
        <div>
          <h3 className="font-medium mb-2">Current Execution</h3>
          <div className="text-sm space-y-1">
            <div>ID: {realtimeState.execution.id}</div>
            <div>File: {realtimeState.execution.fileName}</div>
            <div>Status: {realtimeState.execution.status}</div>
          </div>
        </div>
      )}

      {realtimeState.progress && (
        <div>
          <h3 className="font-medium mb-2">Progress</h3>
          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${realtimeState.progress.percentage}%` }}
            />
          </div>
          <div className="text-sm">
            {realtimeState.progress.completed}/{realtimeState.progress.total} steps completed
            ({realtimeState.progress.percentage}%)
          </div>
        </div>
      )}

      <div>
        <h3 className="font-medium mb-2">Processing Steps</h3>
        <div className="space-y-1">
          {realtimeState.steps.map((step) => (
            <div key={step.name} className="flex justify-between text-sm">
              <span>{step.name}</span>
              <span className={`font-medium ${
                step.status === 'SUCCEEDED' ? 'text-green-600' :
                step.status === 'RUNNING' ? 'text-blue-600' :
                step.status === 'FAILED' ? 'text-red-600' :
                'text-gray-600'
              }`}>
                {step.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      <RealtimeUpdateLogger maxUpdates={5} />
    </div>
  );
}