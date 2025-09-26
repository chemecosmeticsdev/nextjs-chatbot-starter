'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle,
  CheckCircle,
  Cloud,
  Server,
  Key,
  Eye,
  EyeOff,
  Save,
  Loader2,
  RefreshCw
} from 'lucide-react';
// Using alert fallback instead of toast
import { z } from 'zod';

interface AdminSetting {
  key: string;
  value: any;
  masked_value?: string;
  description?: string;
  is_sensitive: boolean;
  updated_at: string;
  updated_by_name?: string;
}

interface BedrockModel {
  modelId: string;
  modelName: string;
  providerName: string;
  description: string;
}

interface BedrockModelsResponse {
  success: boolean;
  models: BedrockModel[];
  groupedModels: Record<string, BedrockModel[]>;
}

// Validation schemas
const AdminSettingsSchema = z.object({
  mistral_ocr_api_key: z.string().min(1, 'OCR API key is required'),
  aws_bedrock_credentials: z.object({
    accessKeyId: z.string().min(1, 'Access Key ID is required'),
    secretAccessKey: z.string().min(1, 'Secret Access Key is required'),
    region: z.string().min(1, 'Region is required')
  }),
  default_llm_model: z.string().min(1, 'Default LLM model is required'),
  s3_document_bucket: z.string().min(1, 'S3 bucket name is required'),
  embedding_model: z.string().min(1, 'Embedding model is required')
});

export default function SettingsPage() {
  // Simple alert fallback instead of toast
  const [settings, setSettings] = useState<Record<string, AdminSetting>>({});
  const [bedrockModels, setBedrockModels] = useState<BedrockModel[]>([]);
  const [formValues, setFormValues] = useState({
    mistral_ocr_api_key: '',
    aws_bedrock_credentials: {
      accessKeyId: '',
      secretAccessKey: '',
      region: 'us-east-1'
    },
    default_llm_model: '',
    s3_document_bucket: '',
    embedding_model: 'amazon.titan-embed-text-v1'
  });
  const [showSensitive, setShowSensitive] = useState({
    mistral_ocr_api_key: false,
    aws_bedrock_credentials: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const initializeSettings = async () => {
      try {
        // Check user role for access control
        const authResponse = await fetch('/api/v1/auth/me');
        const authData = await authResponse.json();

        if (!authData.success || authData.user.role !== 'super_admin') {
          window.location.href = '/dashboard';
          return;
        }

        setUserRole(authData.user.role);

        // Load admin settings and Bedrock models in parallel
        const [settingsResponse, modelsResponse] = await Promise.all([
          fetch('/api/v1/settings'),
          fetch('/api/v1/bedrock/models')
        ]);

        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json();
          if (settingsData.success) {
            const settingsMap: Record<string, AdminSetting> = {};
            settingsData.settings.forEach((setting: AdminSetting) => {
              settingsMap[setting.key] = setting;
            });
            setSettings(settingsMap);

            // Populate form with current values
            setFormValues({
              mistral_ocr_api_key: settingsMap.mistral_ocr_api_key?.value || '',
              aws_bedrock_credentials: settingsMap.aws_bedrock_credentials?.value || {
                accessKeyId: '',
                secretAccessKey: '',
                region: 'us-east-1'
              },
              default_llm_model: settingsMap.default_llm_model?.value || '',
              s3_document_bucket: settingsMap.s3_document_bucket?.value || '',
              embedding_model: settingsMap.embedding_model?.value || 'amazon.titan-embed-text-v1'
            });
          }
        }

        if (modelsResponse.ok) {
          const modelsData: BedrockModelsResponse = await modelsResponse.json();
          if (modelsData.success) {
            setBedrockModels(modelsData.models);
          }
        }

      } catch (error) {
        console.error('Failed to initialize settings:', error);
        alert('Error: Failed to load admin settings');
      } finally {
        setLoading(false);
      }
    };

    initializeSettings();
  }, []);

  const handleFieldChange = (field: string, value: any) => {
    setFormValues(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear validation error when user starts typing
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleCredentialChange = (field: string, value: string) => {
    setFormValues(prev => ({
      ...prev,
      aws_bedrock_credentials: {
        ...prev.aws_bedrock_credentials,
        [field]: value
      }
    }));

    // Clear validation error
    const errorKey = `aws_bedrock_credentials.${field}`;
    if (validationErrors[errorKey]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[errorKey];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    try {
      AdminSettingsSchema.parse(formValues);
      setValidationErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.errors.forEach((err) => {
          const path = err.path.join('.');
          errors[path] = err.message;
        });
        setValidationErrors(errors);
      }
      return false;
    }
  };

  const handleSave = async () => {
    if (!validateForm()) {
      alert('Validation Error: Please fix the errors before saving');
      return;
    }

    setSaving(true);
    try {
      // Save each setting individually
      const settingsToSave = [
        { key: 'mistral_ocr_api_key', value: formValues.mistral_ocr_api_key },
        { key: 'aws_bedrock_credentials', value: formValues.aws_bedrock_credentials },
        { key: 'default_llm_model', value: formValues.default_llm_model },
        { key: 's3_document_bucket', value: formValues.s3_document_bucket },
        { key: 'embedding_model', value: formValues.embedding_model }
      ];

      const savePromises = settingsToSave.map(async (setting) => {
        const response = await fetch(`/api/v1/settings/${setting.key}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            value: setting.value,
            description: getSettingDescription(setting.key)
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to save setting');
        }

        return response.json();
      });

      await Promise.all(savePromises);

      alert('Success: Admin settings saved successfully');

      // Reload settings to get updated values
      window.location.reload();

    } catch (error: any) {
      console.error('Failed to save settings:', error);
      alert('Error: ' + (error.message || 'Failed to save settings'));
    } finally {
      setSaving(false);
    }
  };

  const getSettingDescription = (key: string): string => {
    const descriptions = {
      mistral_ocr_api_key: 'Mistral API key for OCR text extraction',
      aws_bedrock_credentials: 'AWS Bedrock service credentials for LLM operations',
      default_llm_model: 'Default LLM model for chatbot classification tasks',
      s3_document_bucket: 'S3 bucket for storing uploaded documents',
      embedding_model: 'Embedding model for vector search (read-only)'
    };
    return descriptions[key as keyof typeof descriptions] || '';
  };

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Loading admin settings...</p>
        </div>
      </div>
    );
  }

  // Show access denied for non-super admin users
  if (!userRole) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-red-600 mb-4" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You don&apos;t have permission to access system settings. This feature is restricted to super administrators.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button asChild>
              <a href="/dashboard">Return to Dashboard</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Settings</h1>
          <p className="text-muted-foreground">
            Configure system-wide admin settings and API keys
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Mistral OCR API Key */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Mistral OCR Configuration
            </CardTitle>
            <CardDescription>
              Configure Mistral API key for OCR text extraction from documents
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mistral_ocr_api_key">OCR API Key</Label>
              <div className="flex items-center space-x-2">
                <Input
                  id="mistral_ocr_api_key"
                  type={showSensitive.mistral_ocr_api_key ? "text" : "password"}
                  value={formValues.mistral_ocr_api_key}
                  onChange={(e) => handleFieldChange('mistral_ocr_api_key', e.target.value)}
                  placeholder="Enter Mistral OCR API key"
                  className={validationErrors.mistral_ocr_api_key ? "border-red-500" : ""}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowSensitive(prev => ({
                    ...prev,
                    mistral_ocr_api_key: !prev.mistral_ocr_api_key
                  }))}
                >
                  {showSensitive.mistral_ocr_api_key ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {validationErrors.mistral_ocr_api_key && (
                <p className="text-sm text-red-600">{validationErrors.mistral_ocr_api_key}</p>
              )}
              {settings.mistral_ocr_api_key && !showSensitive.mistral_ocr_api_key && (
                <p className="text-sm text-muted-foreground">
                  Current: {settings.mistral_ocr_api_key.masked_value}
                  {settings.mistral_ocr_api_key.updated_by_name && (
                    <span> • Last updated by {settings.mistral_ocr_api_key.updated_by_name}</span>
                  )}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* AWS Bedrock Credentials */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              AWS Bedrock Credentials
            </CardTitle>
            <CardDescription>
              Configure AWS credentials for Bedrock LLM services
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="aws_access_key">Access Key ID</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="aws_access_key"
                    type={showSensitive.aws_bedrock_credentials ? "text" : "password"}
                    value={formValues.aws_bedrock_credentials.accessKeyId}
                    onChange={(e) => handleCredentialChange('accessKeyId', e.target.value)}
                    placeholder="AKIA..."
                    className={validationErrors['aws_bedrock_credentials.accessKeyId'] ? "border-red-500" : ""}
                  />
                </div>
                {validationErrors['aws_bedrock_credentials.accessKeyId'] && (
                  <p className="text-sm text-red-600">{validationErrors['aws_bedrock_credentials.accessKeyId']}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="aws_secret_key">Secret Access Key</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="aws_secret_key"
                    type={showSensitive.aws_bedrock_credentials ? "text" : "password"}
                    value={formValues.aws_bedrock_credentials.secretAccessKey}
                    onChange={(e) => handleCredentialChange('secretAccessKey', e.target.value)}
                    placeholder="Enter secret key"
                    className={validationErrors['aws_bedrock_credentials.secretAccessKey'] ? "border-red-500" : ""}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowSensitive(prev => ({
                      ...prev,
                      aws_bedrock_credentials: !prev.aws_bedrock_credentials
                    }))}
                  >
                    {showSensitive.aws_bedrock_credentials ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {validationErrors['aws_bedrock_credentials.secretAccessKey'] && (
                  <p className="text-sm text-red-600">{validationErrors['aws_bedrock_credentials.secretAccessKey']}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="aws_region">Bedrock Region</Label>
              <Select
                value={formValues.aws_bedrock_credentials.region}
                onValueChange={(value) => handleCredentialChange('region', value)}
              >
                <SelectTrigger className={validationErrors['aws_bedrock_credentials.region'] ? "border-red-500" : ""}>
                  <SelectValue placeholder="Select AWS region for Bedrock" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="us-east-1">US East (N. Virginia)</SelectItem>
                  <SelectItem value="us-west-2">US West (Oregon)</SelectItem>
                  <SelectItem value="eu-west-1">Europe (Ireland)</SelectItem>
                  <SelectItem value="ap-southeast-1">Asia Pacific (Singapore)</SelectItem>
                </SelectContent>
              </Select>
              {validationErrors['aws_bedrock_credentials.region'] && (
                <p className="text-sm text-red-600">{validationErrors['aws_bedrock_credentials.region']}</p>
              )}
            </div>
            {settings.aws_bedrock_credentials && !showSensitive.aws_bedrock_credentials && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium">Current Configuration:</p>
                <p>Access Key: {settings.aws_bedrock_credentials.masked_value?.accessKeyId || '***masked***'}</p>
                <p>Region: {formValues.aws_bedrock_credentials.region}</p>
                {settings.aws_bedrock_credentials.updated_by_name && (
                  <p className="text-muted-foreground mt-1">
                    Last updated by {settings.aws_bedrock_credentials.updated_by_name}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Default LLM Model */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Default LLM Model
            </CardTitle>
            <CardDescription>
              Select the default language model for chatbot classification tasks
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="default_llm_model">LLM Model</Label>
              <Select
                value={formValues.default_llm_model}
                onValueChange={(value) => handleFieldChange('default_llm_model', value)}
              >
                <SelectTrigger className={validationErrors.default_llm_model ? "border-red-500" : ""}>
                  <SelectValue placeholder="Select default LLM model" />
                </SelectTrigger>
                <SelectContent>
                  {bedrockModels.map((model) => (
                    <SelectItem key={model.modelId} value={model.modelId}>
                      <div className="flex flex-col">
                        <span>{model.modelName}</span>
                        <span className="text-xs text-muted-foreground">
                          {model.providerName} • {model.modelId}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {validationErrors.default_llm_model && (
                <p className="text-sm text-red-600">{validationErrors.default_llm_model}</p>
              )}
              {formValues.default_llm_model && (
                <p className="text-sm text-muted-foreground">
                  {bedrockModels.find(m => m.modelId === formValues.default_llm_model)?.description}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* S3 Document Bucket */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Document Storage
            </CardTitle>
            <CardDescription>
              Configure S3 bucket for document storage and processing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="s3_document_bucket">S3 Bucket Name</Label>
              <Input
                id="s3_document_bucket"
                type="text"
                value={formValues.s3_document_bucket}
                onChange={(e) => handleFieldChange('s3_document_bucket', e.target.value)}
                placeholder="my-documents-bucket"
                className={validationErrors.s3_document_bucket ? "border-red-500" : ""}
              />
              {validationErrors.s3_document_bucket && (
                <p className="text-sm text-red-600">{validationErrors.s3_document_bucket}</p>
              )}
              <p className="text-sm text-muted-foreground">
                Enter the S3 bucket name where uploaded documents will be stored
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Embedding Model (Read-only) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Vector Embeddings
            </CardTitle>
            <CardDescription>
              Embedding model configuration for document search (read-only)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="embedding_model">Embedding Model</Label>
              <Input
                id="embedding_model"
                type="text"
                value={formValues.embedding_model}
                disabled
                className="bg-muted"
              />
              <p className="text-sm text-muted-foreground">
                This model is used for generating vector embeddings for document search.
                Contact system administrator to change this setting.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* System Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">System Information</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Database Connection:</span>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span>Connected</span>
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Settings Count:</span>
              <span>{Object.keys(settings).length} configured</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last Modified:</span>
              <span>
                {settings.default_llm_model?.updated_at ?
                  new Date(settings.default_llm_model.updated_at).toLocaleDateString() :
                  'Never'
                }
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}