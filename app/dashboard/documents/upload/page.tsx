'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useBreadcrumbs } from '@/lib/hooks/use-breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
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
  Search
} from 'lucide-react';
import { FileDropzone } from '@/components/upload/file-dropzone';

interface UploadSettings {
  extractText: boolean;
  generateSummary: boolean;
  enableSearch: boolean;
  processImages: boolean;
  autoTag: boolean;
  useLocalDocling: boolean;
  processingMethod: 'batch' | 'individual';
  priority: 'low' | 'normal' | 'high' | 'critical';
  supplierName?: string;
  ingredientName?: string;
}

interface DocumentStage {
  name: string;
  completed: boolean;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  updatedAt?: string;
  details?: string;
}

interface DocumentProgress {
  documentId: string;
  filename: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'not_found';
  progress: number;
  error?: string;
  stages: DocumentStage[];
  currentStage?: string;
  updatedAt: string;
}

interface ProcessingStatus {
  status: 'idle' | 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
  processedFiles: number;
  totalFiles: number;
  errors: string[];
  documents: DocumentProgress[];
  queuedJobs?: Array<{
    documentId: string;
    jobId: string;
    filename: string;
    status: 'queued' | 'error';
    error?: string;
  }>;
}

export default function DocumentUploadPage() {
  // Initialize breadcrumbs
  useBreadcrumbs({
    autoGenerate: true,
    trackAnalytics: false,
    customTitles: {
      '/dashboard/documents/upload': 'Upload Documents'
    }
  });

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({
    status: 'idle',
    progress: 0,
    message: '',
    processedFiles: 0,
    totalFiles: 0,
    errors: [],
    documents: []
  });
  const [uploadSettings, setUploadSettings] = useState<UploadSettings>({
    extractText: true,
    generateSummary: false,
    enableSearch: true,
    processImages: true,
    autoTag: true,
    useLocalDocling: true,
    processingMethod: 'batch',
    priority: 'normal'
  });

  // State for progress monitoring
  const [monitoringDocuments, setMonitoringDocuments] = useState<string[]>([]);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingStartTimeRef = useRef<number>(0);
  const pollingRetryCountRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Constants for polling behavior
  const POLLING_INTERVAL = 3000; // 3 seconds
  const POLLING_TIMEOUT = 10 * 60 * 1000; // 10 minutes
  const MAX_RETRY_COUNT = 5;

  // Function to stop polling with cleanup
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setMonitoringDocuments([]);
    pollingStartTimeRef.current = 0;
    pollingRetryCountRef.current = 0;
    console.log('Polling stopped and requests cancelled');
  }, []);

  // Function to poll document processing status
  const pollDocumentStatus = useCallback(async (documentIds: string[]) => {
    if (documentIds.length === 0) return;

    // Check for timeout
    const currentTime = Date.now();
    if (pollingStartTimeRef.current > 0 && (currentTime - pollingStartTimeRef.current) > POLLING_TIMEOUT) {
      console.warn('Polling timeout reached - stopping monitoring');
      stopPolling();
      setProcessingStatus(prev => ({
        ...prev,
        status: 'error',
        errors: [...prev.errors, 'Processing timeout - monitoring stopped after 10 minutes']
      }));
      return;
    }

    try {
      console.log('Polling status for documents:', documentIds);

      // Create AbortController for this request
      abortControllerRef.current = new AbortController();

      const response = await fetch('/api/v1/documents/status/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentIds,
          includeProgress: true,
          includeDetails: false
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Status check returned error');
      }

      // Reset retry count on successful poll
      pollingRetryCountRef.current = 0;

      if (result.data) {
        const { summary, documents } = result.data;

        // Map API response to our DocumentProgress format
        const documentProgress: DocumentProgress[] = documents.map((doc: any) => ({
          documentId: doc.documentId,
          filename: doc.filename || 'Unknown document',
          status: doc.status || 'pending',
          progress: doc.progress || 0,
          error: doc.error,
          stages: doc.stages || [],
          currentStage: doc.currentStage,
          updatedAt: doc.updatedAt || new Date().toISOString()
        }));

        // Calculate overall progress
        const overallProgress = documentProgress.length > 0
          ? documentProgress.reduce((sum, doc) => sum + doc.progress, 0) / documentProgress.length
          : 0;

        // Count completed documents
        const completedCount = summary.completed || 0;
        const processingCount = summary.processing || 0;
        const failedCount = summary.failed || 0;
        const pendingCount = summary.pending || 0;

        // Determine overall status
        let overallStatus: ProcessingStatus['status'] = 'processing';
        let statusMessage = '';

        if (completedCount === documentIds.length) {
          overallStatus = 'completed';
          statusMessage = `All ${documentIds.length} document${documentIds.length > 1 ? 's' : ''} processed successfully`;
        } else if (failedCount > 0 && processingCount === 0 && pendingCount === 0) {
          overallStatus = 'error';
          statusMessage = `Processing failed: ${failedCount} failed, ${completedCount} completed`;
        } else {
          statusMessage = `Processing ${documentIds.length} document${documentIds.length > 1 ? 's' : ''}: ${completedCount} completed, ${processingCount} processing, ${failedCount} failed`;
        }

        // Collect document-specific errors
        const documentErrors = documentProgress.filter(doc => doc.error).map(doc => `${doc.filename}: ${doc.error}`);

        // Update processing status
        setProcessingStatus(prev => ({
          ...prev,
          status: overallStatus,
          progress: Math.round(overallProgress),
          message: statusMessage,
          processedFiles: completedCount,
          documents: documentProgress,
          errors: documentErrors
        }));

        // Stop polling if all documents are completed or failed (no more processing)
        if (overallStatus === 'completed' || (overallStatus === 'error' && processingCount === 0)) {
          stopPolling();
          console.log(`Polling stopped - final status: ${overallStatus}`);
        }
      }
    } catch (error) {
      // Handle AbortError gracefully (request was cancelled)
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Polling request was cancelled');
        return;
      }

      console.error('Error polling document status:', error);
      pollingRetryCountRef.current++;

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // If we've exceeded retry limit, stop polling
      if (pollingRetryCountRef.current >= MAX_RETRY_COUNT) {
        console.error(`Max retry count (${MAX_RETRY_COUNT}) exceeded - stopping polling`);
        stopPolling();
        setProcessingStatus(prev => ({
          ...prev,
          status: 'error',
          errors: [...prev.errors, `Network error: ${errorMessage} (max retries exceeded)`]
        }));
        return;
      }

      // Add error to status but don't stop polling (temporary network issues)
      setProcessingStatus(prev => ({
        ...prev,
        errors: [...prev.errors, `Status check error (attempt ${pollingRetryCountRef.current}/${MAX_RETRY_COUNT}): ${errorMessage}`]
      }));

      console.log(`Will retry polling (${pollingRetryCountRef.current}/${MAX_RETRY_COUNT})`);
    }
  }, [stopPolling]); // Include stopPolling dependency for cleanup

  // Effect to manage polling
  useEffect(() => {
    if (monitoringDocuments.length > 0 && !pollingIntervalRef.current) {
      console.log('Starting polling for documents:', monitoringDocuments);

      // Set start time for timeout tracking
      pollingStartTimeRef.current = Date.now();
      pollingRetryCountRef.current = 0;

      // Initial poll
      pollDocumentStatus(monitoringDocuments);

      // Set up polling interval
      pollingIntervalRef.current = setInterval(() => {
        pollDocumentStatus(monitoringDocuments);
      }, POLLING_INTERVAL);
    } else if (monitoringDocuments.length === 0 && pollingIntervalRef.current) {
      console.log('Stopping polling - no documents to monitor');
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      pollingStartTimeRef.current = 0;
      pollingRetryCountRef.current = 0;
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [monitoringDocuments]); // Only depend on monitoringDocuments

  const handleFilesSelected = useCallback((files: File[]) => {
    setSelectedFiles(files);
    console.log('Selected files:', files.map(f => f.name));
  }, []);

  const handleUpload = useCallback(async (files: File[], settings: UploadSettings) => {
    console.log('Starting upload for', files.length, 'files');

    setProcessingStatus({
      status: 'uploading',
      progress: 0,
      message: 'Preparing files for upload...',
      processedFiles: 0,
      totalFiles: files.length,
      errors: [],
      documents: []
    });

    try {
      // Create FormData for file upload
      const formData = new FormData();

      // Add files
      files.forEach(file => {
        formData.append('files', file);
      });

      // Add settings
      formData.append('settings', JSON.stringify(settings));

      // Add user ID (using existing super admin user for now)
      formData.append('userId', '525baa17-e509-4f4f-a6e8-51fb8d570489'); // TODO: Get from auth context

      console.log('Sending upload request to /api/v1/documents/upload');

      // Upload files
      const response = await fetch('/api/v1/documents/upload', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      console.log('Upload response:', result);

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      // Extract document IDs from the upload response
      const documentIds = result.data.queuedJobs?.map((job: any) => job.documentId) || [];

      // Initialize document progress tracking
      const initialDocuments: DocumentProgress[] = documentIds.map((docId: string, index: number) => ({
        documentId: docId,
        filename: files[index]?.name || `Document ${index + 1}`,
        status: 'pending' as const,
        progress: 0,
        stages: [
          { name: 'text_extraction', completed: false, status: 'pending' as const, progress: 0 },
          { name: 'metadata_enhancement', completed: false, status: 'pending' as const, progress: 0 },
          { name: 'document_chunking', completed: false, status: 'pending' as const, progress: 0 },
          { name: 'embedding_generation', completed: false, status: 'pending' as const, progress: 0 },
          { name: 'vector_storage', completed: false, status: 'pending' as const, progress: 0 }
        ],
        updatedAt: new Date().toISOString()
      }));

      // Update status with job information
      setProcessingStatus({
        status: 'processing',
        progress: 5,
        message: `Successfully uploaded ${result.data.processedFiles} files. Processing started...`,
        processedFiles: 0,
        totalFiles: files.length,
        errors: result.data.errors || [],
        documents: initialDocuments,
        queuedJobs: result.data.queuedJobs
      });

      // Start monitoring processing progress
      console.log('Upload successful, jobs queued:', result.data.queuedJobs);

      if (documentIds.length > 0) {
        setMonitoringDocuments(documentIds);
        console.log('Started monitoring documents:', documentIds);
      }

    } catch (error) {
      console.error('Upload failed:', error);

      const errorMessage = error instanceof Error ? error.message : 'Upload failed';

      setProcessingStatus({
        status: 'error',
        progress: 0,
        message: errorMessage,
        processedFiles: 0,
        totalFiles: files.length,
        errors: [errorMessage],
        documents: []
      });
    }
  }, [uploadSettings]);

  const resetUpload = useCallback(() => {
    // Stop polling if active
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setMonitoringDocuments([]);
    pollingStartTimeRef.current = 0;
    pollingRetryCountRef.current = 0;

    setSelectedFiles([]);
    setProcessingStatus({
      status: 'idle',
      progress: 0,
      message: '',
      processedFiles: 0,
      totalFiles: 0,
      errors: [],
      documents: []
    });
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case 'uploading':
      case 'processing':
        return <Upload className="h-5 w-5 text-blue-600 animate-pulse" />;
      default:
        return null;
    }
  };

  const getStageIcon = (stageName: string) => {
    switch (stageName) {
      case 'text_extraction':
        return <FileCheck className="h-4 w-4" />;
      case 'metadata_enhancement':
        return <Brain className="h-4 w-4" />;
      case 'document_chunking':
        return <FileText className="h-4 w-4" />;
      case 'embedding_generation':
        return <Database className="h-4 w-4" />;
      case 'vector_storage':
        return <Search className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getStageDisplayName = (stageName: string) => {
    switch (stageName) {
      case 'text_extraction':
        return 'Text Extraction';
      case 'metadata_enhancement':
        return 'Metadata Enhancement';
      case 'document_chunking':
        return 'Document Chunking';
      case 'embedding_generation':
        return 'Embedding Generation';
      case 'vector_storage':
        return 'Vector Storage';
      default:
        return stageName.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  const getStageStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 border-green-200 bg-green-50';
      case 'processing':
        return 'text-blue-600 border-blue-200 bg-blue-50';
      case 'failed':
        return 'text-red-600 border-red-200 bg-red-50';
      default:
        return 'text-gray-400 border-gray-200 bg-gray-50';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Upload Documents</h1>
          <p className="text-muted-foreground">
            Upload documents directly from your computer for AI-enhanced processing
          </p>
        </div>
        <Button variant="outline" asChild>
          <a href="/dashboard/documents">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Documents
          </a>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          {/* File Upload Section */}
          {processingStatus.status === 'idle' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Document Upload
                </CardTitle>
                <CardDescription>
                  Select multiple files to upload and process. Supports PDF, Word, Excel, PowerPoint, images and more.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FileDropzone
                  onFilesSelected={handleFilesSelected}
                  onUpload={handleUpload}
                  maxFiles={20}
                  maxFileSize={50}
                  settings={uploadSettings}
                />
              </CardContent>
            </Card>
          )}

          {/* Optional Metadata Section */}
          {selectedFiles.length > 0 && processingStatus.status === 'idle' && (
            <Card>
              <CardHeader>
                <CardTitle>Document Metadata (Optional)</CardTitle>
                <CardDescription>
                  Provide additional context for better document processing and organization
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="supplier">Supplier Name</Label>
                    <Input
                      id="supplier"
                      placeholder="e.g., BASF, DSM, etc."
                      value={uploadSettings.supplierName || ''}
                      onChange={(e) =>
                        setUploadSettings(prev => ({ ...prev, supplierName: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="ingredient">Ingredient Name</Label>
                    <Input
                      id="ingredient"
                      placeholder="e.g., Vitamin E, Menthol, etc."
                      value={uploadSettings.ingredientName || ''}
                      onChange={(e) =>
                        setUploadSettings(prev => ({ ...prev, ingredientName: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    If not provided, our AI will attempt to extract supplier and ingredient information from the document content and filenames.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}

          {/* Enhanced Processing Status */}
          {processingStatus.status !== 'idle' && (
            <div className="space-y-4">
              {/* Overall Status Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {getStatusIcon(processingStatus.status)}
                    Processing Status
                  </CardTitle>
                  <CardDescription>
                    {processingStatus.message}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Overall Progress */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Overall Progress</span>
                      <span>{processingStatus.progress}%</span>
                    </div>
                    <Progress value={processingStatus.progress} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{processingStatus.processedFiles} / {processingStatus.totalFiles} documents completed</span>
                      <span>{(processingStatus.documents || []).filter(d => d.status === 'processing').length} processing</span>
                    </div>
                  </div>

                  {/* Global errors */}
                  {processingStatus.errors && processingStatus.errors.length > 0 && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <div className="space-y-1">
                          {processingStatus.errors.map((error, index) => (
                            <div key={index}>• {error}</div>
                          ))}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    {processingStatus.status === 'processing' && (
                      <Button
                        onClick={() => {
                          // Stop polling inline
                          if (pollingIntervalRef.current) {
                            clearInterval(pollingIntervalRef.current);
                            pollingIntervalRef.current = null;
                          }
                          setMonitoringDocuments([]);
                          pollingStartTimeRef.current = 0;
                          pollingRetryCountRef.current = 0;
                          console.log('Manual stop - monitoring disabled');
                        }}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2"
                      >
                        <AlertCircle className="h-4 w-4" />
                        Stop Monitoring
                      </Button>
                    )}

                    {(processingStatus.status === 'completed' || processingStatus.status === 'error') && (
                      <Button onClick={resetUpload} variant="outline" className="w-full">
                        Upload More Documents
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Individual Document Progress Cards */}
              {(processingStatus.documents || []).length > 0 && (
                <div className="space-y-3">
                  {(processingStatus.documents || []).map((document) => (
                    <Card key={document.documentId} className="overflow-hidden">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base flex items-center gap-2 truncate">
                              <FileText className="h-4 w-4 flex-shrink-0" />
                              {document.filename}
                            </CardTitle>
                            <CardDescription className="mt-1">
                              {document.status === 'processing' && document.currentStage && (
                                <span className="flex items-center gap-1">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Currently: {getStageDisplayName(document.currentStage)}
                                </span>
                              )}
                              {document.status === 'completed' && 'Processing completed successfully'}
                              {document.status === 'failed' && 'Processing failed'}
                              {document.status === 'pending' && 'Waiting to start...'}
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant={document.status === 'completed' ? 'default' :
                                           document.status === 'failed' ? 'destructive' :
                                           document.status === 'processing' ? 'secondary' : 'outline'}>
                              {document.status}
                            </Badge>
                            <span className="text-sm font-medium">{document.progress}%</span>
                          </div>
                        </div>

                        {/* Document Progress Bar */}
                        <Progress value={document.progress} className="h-1.5 mt-2" />
                      </CardHeader>

                      <CardContent className="pt-0">
                        {/* Processing Stages */}
                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                          {document.stages.map((stage) => (
                            <div
                              key={stage.name}
                              className={`p-3 rounded-lg border transition-all ${getStageStatusColor(stage.status)}`}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <div className={`p-1 rounded ${stage.completed ? 'text-inherit' : 'text-gray-400'}`}>
                                  {stage.status === 'processing' ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    getStageIcon(stage.name)
                                  )}
                                </div>
                                <span className="text-xs font-medium truncate">
                                  {getStageDisplayName(stage.name)}
                                </span>
                              </div>

                              {stage.status === 'processing' && stage.progress > 0 && (
                                <div className="space-y-1">
                                  <Progress value={stage.progress} className="h-1" />
                                  <span className="text-xs">{stage.progress}%</span>
                                </div>
                              )}

                              {stage.completed && (
                                <div className="flex items-center gap-1">
                                  <CheckCircle className="h-3 w-3 text-green-600" />
                                  <span className="text-xs">Done</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Document Error */}
                        {document.error && (
                          <Alert variant="destructive" className="mt-3">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription className="text-sm">
                              {document.error}
                            </AlertDescription>
                          </Alert>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Enhanced processing monitoring restored with real-time status tracking */}
        </div>

        {/* Settings Panel */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Processing Settings
              </CardTitle>
              <CardDescription>
                Configure how your documents should be processed
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Extract Text</Label>
                  <p className="text-xs text-muted-foreground">
                    Extract readable text from documents using OCR
                  </p>
                </div>
                <Switch
                  checked={uploadSettings.extractText}
                  onCheckedChange={(checked) =>
                    setUploadSettings(prev => ({ ...prev, extractText: checked }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Generate Summary</Label>
                  <p className="text-xs text-muted-foreground">
                    AI-generated document summary
                  </p>
                </div>
                <Switch
                  checked={uploadSettings.generateSummary}
                  onCheckedChange={(checked) =>
                    setUploadSettings(prev => ({ ...prev, generateSummary: checked }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Search</Label>
                  <p className="text-xs text-muted-foreground">
                    Make document searchable with vector embeddings
                  </p>
                </div>
                <Switch
                  checked={uploadSettings.enableSearch}
                  onCheckedChange={(checked) =>
                    setUploadSettings(prev => ({ ...prev, enableSearch: checked }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Process Images</Label>
                  <p className="text-xs text-muted-foreground">
                    Extract text from images (OCR)
                  </p>
                </div>
                <Switch
                  checked={uploadSettings.processImages}
                  onCheckedChange={(checked) =>
                    setUploadSettings(prev => ({ ...prev, processImages: checked }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto Tag</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically tag documents with AI
                  </p>
                </div>
                <Switch
                  checked={uploadSettings.autoTag}
                  onCheckedChange={(checked) =>
                    setUploadSettings(prev => ({ ...prev, autoTag: checked }))
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Use Enhanced OCR</Label>
                  <p className="text-xs text-muted-foreground">
                    Use Mistral OCR for improved accuracy
                  </p>
                </div>
                <Switch
                  checked={uploadSettings.useLocalDocling}
                  onCheckedChange={(checked) =>
                    setUploadSettings(prev => ({ ...prev, useLocalDocling: checked }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Processing Method</Label>
                <select
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  value={uploadSettings.processingMethod}
                  onChange={(e) =>
                    setUploadSettings(prev => ({ ...prev, processingMethod: e.target.value as 'batch' | 'individual' }))
                  }
                >
                  <option value="batch">Batch - Process all files together</option>
                  <option value="individual">Individual - Process files separately</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label>Processing Priority</Label>
                <select
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  value={uploadSettings.priority}
                  onChange={(e) =>
                    setUploadSettings(prev => ({ ...prev, priority: e.target.value as 'low' | 'normal' | 'high' | 'critical' }))
                  }
                >
                  <option value="low">Low - Process when system is idle</option>
                  <option value="normal">Normal - Standard processing</option>
                  <option value="high">High - Faster processing</option>
                  <option value="critical">Critical - Immediate processing</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Higher priority jobs are processed first
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Enhanced Processing Features</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>• <strong>AI-Enhanced OCR:</strong> Mistral OCR for superior text extraction</p>
              <p>• <strong>Smart Metadata:</strong> Nova Micro AI extracts supplier, ingredient, and document classification</p>
              <p>• <strong>Intelligent Chunking:</strong> 6 different strategies based on document type</p>
              <p>• <strong>Vector Embeddings:</strong> 1024-dimensional embeddings with AWS Titan v2</p>
              <p>• <strong>Quality Assurance:</strong> Comprehensive validation and quality scoring</p>
              <p>• <strong>Real-time Monitoring:</strong> Live processing status updates</p>
              <p>• <strong>Search Integration:</strong> Documents become instantly searchable</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}