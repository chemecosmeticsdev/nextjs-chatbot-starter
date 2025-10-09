'use client';

import { useState, useCallback, useRef } from 'react';
import { useBreadcrumbs } from '@/lib/hooks/use-breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  CheckCircle,
  AlertCircle,
  Settings,
  ArrowLeft,
  FileText,
  Loader2,
  Clock,
  FileCheck,
  Database,
  Brain,
  Search,
  Play,
  Pause,
  RotateCcw,
  Zap,
  Activity,
  Workflow
} from 'lucide-react';
import { StepFunctionsRealtimeProvider, ConnectionStatus, RealtimeDebugPanel } from '@/lib/providers/step-functions-realtime-provider';
import { useStepFunctionsRealtime } from '@/lib/hooks/use-step-functions-realtime';

interface StepFunctionsUploadSettings {
  autoStart: boolean;
  uploadedBy?: string;
  documentType: string;
  documentCategory: string;
  supplierName?: string;
  ingredientName?: string;
  metadata?: Record<string, any>;
}

interface FileItem {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'uploaded' | 'processing' | 'completed' | 'failed';
  uploadProgress: number;
  processingProgress?: number;
  executionId?: string;
  fileKey?: string;
  error?: string;
}

interface ExecutionInfo {
  id: string;
  fileName: string;
  status: string;
  startedAt: string;
  progress?: number;
  currentStep?: string;
  steps?: Array<{
    name: string;
    status: string;
    order: number;
  }>;
}

function StepFunctionsUploadForm() {
  const [selectedFiles, setSelectedFiles] = useState<FileItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [executions, setExecutions] = useState<ExecutionInfo[]>([]);
  const [settings, setSettings] = useState<StepFunctionsUploadSettings>({
    autoStart: true,
    uploadedBy: 'step-functions-user',
    documentType: 'inci',
    documentCategory: 'technical_data'
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Real-time Step Functions updates
  const realtimeState = useStepFunctionsRealtime({
    onUpdate: (update) => {
      console.log('Step Functions update:', update);

      // Update execution info based on real-time updates
      if (update.type === 'execution_update' && update.data.execution) {
        setExecutions(prev => {
          const existing = prev.find(e => e.id === update.data.execution.id);
          if (existing) {
            return prev.map(e => e.id === update.data.execution.id ? {
              ...e,
              status: update.data.execution.status,
              progress: update.data.progress?.percentage || e.progress,
              currentStep: update.data.progress?.current_step,
              steps: update.data.steps
            } : e);
          } else {
            return [...prev, {
              id: update.data.execution.id,
              fileName: update.data.execution.fileName,
              status: update.data.execution.status,
              startedAt: update.data.execution.startedAt,
              progress: update.data.progress?.percentage || 0,
              currentStep: update.data.progress?.current_step,
              steps: update.data.steps
            }];
          }
        });

        // Update file status based on execution updates
        setSelectedFiles(prev => prev.map(file => {
          if (file.executionId === update.data.execution.id) {
            return {
              ...file,
              status: update.data.execution.status === 'SUCCEEDED' ? 'completed' :
                     update.data.execution.status === 'FAILED' ? 'failed' : 'processing',
              processingProgress: update.data.progress?.percentage || file.processingProgress
            };
          }
          return file;
        }));
      }
    }
  });

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return { valid: false, error: 'File too large (max 50MB)' };
    }

    const supportedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'application/rtf',
      'image/jpeg',
      'image/png',
      'image/tiff'
    ];

    if (!supportedTypes.includes(file.type)) {
      return { valid: false, error: 'Unsupported file type' };
    }

    return { valid: true };
  };

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const validFiles: FileItem[] = [];

      files.forEach(file => {
        const validation = validateFile(file);
        if (validation.valid) {
          validFiles.push({
            id: `${file.name}-${file.size}-${Date.now()}`,
            file,
            status: 'pending',
            uploadProgress: 0
          });
        } else {
          setUploadError(validation.error || 'File validation failed');
        }
      });

      setSelectedFiles(prev => [...prev, ...validFiles]);
    }
  }, []);

  const removeFile = useCallback((fileId: string) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== fileId));
  }, []);

  const handleUpload = useCallback(async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      // Update file status to uploading
      setSelectedFiles(prev => prev.map(f => ({ ...f, status: 'uploading', uploadProgress: 0 })));

      for (const fileItem of selectedFiles) {
        const formData = new FormData();
        formData.append('file', fileItem.file);
        formData.append('uploadedBy', settings.uploadedBy || 'step-functions-user');
        formData.append('documentType', settings.documentType);
        formData.append('documentCategory', settings.documentCategory);
        formData.append('autoStart', settings.autoStart.toString());

        if (settings.supplierName) {
          formData.append('metadata', JSON.stringify({
            supplierName: settings.supplierName,
            ingredientName: settings.ingredientName
          }));
        }

        // Upload file to Step Functions endpoint
        const uploadResponse = await fetch('/api/step-functions/upload', {
          method: 'POST',
          body: formData
        });

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed: ${uploadResponse.statusText}`);
        }

        const uploadResult = await uploadResponse.json();

        if (!uploadResult.success) {
          throw new Error(uploadResult.error || 'Upload failed');
        }

        // Update file with upload results
        setSelectedFiles(prev => prev.map(f =>
          f.id === fileItem.id ? {
            ...f,
            status: uploadResult.execution ? 'processing' : 'uploaded',
            uploadProgress: 100,
            fileKey: uploadResult.file.fileKey,
            executionId: uploadResult.execution?.id
          } : f
        ));

        // If execution was started, add to executions list
        if (uploadResult.execution) {
          setExecutions(prev => [...prev, {
            id: uploadResult.execution.id,
            fileName: uploadResult.file.fileName,
            status: uploadResult.execution.status,
            startedAt: uploadResult.execution.startedAt,
            progress: 0
          }]);
        }
      }

    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setUploadError(errorMessage);

      setSelectedFiles(prev => prev.map(f => ({
        ...f,
        status: 'failed',
        error: errorMessage
      })));
    } finally {
      setIsUploading(false);
    }
  }, [selectedFiles, settings]);

  const startProcessing = useCallback(async (fileItem: FileItem) => {
    if (!fileItem.fileKey) return;

    try {
      const response = await fetch('/api/step-functions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: fileItem.file.name,
          fileKey: fileItem.fileKey,
          fileSize: fileItem.file.size,
          mimeType: fileItem.file.type,
          uploadedBy: settings.uploadedBy,
          documentType: settings.documentType,
          documentCategory: settings.documentCategory
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to start processing: ${response.statusText}`);
      }

      const result = await response.json();

      setSelectedFiles(prev => prev.map(f =>
        f.id === fileItem.id ? {
          ...f,
          status: 'processing',
          executionId: result.execution.id
        } : f
      ));

      setExecutions(prev => [...prev, {
        id: result.execution.id,
        fileName: fileItem.file.name,
        status: result.execution.status,
        startedAt: result.execution.startedAt,
        progress: 0
      }]);

    } catch (error) {
      console.error('Start processing error:', error);
      setSelectedFiles(prev => prev.map(f =>
        f.id === fileItem.id ? {
          ...f,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Failed to start processing'
        } : f
      ));
    }
  }, [settings]);

  const clearCompleted = useCallback(() => {
    setSelectedFiles(prev => prev.filter(f => !['completed', 'failed'].includes(f.status)));
    setExecutions(prev => prev.filter(e => !['SUCCEEDED', 'FAILED'].includes(e.status)));
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
      case 'SUCCEEDED':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'failed':
      case 'FAILED':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case 'processing':
      case 'RUNNING':
        return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />;
      case 'uploading':
        return <Upload className="h-5 w-5 text-orange-600 animate-pulse" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStepIcon = (stepName: string) => {
    switch (stepName) {
      case 'ValidateFile':
        return <FileCheck className="h-4 w-4" />;
      case 'ProcessOCR':
        return <Brain className="h-4 w-4" />;
      case 'ChunkDocument':
        return <FileText className="h-4 w-4" />;
      case 'GenerateEmbeddings':
        return <Database className="h-4 w-4" />;
      case 'InsertDatabase':
        return <Search className="h-4 w-4" />;
      case 'EnhanceMetadata':
        return <Zap className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Workflow className="h-8 w-8 text-blue-600" />
            Step Functions Upload
          </h1>
          <p className="text-muted-foreground">
            Upload documents using AWS Step Functions for reliable, scalable processing
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ConnectionStatus />
          <Button variant="outline" asChild>
            <a href="/dashboard/documents">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Documents
            </a>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          {/* File Upload Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Document Upload
              </CardTitle>
              <CardDescription>
                Upload documents for processing with AWS Step Functions. Real-time progress tracking included.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* File Selection */}
                <div
                  className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg font-medium mb-2">Drop files here or click to browse</p>
                  <p className="text-sm text-gray-600">PDF, Word, Images, and more (max 50MB each)</p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.md,.rtf,.jpg,.jpeg,.png,.tiff"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {/* Upload Error */}
                {uploadError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{uploadError}</AlertDescription>
                  </Alert>
                )}

                {/* Selected Files */}
                {selectedFiles.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Selected Files ({selectedFiles.length})</h4>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleUpload}
                          disabled={isUploading || selectedFiles.every(f => f.status !== 'pending')}
                          size="sm"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Files
                        </Button>
                        <Button onClick={clearCompleted} variant="outline" size="sm">
                          Clear Completed
                        </Button>
                      </div>
                    </div>

                    {selectedFiles.map((fileItem) => (
                      <Card key={fileItem.id} className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1">
                            <FileText className="h-5 w-5 text-blue-600" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{fileItem.file.name}</p>
                              <p className="text-sm text-gray-600">
                                {(fileItem.file.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                              {fileItem.status === 'uploading' && (
                                <Progress value={fileItem.uploadProgress} className="mt-2 h-2" />
                              )}
                              {fileItem.status === 'processing' && fileItem.processingProgress !== undefined && (
                                <Progress value={fileItem.processingProgress} className="mt-2 h-2" />
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge variant={
                              fileItem.status === 'completed' ? 'default' :
                              fileItem.status === 'failed' ? 'destructive' :
                              fileItem.status === 'processing' ? 'secondary' : 'outline'
                            }>
                              {fileItem.status}
                            </Badge>
                            {getStatusIcon(fileItem.status)}

                            {fileItem.status === 'uploaded' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startProcessing(fileItem)}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            )}

                            {fileItem.status === 'pending' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removeFile(fileItem.id)}
                              >
                                <AlertCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {fileItem.error && (
                          <Alert variant="destructive" className="mt-3">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{fileItem.error}</AlertDescription>
                          </Alert>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Step Functions Executions */}
          {executions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Step Functions Executions
                </CardTitle>
                <CardDescription>
                  Real-time monitoring of document processing workflows
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {executions.map((execution) => (
                    <Card key={execution.id} className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="font-medium flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            {execution.fileName}
                          </h4>
                          <p className="text-sm text-gray-600">
                            Execution ID: {execution.id.slice(0, 8)}...
                          </p>
                          <p className="text-sm text-gray-600">
                            Started: {new Date(execution.startedAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={
                            execution.status === 'SUCCEEDED' ? 'default' :
                            execution.status === 'FAILED' ? 'destructive' : 'secondary'
                          }>
                            {execution.status}
                          </Badge>
                          {getStatusIcon(execution.status)}
                        </div>
                      </div>

                      {execution.progress !== undefined && (
                        <div className="mb-3">
                          <div className="flex justify-between text-sm mb-1">
                            <span>Progress</span>
                            <span>{execution.progress}%</span>
                          </div>
                          <Progress value={execution.progress} className="h-2" />
                          {execution.currentStep && (
                            <p className="text-sm text-gray-600 mt-1">
                              Current: {execution.currentStep}
                            </p>
                          )}
                        </div>
                      )}

                      {execution.steps && execution.steps.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {execution.steps.map((step) => (
                            <div
                              key={step.name}
                              className={`p-2 rounded border text-sm ${
                                step.status === 'SUCCEEDED' ? 'bg-green-50 border-green-200 text-green-800' :
                                step.status === 'RUNNING' ? 'bg-blue-50 border-blue-200 text-blue-800' :
                                step.status === 'FAILED' ? 'bg-red-50 border-red-200 text-red-800' :
                                'bg-gray-50 border-gray-200 text-gray-600'
                              }`}
                            >
                              <div className="flex items-center gap-1">
                                {getStepIcon(step.name)}
                                <span className="font-medium">{step.name}</span>
                              </div>
                              <p className="text-xs mt-1">{step.status}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Settings Panel */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Upload Settings
              </CardTitle>
              <CardDescription>
                Configure Step Functions processing options
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-start Processing</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically start Step Functions after upload
                  </p>
                </div>
                <Switch
                  checked={settings.autoStart}
                  onCheckedChange={(checked) =>
                    setSettings(prev => ({ ...prev, autoStart: checked }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Document Type</Label>
                <select
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  value={settings.documentType}
                  onChange={(e) =>
                    setSettings(prev => ({ ...prev, documentType: e.target.value }))
                  }
                >
                  <option value="inci">INCI Document</option>
                  <option value="sds">Safety Data Sheet</option>
                  <option value="specification">Product Specification</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label>Document Category</Label>
                <select
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  value={settings.documentCategory}
                  onChange={(e) =>
                    setSettings(prev => ({ ...prev, documentCategory: e.target.value }))
                  }
                >
                  <option value="technical_data">Technical Data</option>
                  <option value="regulatory">Regulatory</option>
                  <option value="marketing">Marketing</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label>Supplier Name (Optional)</Label>
                <Input
                  placeholder="e.g., BASF, DSM"
                  value={settings.supplierName || ''}
                  onChange={(e) =>
                    setSettings(prev => ({ ...prev, supplierName: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Ingredient Name (Optional)</Label>
                <Input
                  placeholder="e.g., Vitamin E"
                  value={settings.ingredientName || ''}
                  onChange={(e) =>
                    setSettings(prev => ({ ...prev, ingredientName: e.target.value }))
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Step Functions Benefits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>• <strong>Reliability:</strong> Built-in error handling and retries</p>
              <p>• <strong>Scalability:</strong> Processes multiple files concurrently</p>
              <p>• <strong>Visibility:</strong> Real-time progress tracking</p>
              <p>• <strong>Consistency:</strong> Guaranteed execution order</p>
              <p>• <strong>Monitoring:</strong> Detailed execution logs</p>
              <p>• <strong>Recovery:</strong> Automatic retry on failures</p>
            </CardContent>
          </Card>

          {/* Debug Panel for Development */}
          {process.env.NODE_ENV === 'development' && (
            <RealtimeDebugPanel />
          )}
        </div>
      </div>
    </div>
  );
}

export default function StepFunctionsUploadPage() {
  // Initialize breadcrumbs
  useBreadcrumbs({
    autoGenerate: true,
    trackAnalytics: false,
    customTitles: {
      '/dashboard/documents/step-functions': 'Step Functions Upload'
    }
  });

  return (
    <StepFunctionsRealtimeProvider>
      <StepFunctionsUploadForm />
    </StepFunctionsRealtimeProvider>
  );
}