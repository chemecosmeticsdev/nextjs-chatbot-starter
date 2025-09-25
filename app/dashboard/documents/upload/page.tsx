'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Upload, FileText, X, CheckCircle, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface UploadFile {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export default function DocumentUploadPage() {
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadSettings, setUploadSettings] = useState({
    extractText: true,
    generateSummary: false,
    enableSearch: true,
    processImages: false,
    autoTag: true,
  });

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    addFiles(files);
  };

  const addFiles = (files: File[]) => {
    const newFiles: UploadFile[] = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      progress: 0,
      status: 'pending'
    }));

    setUploadFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (id: string) => {
    setUploadFiles(prev => prev.filter(f => f.id !== id));
  };

  const simulateUpload = (fileId: string) => {
    setUploadFiles(prev => prev.map(f =>
      f.id === fileId ? { ...f, status: 'uploading' as const } : f
    ));

    const interval = setInterval(() => {
      setUploadFiles(prev => prev.map(f => {
        if (f.id === fileId && f.status === 'uploading') {
          const newProgress = f.progress + Math.random() * 20;
          if (newProgress >= 100) {
            clearInterval(interval);
            return { ...f, progress: 100, status: 'success' as const };
          }
          return { ...f, progress: newProgress };
        }
        return f;
      }));
    }, 500);
  };

  const uploadAll = () => {
    uploadFiles.forEach(file => {
      if (file.status === 'pending') {
        simulateUpload(file.id);
      }
    });
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    return <FileText className="h-6 w-6 text-blue-600" />;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'uploading':
        return <Badge className="bg-blue-100 text-blue-800">Uploading</Badge>;
      case 'success':
        return <Badge className="bg-green-100 text-green-800">Success</Badge>;
      case 'error':
        return <Badge className="bg-red-100 text-red-800">Error</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Upload Documents</h1>
          <p className="text-muted-foreground">
            Add new documents to your knowledge base
          </p>
        </div>
        <Button variant="outline" asChild>
          <a href="/dashboard/documents">Back to Documents</a>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>File Upload</CardTitle>
              <CardDescription>
                Drop files here or click to browse. Supported formats: PDF, DOC, DOCX, TXT, MD
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  isDragOver
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <div className="space-y-2">
                  <p className="text-lg font-medium">
                    Drop files here to upload
                  </p>
                  <p className="text-sm text-muted-foreground">
                    or click to browse from your computer
                  </p>
                  <Input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.txt,.md"
                    onChange={handleFileInput}
                    className="hidden"
                    id="file-upload"
                  />
                  <Label htmlFor="file-upload" className="cursor-pointer">
                    <Button type="button" variant="outline" asChild>
                      <span>Browse Files</span>
                    </Button>
                  </Label>
                </div>
              </div>

              {uploadFiles.length > 0 && (
                <div className="mt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">
                      Files to Upload ({uploadFiles.length})
                    </h3>
                    <Button onClick={uploadAll} disabled={uploadFiles.every(f => f.status !== 'pending')}>
                      Upload All
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {uploadFiles.map((uploadFile) => (
                      <div key={uploadFile.id} className="flex items-center space-x-3 p-3 border rounded-lg">
                        <div className="flex-shrink-0">
                          {getFileIcon(uploadFile.file.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium truncate">
                              {uploadFile.file.name}
                            </p>
                            <div className="flex items-center space-x-2">
                              {getStatusBadge(uploadFile.status)}
                              {getStatusIcon(uploadFile.status)}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {(uploadFile.file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                          {uploadFile.status === 'uploading' && (
                            <Progress value={uploadFile.progress} className="mt-2" />
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFile(uploadFile.id)}
                          disabled={uploadFile.status === 'uploading'}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Upload Settings</CardTitle>
              <CardDescription>
                Configure how your documents should be processed
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Extract Text</Label>
                  <p className="text-xs text-muted-foreground">
                    Extract readable text from documents
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
                    Make document searchable
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
                    Automatically tag documents
                  </p>
                </div>
                <Switch
                  checked={uploadSettings.autoTag}
                  onCheckedChange={(checked) =>
                    setUploadSettings(prev => ({ ...prev, autoTag: checked }))
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Upload Guidelines</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>• Maximum file size: 50MB</p>
              <p>• Supported formats: PDF, DOC, DOCX, TXT, MD</p>
              <p>• Text extraction works best with structured documents</p>
              <p>• Processing time varies by file size and complexity</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}