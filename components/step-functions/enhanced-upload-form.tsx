'use client';

import { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  CheckCircle,
  AlertCircle,
  FileText,
  Loader2,
  Clock,
  Play,
  RotateCcw,
  X,
  Info
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import {
  uploadFileWithRetry,
  apiRequestWithRetry,
  validateFileEnhanced,
  formatErrorForUser,
  enhanceError,
  type EnhancedError,
  ErrorCategory
} from '@/lib/utils/error-handling';

interface FileItem {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'uploaded' | 'processing' | 'completed' | 'failed';
  uploadProgress: number;
  processingProgress?: number;
  executionId?: string;
  fileKey?: string;
  error?: EnhancedError;
  retryCount?: number;
}

interface UploadSettings {
  autoStart: boolean;
  uploadedBy?: string;
  documentType: string;
  documentCategory: string;
  supplierName?: string;
  ingredientName?: string;
}

interface EnhancedUploadFormProps {
  settings: UploadSettings;
  onFileUploaded?: (result: any) => void;
  onExecutionStarted?: (execution: any) => void;
}

export function EnhancedUploadForm({
  settings,
  onFileUploaded,
  onExecutionStarted
}: EnhancedUploadFormProps) {
  const [selectedFiles, setSelectedFiles] = useState<FileItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [globalError, setGlobalError] = useState<EnhancedError | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const validFiles: FileItem[] = [];
      const errors: string[] = [];

      files.forEach(file => {
        const validation = validateFileEnhanced(file);
        if (validation.valid) {
          validFiles.push({
            id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
            file,
            status: 'pending',
            uploadProgress: 0,
            retryCount: 0
          });
        } else if (validation.error) {
          const formatted = formatErrorForUser(validation.error);
          errors.push(`${file.name}: ${formatted.title}`);
        }
      });

      if (errors.length > 0) {
        setGlobalError(enhanceError(
          new Error(`File validation failed for ${errors.length} file(s)`),
          { operation: 'file_selection' }
        ));
      } else {
        setGlobalError(null);
      }

      setSelectedFiles(prev => [...prev, ...validFiles]);
    }
  }, []);

  const removeFile = useCallback((fileId: string) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== fileId));
    // Clear global error if no files remain
    setSelectedFiles(current => {
      const remaining = current.filter(f => f.id !== fileId);
      if (remaining.length === 0) {
        setGlobalError(null);
      }
      return remaining;
    });
  }, []);

  const retryFile = useCallback(async (fileId: string) => {
    const fileItem = selectedFiles.find(f => f.id === fileId);
    if (!fileItem) return;

    // Reset file status for retry
    setSelectedFiles(prev => prev.map(f =>
      f.id === fileId ? {
        ...f,
        status: 'pending',
        error: undefined,
        uploadProgress: 0,
        processingProgress: undefined
      } : f
    ));

    await uploadSingleFile(fileItem);
  }, [selectedFiles]);

  const uploadSingleFile = useCallback(async (fileItem: FileItem) => {
    const fileId = fileItem.id;

    try {
      // Update status to uploading
      setSelectedFiles(prev => prev.map(f =>
        f.id === fileId ? { ...f, status: 'uploading', uploadProgress: 0, error: undefined } : f
      ));

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setSelectedFiles(prev => prev.map(f => {
          if (f.id === fileId && f.status === 'uploading' && f.uploadProgress < 90) {
            return { ...f, uploadProgress: f.uploadProgress + Math.random() * 20 };
          }
          return f;
        }));
      }, 500);

      // Prepare form data
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

      // Upload with retry mechanism
      const uploadResult = await uploadFileWithRetry(
        fileItem.file,
        async () => {
          const response = await fetch('/api/step-functions/upload', {
            method: 'POST',
            body: formData
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const error = new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
            (error as any).status = response.status;
            throw error;
          }

          return response.json();
        },
        {
          maxAttempts: fileItem.retryCount && fileItem.retryCount > 0 ? 2 : 3,
          baseDelay: 2000
        }
      );

      clearInterval(progressInterval);

      if (!uploadResult.success) {
        throw enhanceError(
          new Error(uploadResult.error || 'Upload failed'),
          { operation: 'file_upload', fileName: fileItem.file.name }
        );
      }

      // Update file status based on upload and execution results
      let fileStatus: 'uploaded' | 'processing' | 'failed' = 'uploaded';
      let executionId: string | undefined = undefined;
      let fileError: EnhancedError | undefined = undefined;

      // Check if Step Functions execution was attempted and succeeded
      if (uploadResult.execution) {
        if (uploadResult.execution.error) {
          // Step Functions execution failed
          fileStatus = 'failed';
          fileError = enhanceError(
            new Error(uploadResult.execution.error),
            {
              operation: 'step_functions_execution',
              fileName: fileItem.file.name,
              category: ErrorCategory.CONFIGURATION
            }
          );
        } else if (uploadResult.execution.id) {
          // Step Functions execution succeeded
          fileStatus = 'processing';
          executionId = uploadResult.execution.id;
        }
      }

      setSelectedFiles(prev => prev.map(f =>
        f.id === fileId ? {
          ...f,
          status: fileStatus,
          uploadProgress: 100,
          fileKey: uploadResult.file.fileKey,
          executionId,
          error: fileError,
          retryCount: (f.retryCount || 0) + 1
        } : f
      ));

      // Notify parent component
      onFileUploaded?.(uploadResult);
      if (uploadResult.execution) {
        onExecutionStarted?.(uploadResult.execution);
      }

    } catch (error) {
      clearInterval(progressInterval);

      const enhanced = enhanceError(error as Error, {
        operation: 'file_upload',
        fileName: fileItem.file.name,
        fileSize: fileItem.file.size
      });

      setSelectedFiles(prev => prev.map(f =>
        f.id === fileId ? {
          ...f,
          status: 'failed',
          error: enhanced,
          retryCount: (f.retryCount || 0) + 1
        } : f
      ));

      console.error(`Upload failed for ${fileItem.file.name}:`, enhanced);
    }
  }, [settings, onFileUploaded, onExecutionStarted]);

  const startProcessing = useCallback(async (fileItem: FileItem) => {
    if (!fileItem.fileKey) return;

    try {
      const result = await apiRequestWithRetry('/api/step-functions/start', {
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

      // Check if Step Functions execution succeeded or failed
      if (result.success && result.execution && result.execution.id) {
        // Successful execution start
        setSelectedFiles(prev => prev.map(f =>
          f.id === fileItem.id ? {
            ...f,
            status: 'processing',
            executionId: result.execution.id
          } : f
        ));

        onExecutionStarted?.(result.execution);
      } else {
        // Step Functions execution failed
        const errorMessage = result.execution?.error || result.error || 'Step Functions execution failed to start';
        const enhanced = enhanceError(
          new Error(errorMessage),
          {
            operation: 'step_functions_execution',
            fileName: fileItem.file.name,
            category: ErrorCategory.CONFIGURATION
          }
        );

        setSelectedFiles(prev => prev.map(f =>
          f.id === fileItem.id ? {
            ...f,
            status: 'failed',
            error: enhanced
          } : f
        ));

        // Still notify parent component about the failure
        onExecutionStarted?.({
          error: errorMessage,
          fileName: fileItem.file.name
        });
      }

    } catch (error) {
      const enhanced = enhanceError(error as Error, {
        operation: 'start_processing',
        fileName: fileItem.file.name
      });

      setSelectedFiles(prev => prev.map(f =>
        f.id === fileItem.id ? {
          ...f,
          status: 'failed',
          error: enhanced
        } : f
      ));
    }
  }, [settings, onExecutionStarted]);

  const handleUploadAll = useCallback(async () => {
    const pendingFiles = selectedFiles.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setIsUploading(true);
    setGlobalError(null);

    try {
      // Upload files concurrently with limit
      const concurrencyLimit = 3;
      for (let i = 0; i < pendingFiles.length; i += concurrencyLimit) {
        const batch = pendingFiles.slice(i, i + concurrencyLimit);
        await Promise.allSettled(batch.map(file => uploadSingleFile(file)));
      }
    } catch (error) {
      setGlobalError(enhanceError(error as Error, { operation: 'batch_upload' }));
    } finally {
      setIsUploading(false);
    }
  }, [selectedFiles, uploadSingleFile]);

  const clearCompleted = useCallback(() => {
    setSelectedFiles(prev => prev.filter(f => !['completed', 'failed'].includes(f.status)));
    setGlobalError(null);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case 'processing':
        return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />;
      case 'uploading':
        return <Upload className="h-5 w-5 text-orange-600 animate-pulse" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'completed':
        return 'default';
      case 'failed':
        return 'destructive';
      case 'processing':
        return 'secondary';
      case 'uploading':
        return 'outline';
      default:
        return 'outline';
    }
  };

  return (
    <ErrorBoundary>
      <div className="space-y-4">
        {/* File Selection */}
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer"
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

        {/* Global Error */}
        {globalError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">{formatErrorForUser(globalError).title}</p>
                <p className="text-sm">{globalError.message}</p>
                {globalError.suggestion && (
                  <p className="text-sm opacity-90">{globalError.suggestion}</p>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Selected Files */}
        {selectedFiles.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Selected Files ({selectedFiles.length})</h4>
              <div className="flex gap-2">
                <Button
                  onClick={handleUploadAll}
                  disabled={isUploading || selectedFiles.every(f => f.status !== 'pending')}
                  size="sm"
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
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
                    <Badge variant={getStatusBadgeVariant(fileItem.status)}>
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

                    {fileItem.status === 'failed' && fileItem.error?.isRetryable && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => retryFile(fileItem.id)}
                        disabled={isUploading}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}

                    {fileItem.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeFile(fileItem.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {fileItem.error && (
                  <Alert variant="destructive" className="mt-3">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="space-y-1">
                        <p className="font-medium">{formatErrorForUser(fileItem.error).title}</p>
                        <p className="text-sm">{fileItem.error.message}</p>
                        {fileItem.error.suggestion && (
                          <p className="text-sm opacity-90 flex items-start gap-1">
                            <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            {fileItem.error.suggestion}
                          </p>
                        )}
                        {fileItem.retryCount && fileItem.retryCount > 1 && (
                          <p className="text-xs opacity-75">
                            Retry attempt: {fileItem.retryCount - 1}
                          </p>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}