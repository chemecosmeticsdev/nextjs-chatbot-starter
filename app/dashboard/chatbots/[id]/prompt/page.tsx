'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Edit3,
  History,
  Wand2,
  Upload,
  Save,
  RotateCcw,
  AlertCircle,
  CheckCircle,
  Clock,
  ArrowLeft,
  FileText,
  Trash2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PromptHistory {
  id: string;
  version: number;
  prompt: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  source: 'manual' | 'generated' | 'rollback';
}

interface GenerationJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  parameters: {
    businessContext: string;
    targetAudience?: string;
    communicationStyle: string;
    keyTopics?: string[];
    constraints?: string[];
  };
  generatedPrompt?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export default function ChatbotPromptPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const chatbotId = params.id as string;

  // State management
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [promptDescription, setPromptDescription] = useState('');
  const [promptHistory, setPromptHistory] = useState<PromptHistory[]>([]);
  const [generationJobs, setGenerationJobs] = useState<GenerationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('edit');

  // Generation form state
  const [businessContext, setBusinessContext] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [communicationStyle, setCommunicationStyle] = useState('professional');
  const [keyTopics, setKeyTopics] = useState<string>('');
  const [constraints, setConstraints] = useState<string>('');

  // File upload state
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchPromptData();
  }, [chatbotId]);

  const fetchPromptData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/v1/chatbots/${chatbotId}/prompt`, {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch prompt data');
      }

      const data = await response.json();
      setCurrentPrompt(data.data.currentPrompt || '');
      setPromptHistory(data.data.history || []);

      // Fetch generation jobs
      await fetchGenerationJobs();

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      toast({
        title: 'Error',
        description: 'Failed to load prompt data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchGenerationJobs = async () => {
    try {
      const response = await fetch(`/api/v1/chatbots/${chatbotId}/prompt/generate`, {
        method: 'GET',
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setGenerationJobs(data.data.jobs || []);
      }
    } catch (err) {
      console.error('Failed to fetch generation jobs:', err);
    }
  };

  const handleSavePrompt = async () => {
    if (!currentPrompt.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Prompt cannot be empty',
        variant: 'destructive'
      });
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(`/api/v1/chatbots/${chatbotId}/prompt`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          prompt: currentPrompt,
          description: promptDescription || undefined
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to save prompt');
      }

      const data = await response.json();

      toast({
        title: 'Success',
        description: `Prompt saved as version ${data.data.version}`,
      });

      // Reset form and refresh data
      setPromptDescription('');
      await fetchPromptData();

    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save prompt',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePrompt = async () => {
    if (!businessContext.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Business context is required for prompt generation',
        variant: 'destructive'
      });
      return;
    }

    try {
      setGenerating(true);

      const response = await fetch(`/api/v1/chatbots/${chatbotId}/prompt/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          businessContext,
          targetAudience: targetAudience || undefined,
          communicationStyle,
          keyTopics: keyTopics ? keyTopics.split(',').map(t => t.trim()).filter(t => t) : undefined,
          constraints: constraints ? constraints.split(',').map(c => c.trim()).filter(c => c) : undefined
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to generate prompt');
      }

      const data = await response.json();

      // Update current prompt with generated content
      setCurrentPrompt(data.data.generatedPrompt);
      setActiveTab('edit');

      toast({
        title: 'Success',
        description: 'Prompt generated successfully! Review and save if satisfied.',
      });

      // Refresh generation jobs
      await fetchGenerationJobs();

    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to generate prompt',
        variant: 'destructive'
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleRollback = async (version: number, reason?: string) => {
    try {
      const response = await fetch(`/api/v1/chatbots/${chatbotId}/prompt/rollback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          version,
          reason
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to rollback prompt');
      }

      const data = await response.json();

      toast({
        title: 'Success',
        description: `Rolled back to version ${version} as new version ${data.data.newCurrentVersion}`,
      });

      // Refresh data
      await fetchPromptData();
      setActiveTab('edit');

    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to rollback prompt',
        variant: 'destructive'
      });
    }
  };

  const handleFileUpload = async () => {
    if (uploadFiles.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please select files to upload',
        variant: 'destructive'
      });
      return;
    }

    try {
      setUploading(true);

      // Convert files to base64
      const processedFiles = await Promise.all(
        uploadFiles.map(async (file) => {
          const content = await fileToBase64(file);
          return {
            name: file.name,
            type: file.type,
            size: file.size,
            content
          };
        })
      );

      const response = await fetch(`/api/v1/chatbots/${chatbotId}/prompt/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          files: processedFiles,
          purpose: 'prompt_context'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to upload files');
      }

      const data = await response.json();

      toast({
        title: 'Success',
        description: `${data.data.filesProcessed} files uploaded and processed successfully`,
      });

      // Clear upload files
      setUploadFiles([]);

    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to upload files',
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getSourceBadgeVariant = (source: string) => {
    switch (source) {
      case 'manual': return 'default';
      case 'generated': return 'secondary';
      case 'rollback': return 'outline';
      default: return 'default';
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center space-x-2">
            <Clock className="h-6 w-6 animate-spin" />
            <span>Loading prompt data...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="p-2"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">System Prompt Management</h1>
            <p className="text-muted-foreground">
              Manage and optimize your chatbot's system prompt
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="edit" className="flex items-center space-x-2">
            <Edit3 className="h-4 w-4" />
            <span>Edit Prompt</span>
          </TabsTrigger>
          <TabsTrigger value="generate" className="flex items-center space-x-2">
            <Wand2 className="h-4 w-4" />
            <span>AI Generate</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center space-x-2">
            <History className="h-4 w-4" />
            <span>Version History</span>
          </TabsTrigger>
          <TabsTrigger value="files" className="flex items-center space-x-2">
            <Upload className="h-4 w-4" />
            <span>Upload Context</span>
          </TabsTrigger>
        </TabsList>

        {/* Edit Prompt Tab */}
        <TabsContent value="edit" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Edit3 className="h-5 w-5" />
                <span>Current System Prompt</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="prompt">System Prompt</Label>
                <Textarea
                  id="prompt"
                  value={currentPrompt}
                  onChange={(e) => setCurrentPrompt(e.target.value)}
                  placeholder="Enter your system prompt here..."
                  rows={12}
                  className="resize-none"
                />
                <div className="text-sm text-muted-foreground">
                  {currentPrompt.length} characters
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Version Description (Optional)</Label>
                <Input
                  id="description"
                  value={promptDescription}
                  onChange={(e) => setPromptDescription(e.target.value)}
                  placeholder="Describe the changes in this version..."
                />
              </div>

              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setCurrentPrompt('');
                    setPromptDescription('');
                  }}
                >
                  Clear
                </Button>
                <Button
                  onClick={handleSavePrompt}
                  disabled={saving || !currentPrompt.trim()}
                  className="flex items-center space-x-2"
                >
                  {saving ? (
                    <Clock className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>{saving ? 'Saving...' : 'Save Prompt'}</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Generate Tab */}
        <TabsContent value="generate" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Wand2 className="h-5 w-5" />
                <span>AI-Powered Prompt Generation</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="businessContext">Business Context *</Label>
                  <Textarea
                    id="businessContext"
                    value={businessContext}
                    onChange={(e) => setBusinessContext(e.target.value)}
                    placeholder="Describe your business, products, and services..."
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="targetAudience">Target Audience</Label>
                  <Textarea
                    id="targetAudience"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="Describe your typical customers..."
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="communicationStyle">Communication Style</Label>
                  <Select value={communicationStyle} onValueChange={setCommunicationStyle}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="friendly">Friendly</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="formal">Formal</SelectItem>
                      <SelectItem value="conversational">Conversational</SelectItem>
                      <SelectItem value="authoritative">Authoritative</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="keyTopics">Key Topics (comma-separated)</Label>
                  <Input
                    id="keyTopics"
                    value={keyTopics}
                    onChange={(e) => setKeyTopics(e.target.value)}
                    placeholder="skincare, cosmetics, beauty tips..."
                  />
                </div>

                <div className="col-span-1 md:col-span-2 space-y-2">
                  <Label htmlFor="constraints">Constraints & Guidelines (comma-separated)</Label>
                  <Input
                    id="constraints"
                    value={constraints}
                    onChange={(e) => setConstraints(e.target.value)}
                    placeholder="don't provide medical advice, focus on product recommendations..."
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleGeneratePrompt}
                  disabled={generating || !businessContext.trim()}
                  className="flex items-center space-x-2"
                >
                  {generating ? (
                    <Clock className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  <span>{generating ? 'Generating...' : 'Generate Prompt'}</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Generation Jobs */}
          {generationJobs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Generation Jobs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {generationJobs.slice(0, 5).map((job) => (
                    <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <Badge variant={job.status === 'completed' ? 'default' : job.status === 'failed' ? 'destructive' : 'secondary'}>
                            {job.status}
                          </Badge>
                          <span className="text-sm font-medium">{job.parameters.communicationStyle}</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatDateTime(job.createdAt)}
                        </div>
                      </div>
                      {job.status === 'completed' && job.generatedPrompt && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCurrentPrompt(job.generatedPrompt!);
                            setActiveTab('edit');
                          }}
                        >
                          Use This Prompt
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Version History Tab */}
        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <History className="h-5 w-5" />
                <span>Prompt Version History</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {promptHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No prompt versions found. Create your first version by saving a prompt.
                </div>
              ) : (
                <div className="space-y-4">
                  {promptHistory.map((version) => (
                    <div key={version.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Badge variant="outline">v{version.version}</Badge>
                          <Badge variant={getSourceBadgeVariant(version.source)}>
                            {version.source}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {formatDateTime(version.createdAt)}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setCurrentPrompt(version.prompt);
                              setActiveTab('edit');
                            }}
                          >
                            Edit Copy
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRollback(version.version, `Rollback to v${version.version}`)}
                            className="flex items-center space-x-1"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Rollback</span>
                          </Button>
                        </div>
                      </div>

                      {version.description && (
                        <div className="text-sm text-muted-foreground italic">
                          {version.description}
                        </div>
                      )}

                      <div className="bg-muted/30 rounded p-3">
                        <div className="text-sm font-mono whitespace-pre-wrap">
                          {version.prompt.length > 200
                            ? version.prompt.substring(0, 200) + '...'
                            : version.prompt
                          }
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                          {version.prompt.length} characters
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* File Upload Tab */}
        <TabsContent value="files" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Upload className="h-5 w-5" />
                <span>Upload Context Files</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="files">Select Files</Label>
                <Input
                  id="files"
                  type="file"
                  multiple
                  accept=".txt,.pdf,.doc,.docx,.json"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setUploadFiles(files);
                  }}
                />
                <div className="text-sm text-muted-foreground">
                  Supported formats: TXT, PDF, DOC, DOCX, JSON (max 10MB per file)
                </div>
              </div>

              {uploadFiles.length > 0 && (
                <div className="space-y-2">
                  <Label>Selected Files</Label>
                  <div className="space-y-2">
                    {uploadFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex items-center space-x-2">
                          <FileText className="h-4 w-4" />
                          <span className="text-sm">{file.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {(file.size / 1024).toFixed(1)} KB
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const newFiles = uploadFiles.filter((_, i) => i !== index);
                            setUploadFiles(newFiles);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  onClick={handleFileUpload}
                  disabled={uploading || uploadFiles.length === 0}
                  className="flex items-center space-x-2"
                >
                  {uploading ? (
                    <Clock className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  <span>{uploading ? 'Uploading...' : 'Upload Files'}</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}