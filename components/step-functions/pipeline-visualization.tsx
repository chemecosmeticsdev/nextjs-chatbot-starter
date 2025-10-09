'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  Play,
  Pause,
  FileCheck,
  Brain,
  FileText,
  Database,
  Search,
  Zap,
  ArrowRight,
  Info,
  RotateCcw,
  Timer
} from 'lucide-react';
import { useStepFunctionsRealtime, ProcessingStep, StepFunctionsExecution, ProgressInfo } from '@/lib/hooks/use-step-functions-realtime';

interface PipelineStep {
  id: string;
  name: string;
  displayName: string;
  icon: React.ReactNode;
  description: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  order: number;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  errorMessage?: string;
  outputs?: Record<string, any>;
}

interface PipelineVisualizationProps {
  executionId?: string;
  className?: string;
  showControls?: boolean;
  compact?: boolean;
  execution?: StepFunctionsExecution;
  steps?: ProcessingStep[];
  progress?: ProgressInfo;
}

const STEP_DEFINITIONS: Record<string, Omit<PipelineStep, 'status' | 'order' | 'startedAt' | 'completedAt'>> = {
  'ValidateFile': {
    id: 'ValidateFile',
    name: 'ValidateFile',
    displayName: 'File Validation',
    icon: <FileCheck className="h-5 w-5" />,
    description: 'Validates file format, size, and content structure'
  },
  'ProcessOCR': {
    id: 'ProcessOCR',
    name: 'ProcessOCR',
    displayName: 'OCR Processing',
    icon: <Brain className="h-5 w-5" />,
    description: 'Extracts text content using Mistral OCR technology'
  },
  'ChunkDocument': {
    id: 'ChunkDocument',
    name: 'ChunkDocument',
    displayName: 'Document Chunking',
    icon: <FileText className="h-5 w-5" />,
    description: 'Intelligently splits document into semantic chunks'
  },
  'GenerateEmbeddings': {
    id: 'GenerateEmbeddings',
    name: 'GenerateEmbeddings',
    displayName: 'Generate Embeddings',
    icon: <Database className="h-5 w-5" />,
    description: 'Creates vector embeddings using AWS Titan v2'
  },
  'InsertDatabase': {
    id: 'InsertDatabase',
    name: 'InsertDatabase',
    displayName: 'Database Insertion',
    icon: <Search className="h-5 w-5" />,
    description: 'Stores processed data and embeddings in PostgreSQL'
  },
  'EnhanceMetadata': {
    id: 'EnhanceMetadata',
    name: 'EnhanceMetadata',
    displayName: 'Metadata Enhancement',
    icon: <Zap className="h-5 w-5" />,
    description: 'Enhances document metadata using AI analysis'
  }
};

export function PipelineVisualization({
  executionId,
  className = '',
  showControls = false,
  compact = false,
  execution,
  steps: propSteps,
  progress: propProgress
}: PipelineVisualizationProps) {
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [showTimings, setShowTimings] = useState(false);

  // Use real-time hook if executionId is provided
  const realtimeState = useStepFunctionsRealtime(
    executionId ? { executionId } : {}
  );

  // Use props if provided, otherwise use real-time state
  const currentExecution = execution || realtimeState.execution;
  const currentSteps = propSteps || realtimeState.steps;
  const currentProgress = propProgress || realtimeState.progress;

  // Transform steps data into pipeline steps
  const pipelineSteps: PipelineStep[] = useMemo(() => {
    const stepOrder = ['ValidateFile', 'ProcessOCR', 'ChunkDocument', 'GenerateEmbeddings', 'InsertDatabase', 'EnhanceMetadata'];

    return stepOrder.map((stepName, index) => {
      const stepDef = STEP_DEFINITIONS[stepName];
      const runtimeStep = currentSteps?.find(s => s.name === stepName);

      return {
        ...stepDef,
        status: runtimeStep?.status || 'PENDING',
        order: index + 1,
        startedAt: runtimeStep?.startedAt,
        completedAt: runtimeStep?.completedAt,
        duration: runtimeStep?.startedAt && runtimeStep?.completedAt
          ? new Date(runtimeStep.completedAt).getTime() - new Date(runtimeStep.startedAt).getTime()
          : undefined,
        errorMessage: runtimeStep?.status === 'FAILED' ? 'Step execution failed' : undefined
      };
    });
  }, [currentSteps]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUCCEEDED':
        return 'bg-green-100 border-green-300 text-green-800';
      case 'RUNNING':
        return 'bg-blue-100 border-blue-300 text-blue-800';
      case 'FAILED':
        return 'bg-red-100 border-red-300 text-red-800';
      case 'SKIPPED':
        return 'bg-yellow-100 border-yellow-300 text-yellow-800';
      default:
        return 'bg-gray-100 border-gray-300 text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCEEDED':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'RUNNING':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'FAILED':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'SKIPPED':
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const getCurrentStepIndex = () => {
    return pipelineSteps.findIndex(step => step.status === 'RUNNING');
  };

  const getOverallStatus = () => {
    if (pipelineSteps.some(step => step.status === 'FAILED')) return 'FAILED';
    if (pipelineSteps.some(step => step.status === 'RUNNING')) return 'RUNNING';
    if (pipelineSteps.every(step => step.status === 'SUCCEEDED')) return 'SUCCEEDED';
    return 'PENDING';
  };

  if (compact) {
    return (
      <div className={`space-y-3 ${className}`}>
        {/* Compact Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Pipeline Progress</span>
            <span>{currentProgress?.percentage || 0}%</span>
          </div>
          <Progress value={currentProgress?.percentage || 0} className="h-2" />
          <div className="flex justify-between text-xs text-gray-600">
            <span>{currentProgress?.completed || 0} / {currentProgress?.total || 6} completed</span>
            <span>{currentProgress?.running || 0} running</span>
          </div>
        </div>

        {/* Compact Step List */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {pipelineSteps.map((step, index) => (
            <div
              key={step.id}
              className={`p-2 rounded border text-xs ${getStatusColor(step.status)}`}
            >
              <div className="flex items-center gap-1 mb-1">
                {step.icon}
                <span className="font-medium truncate">{step.displayName}</span>
              </div>
              <div className="flex items-center gap-1">
                {getStatusIcon(step.status)}
                <span>{step.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className={`space-y-6 ${className}`}>
        {/* Pipeline Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Play className="h-5 w-5" />
              Step Functions Pipeline
            </h3>
            {currentExecution && (
              <p className="text-sm text-gray-600">
                Execution: {currentExecution.id.slice(0, 8)}... • {currentExecution.fileName}
              </p>
            )}
          </div>

          {showControls && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTimings(!showTimings)}
              >
                <Timer className="h-4 w-4 mr-1" />
                {showTimings ? 'Hide' : 'Show'} Timings
              </Button>
            </div>
          )}
        </div>

        {/* Overall Progress */}
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">Overall Progress</span>
                <Badge variant={
                  getOverallStatus() === 'SUCCEEDED' ? 'default' :
                  getOverallStatus() === 'FAILED' ? 'destructive' :
                  getOverallStatus() === 'RUNNING' ? 'secondary' : 'outline'
                }>
                  {getOverallStatus()}
                </Badge>
              </div>

              <Progress value={currentProgress?.percentage || 0} className="h-3" />

              <div className="flex justify-between text-sm text-gray-600">
                <span>{currentProgress?.completed || 0} of {currentProgress?.total || 6} steps completed</span>
                <span>{currentProgress?.percentage || 0}%</span>
              </div>

              {currentProgress?.running > 0 && (
                <div className="text-sm text-blue-600">
                  {currentProgress.running} step{currentProgress.running > 1 ? 's' : ''} currently running
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pipeline Steps */}
        <div className="space-y-4">
          {pipelineSteps.map((step, index) => (
            <div key={step.id} className="relative">
              {/* Connection Line */}
              {index < pipelineSteps.length - 1 && (
                <div className="absolute left-6 top-16 w-0.5 h-8 bg-gray-300 z-0"></div>
              )}

              <Card className={`relative z-10 transition-all hover:shadow-md ${
                selectedStep === step.id ? 'ring-2 ring-blue-500' : ''
              } ${step.status === 'RUNNING' ? 'shadow-blue-100' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      {/* Step Icon */}
                      <div className={`p-3 rounded-full border-2 ${getStatusColor(step.status)}`}>
                        {step.icon}
                      </div>

                      {/* Step Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold">{step.displayName}</h4>
                          <Badge variant="outline" className="text-xs">
                            Step {step.order}
                          </Badge>
                          {getStatusIcon(step.status)}
                        </div>

                        <p className="text-sm text-gray-600 mb-3">{step.description}</p>

                        {/* Timing Information */}
                        {(showTimings || step.status === 'RUNNING') && (
                          <div className="space-y-1 text-xs text-gray-500">
                            {step.startedAt && (
                              <div>Started: {new Date(step.startedAt).toLocaleTimeString()}</div>
                            )}
                            {step.completedAt && (
                              <div>Completed: {new Date(step.completedAt).toLocaleTimeString()}</div>
                            )}
                            {step.duration && (
                              <div>Duration: {formatDuration(step.duration)}</div>
                            )}
                            {step.status === 'RUNNING' && step.startedAt && (
                              <div>Running for: {formatDuration(Date.now() - new Date(step.startedAt).getTime())}</div>
                            )}
                          </div>
                        )}

                        {/* Error Message */}
                        {step.status === 'FAILED' && step.errorMessage && (
                          <Alert variant="destructive" className="mt-3">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription className="text-sm">
                              {step.errorMessage}
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </div>

                    {/* Step Actions */}
                    <div className="flex items-center gap-2">
                      {step.status === 'RUNNING' && (
                        <div className="flex items-center gap-1 text-blue-600">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm">Running...</span>
                        </div>
                      )}

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedStep(selectedStep === step.id ? null : step.id)}
                          >
                            <Info className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>View step details</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  {/* Expanded Step Details */}
                  {selectedStep === step.id && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Technical Name:</span>
                          <div className="text-gray-600">{step.name}</div>
                        </div>
                        <div>
                          <span className="font-medium">Status:</span>
                          <div className="text-gray-600">{step.status}</div>
                        </div>
                        {step.startedAt && (
                          <div>
                            <span className="font-medium">Started At:</span>
                            <div className="text-gray-600">{new Date(step.startedAt).toLocaleString()}</div>
                          </div>
                        )}
                        {step.completedAt && (
                          <div>
                            <span className="font-medium">Completed At:</span>
                            <div className="text-gray-600">{new Date(step.completedAt).toLocaleString()}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>

        {/* Pipeline Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{currentProgress?.completed || 0}</div>
                <div className="text-gray-600">Completed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{currentProgress?.running || 0}</div>
                <div className="text-gray-600">Running</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{currentProgress?.failed || 0}</div>
                <div className="text-gray-600">Failed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">{(currentProgress?.total || 6) - (currentProgress?.completed || 0) - (currentProgress?.running || 0) - (currentProgress?.failed || 0)}</div>
                <div className="text-gray-600">Pending</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}