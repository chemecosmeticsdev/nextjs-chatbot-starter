'use client';

import { useState, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Upload,
  FileText,
  Image,
  X,
  CheckCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';

interface FileItem {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
  documentId?: string;
  jobId?: string;
}

interface FileDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  onUpload: (files: File[], settings: any) => Promise<void>;
  maxFiles?: number;
  maxFileSize?: number; // in MB
  acceptedTypes?: string[];
  settings: any;
}

const DEFAULT_ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'text/plain',
  'text/markdown',
  'application/rtf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/bmp',
  'image/tiff'
];

const FILE_TYPE_NAMES: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word (DOCX)',
  'application/msword': 'Word (DOC)',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel (XLSX)',
  'application/vnd.ms-excel': 'Excel (XLS)',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint (PPTX)',
  'application/vnd.ms-powerpoint': 'PowerPoint (PPT)',
  'text/plain': 'Text',
  'text/markdown': 'Markdown',
  'application/rtf': 'RTF',
  'image/jpeg': 'JPEG Image',
  'image/png': 'PNG Image',
  'image/gif': 'GIF Image',
  'image/bmp': 'BMP Image',
  'image/tiff': 'TIFF Image'
};

export function FileDropzone({
  onFilesSelected,
  onUpload,
  maxFiles = 10,
  maxFileSize = 50,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  settings
}: FileDropzoneProps) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): { valid: boolean; error?: string } => {
    if (file.size > maxFileSize * 1024 * 1024) {
      return {
        valid: false,
        error: `File too large. Maximum size is ${maxFileSize}MB`
      };
    }

    if (!acceptedTypes.includes(file.type)) {
      return {
        valid: false,
        error: `Unsupported file type: ${file.type}`
      };
    }

    return { valid: true };
  }, [maxFileSize, acceptedTypes]);

  const addFiles = useCallback((newFiles: File[]) => {
    const validFiles: FileItem[] = [];
    const errors: string[] = [];

    for (const file of newFiles) {
      // Check if file already exists
      if (files.find(f => f.file.name === file.name && f.file.size === file.size)) {
        errors.push(`"${file.name}" is already selected`);
        continue;
      }

      // Validate file
      const validation = validateFile(file);
      if (!validation.valid) {
        errors.push(`"${file.name}": ${validation.error}`);
        continue;
      }

      validFiles.push({
        id: `${file.name}-${file.size}-${Date.now()}`,
        file,
        status: 'pending',
        progress: 0
      });
    }

    if (files.length + validFiles.length > maxFiles) {
      errors.push(`Maximum ${maxFiles} files allowed`);
      return;
    }

    if (validFiles.length > 0) {
      const updatedFiles = [...files, ...validFiles];
      setFiles(updatedFiles);
      onFilesSelected(updatedFiles.map(f => f.file));
    }

    if (errors.length > 0) {
      setUploadError(errors.join(', '));
      setTimeout(() => setUploadError(null), 5000);
    }
  }, [files, validateFile, maxFiles, onFilesSelected]);

  const removeFile = useCallback((fileId: string) => {
    const updatedFiles = files.filter(f => f.id !== fileId);
    setFiles(updatedFiles);
    onFilesSelected(updatedFiles.map(f => f.file));
  }, [files, onFilesSelected]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  }, [addFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      addFiles(selectedFiles);
    }
  }, [addFiles]);

  const handleUpload = useCallback(async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      // Update all files to uploading status
      setFiles(prev => prev.map(f => ({ ...f, status: 'uploading' as const, progress: 0 })));

      // Call the upload function
      await onUpload(files.map(f => f.file), settings);

      // Mark all files as successful
      setFiles(prev => prev.map(f => ({ ...f, status: 'success' as const, progress: 100 })));

    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setUploadError(errorMessage);

      // Mark all files as error
      setFiles(prev => prev.map(f => ({ ...f, status: 'error' as const, error: errorMessage })));
    } finally {
      setIsUploading(false);
    }
  }, [files, onUpload, settings]);

  const clearFiles = useCallback(() => {
    setFiles([]);
    setUploadError(null);
    onFilesSelected([]);
  }, [onFilesSelected]);

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <Image className="h-5 w-5 text-green-600" />;
    }
    return <FileText className="h-5 w-5 text-blue-600" />;
  };

  const getStatusIcon = (status: FileItem['status']) => {
    switch (status) {
      case 'pending':
        return null;
      case 'uploading':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <Card
        className={`border-2 border-dashed transition-colors ${
          isDragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <Upload className="h-6 w-6 text-blue-600" />
          </div>

          <h3 className="text-lg font-semibold mb-2">
            Drop files here or click to browse
          </h3>

          <p className="text-muted-foreground mb-4">
            Support for {FILE_TYPE_NAMES['application/pdf']}, Word, Excel, PowerPoint, Images and more
          </p>

          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              variant="outline"
            >
              <Upload className="h-4 w-4 mr-2" />
              Browse Files
            </Button>

            {files.length > 0 && (
              <Button
                onClick={clearFiles}
                disabled={isUploading}
                variant="ghost"
              >
                Clear All
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Maximum {maxFiles} files, up to {maxFileSize}MB each
          </p>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={acceptedTypes.join(',')}
            onChange={handleFileSelect}
            className="hidden"
          />
        </CardContent>
      </Card>

      {/* Upload Error */}
      {uploadError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{uploadError}</AlertDescription>
        </Alert>
      )}

      {/* Selected Files */}
      {files.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold">
                Selected Files ({files.length}/{maxFiles})
              </h4>
              {files.length > 0 && !isUploading && (
                <Button
                  onClick={handleUpload}
                  size="sm"
                  disabled={files.length === 0}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload {files.length} {files.length === 1 ? 'File' : 'Files'}
                </Button>
              )}
            </div>

            <div className="space-y-3">
              {files.map((fileItem) => (
                <div
                  key={fileItem.id}
                  className="flex items-center gap-3 p-3 border rounded-lg"
                >
                  <div className="flex-shrink-0">
                    {getFileIcon(fileItem.file)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium truncate">
                        {fileItem.file.name}
                      </p>
                      <Badge variant="secondary" className="text-xs">
                        {FILE_TYPE_NAMES[fileItem.file.type] || fileItem.file.type}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(fileItem.file.size)}
                    </p>

                    {fileItem.status === 'uploading' && (
                      <Progress value={fileItem.progress} className="mt-2 h-1" />
                    )}

                    {fileItem.error && (
                      <p className="text-xs text-red-600 mt-1">{fileItem.error}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {getStatusIcon(fileItem.status)}

                    {fileItem.status === 'pending' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(fileItem.id)}
                        disabled={isUploading}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}