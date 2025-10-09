'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertCircle,
  RotateCcw,
  Info,
  ChevronDown,
  ChevronRight,
  Bug,
  Wrench,
  Clock,
  Play,
  ExternalLink,
  Download,
  Copy,
  CheckCircle,
  XCircle,
  Zap,
  HelpCircle
} from 'lucide-react';

interface ErrorInfo {
  errorType: string;
  errorMessage: string;
  errorCode?: string;
  stepName: string;
  executionId: string;
  timestamp: string;
  stackTrace?: string;
  context?: Record<string, any>;
  retryable: boolean;
  suggestedActions: string[];
}

interface RetryOptions {
  retryType: 'full' | 'from_failure' | 'custom';
  skipSteps?: string[];
  customInput?: Record<string, any>;
  waitTime?: number;
  maxRetries?: number;
}

interface ErrorHandlingProps {
  errorInfo: ErrorInfo;
  onRetry?: (options: RetryOptions) => Promise<void>;
  onDismiss?: () => void;
  className?: string;
  showAdvanced?: boolean;
}

const ERROR_CATEGORIES = {
  'FILE_VALIDATION': {
    title: 'File Validation Error',
    description: 'Issues with file format, size, or content',
    icon: <AlertCircle className="h-5 w-5 text-orange-600" />,
    color: 'border-orange-200 bg-orange-50'
  },
  'OCR_PROCESSING': {
    title: 'OCR Processing Error',
    description: 'Text extraction or image processing failure',
    icon: <Bug className="h-5 w-5 text-red-600" />,
    color: 'border-red-200 bg-red-50'
  },
  'CHUNKING_ERROR': {
    title: 'Document Chunking Error',
    description: 'Issues with document segmentation',
    icon: <AlertCircle className="h-5 w-5 text-yellow-600" />,
    color: 'border-yellow-200 bg-yellow-50'
  },
  'EMBEDDING_ERROR': {
    title: 'Embedding Generation Error',
    description: 'Vector embedding creation failure',
    icon: <Zap className="h-5 w-5 text-purple-600" />,
    color: 'border-purple-200 bg-purple-50'
  },
  'DATABASE_ERROR': {
    title: 'Database Error',
    description: 'Data storage or retrieval failure',
    icon: <XCircle className="h-5 w-5 text-red-600" />,
    color: 'border-red-200 bg-red-50'
  },
  'TIMEOUT_ERROR': {
    title: 'Timeout Error',
    description: 'Operation exceeded time limit',
    icon: <Clock className="h-5 w-5 text-blue-600" />,
    color: 'border-blue-200 bg-blue-50'
  },
  'UNKNOWN_ERROR': {
    title: 'Unknown Error',
    description: 'Unexpected system error',
    icon: <HelpCircle className="h-5 w-5 text-gray-600" />,
    color: 'border-gray-200 bg-gray-50'
  }
};

const RETRY_STRATEGIES = {
  'full': {
    title: 'Full Restart',
    description: 'Restart the entire workflow from the beginning',
    recommended: true
  },
  'from_failure': {
    title: 'Resume from Failure',
    description: 'Continue from the failed step',
    recommended: false
  },
  'custom': {
    title: 'Custom Retry',
    description: 'Configure specific retry parameters',
    recommended: false
  }
};

export function ErrorHandling({
  errorInfo,
  onRetry,
  onDismiss,
  className = '',
  showAdvanced = false
}: ErrorHandlingProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryOptions, setRetryOptions] = useState<RetryOptions>({
    retryType: 'full',
    waitTime: 30,
    maxRetries: 3
  });
  const [showStackTrace, setShowStackTrace] = useState(false);
  const [copied, setCopied] = useState(false);

  const errorCategory = ERROR_CATEGORIES[errorInfo.errorType as keyof typeof ERROR_CATEGORIES] || ERROR_CATEGORIES.UNKNOWN_ERROR;

  const handleRetry = useCallback(async () => {
    if (!onRetry) return;

    setIsRetrying(true);
    try {
      await onRetry(retryOptions);
    } catch (error) {
      console.error('Retry failed:', error);
    } finally {
      setIsRetrying(false);
    }
  }, [onRetry, retryOptions]);

  const copyErrorDetails = useCallback(() => {
    const errorDetails = {
      executionId: errorInfo.executionId,
      stepName: errorInfo.stepName,
      errorType: errorInfo.errorType,
      errorMessage: errorInfo.errorMessage,
      timestamp: errorInfo.timestamp,
      context: errorInfo.context,
      stackTrace: errorInfo.stackTrace
    };

    navigator.clipboard.writeText(JSON.stringify(errorDetails, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [errorInfo]);

  const getRetryRecommendation = () => {
    switch (errorInfo.errorType) {
      case 'TIMEOUT_ERROR':
        return 'from_failure';
      case 'FILE_VALIDATION':
        return 'full';
      case 'DATABASE_ERROR':
        return 'from_failure';
      default:
        return 'full';
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Error Header */}
      <Card className={`${errorCategory.color} border-l-4`}>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              {errorCategory.icon}
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  {errorCategory.title}
                  <Badge variant="destructive" className="text-xs">
                    {errorInfo.stepName}
                  </Badge>
                </CardTitle>
                <CardDescription className="mt-1">
                  {errorCategory.description}
                </CardDescription>
              </div>
            </div>
            {onDismiss && (
              <Button variant="ghost" size="sm" onClick={onDismiss}>
                <XCircle className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="font-medium">
                {errorInfo.errorMessage}
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Execution ID:</span>
                <div className="text-gray-600 font-mono">{errorInfo.executionId}</div>
              </div>
              <div>
                <span className="font-medium">Failed Step:</span>
                <div className="text-gray-600">{errorInfo.stepName}</div>
              </div>
              <div>
                <span className="font-medium">Error Code:</span>
                <div className="text-gray-600">{errorInfo.errorCode || 'N/A'}</div>
              </div>
              <div>
                <span className="font-medium">Timestamp:</span>
                <div className="text-gray-600">{new Date(errorInfo.timestamp).toLocaleString()}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={copyErrorDetails}
                className="flex items-center gap-1"
              >
                {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy Error Details'}
              </Button>

              {errorInfo.stackTrace && (
                <Collapsible open={showStackTrace} onOpenChange={setShowStackTrace}>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" size="sm" className="flex items-center gap-1">
                      {showStackTrace ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      Stack Trace
                    </Button>
                  </CollapsibleTrigger>
                </Collapsible>
              )}
            </div>

            {errorInfo.stackTrace && (
              <Collapsible open={showStackTrace} onOpenChange={setShowStackTrace}>
                <CollapsibleContent>
                  <div className="mt-3 p-3 bg-gray-900 text-gray-100 rounded-md text-xs font-mono overflow-x-auto">
                    <pre>{errorInfo.stackTrace}</pre>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Suggested Actions */}
      {errorInfo.suggestedActions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Suggested Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {errorInfo.suggestedActions.map((action, index) => (
                <div key={index} className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-medium flex-shrink-0">
                    {index + 1}
                  </div>
                  <p className="text-sm">{action}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Retry Options */}
      {errorInfo.retryable && onRetry && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Retry Options
            </CardTitle>
            <CardDescription>
              Choose how to retry the failed execution
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={retryOptions.retryType} onValueChange={(value) =>
              setRetryOptions(prev => ({ ...prev, retryType: value as RetryOptions['retryType'] }))
            }>
              <TabsList className="grid w-full grid-cols-3">
                {Object.entries(RETRY_STRATEGIES).map(([key, strategy]) => (
                  <TabsTrigger key={key} value={key} className="text-xs">
                    {strategy.title}
                    {strategy.recommended && key === getRetryRecommendation() && (
                      <Badge variant="secondary" className="ml-1 text-xs">Recommended</Badge>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="mt-4">
                {Object.entries(RETRY_STRATEGIES).map(([key, strategy]) => (
                  <TabsContent key={key} value={key} className="space-y-4">
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertDescription>{strategy.description}</AlertDescription>
                    </Alert>

                    {key === 'custom' && (
                      <div className="space-y-4">
                        <div>
                          <Label>Skip Steps (Optional)</Label>
                          <Textarea
                            placeholder="Enter step names to skip, one per line"
                            value={retryOptions.skipSteps?.join('\n') || ''}
                            onChange={(e) => setRetryOptions(prev => ({
                              ...prev,
                              skipSteps: e.target.value.split('\n').filter(Boolean)
                            }))}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Wait Time (seconds)</Label>
                            <Select value={retryOptions.waitTime?.toString()} onValueChange={(value) =>
                              setRetryOptions(prev => ({ ...prev, waitTime: parseInt(value) }))
                            }>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0">Immediate</SelectItem>
                                <SelectItem value="30">30 seconds</SelectItem>
                                <SelectItem value="60">1 minute</SelectItem>
                                <SelectItem value="300">5 minutes</SelectItem>
                                <SelectItem value="600">10 minutes</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label>Max Retries</Label>
                            <Select value={retryOptions.maxRetries?.toString()} onValueChange={(value) =>
                              setRetryOptions(prev => ({ ...prev, maxRetries: parseInt(value) }))
                            }>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">1 retry</SelectItem>
                                <SelectItem value="3">3 retries</SelectItem>
                                <SelectItem value="5">5 retries</SelectItem>
                                <SelectItem value="10">10 retries</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-4">
                      <div className="text-sm text-gray-600">
                        {retryOptions.waitTime > 0 && (
                          <span>Will wait {retryOptions.waitTime} seconds before retrying</span>
                        )}
                      </div>
                      <Button
                        onClick={handleRetry}
                        disabled={isRetrying}
                        className="flex items-center gap-2"
                      >
                        {isRetrying ? <Clock className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        {isRetrying ? 'Retrying...' : `Retry with ${strategy.title}`}
                      </Button>
                    </div>
                  </TabsContent>
                ))}
              </div>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Advanced Debugging */}
      {showAdvanced && errorInfo.context && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bug className="h-5 w-5" />
              Advanced Debugging
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Execution Context</h4>
                <div className="p-3 bg-gray-100 rounded-md text-sm font-mono overflow-x-auto">
                  <pre>{JSON.stringify(errorInfo.context, null, 2)}</pre>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex items-center gap-1">
                  <ExternalLink className="h-4 w-4" />
                  View in AWS Console
                </Button>
                <Button variant="outline" size="sm" className="flex items-center gap-1">
                  <Download className="h-4 w-4" />
                  Download Logs
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Prevention Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Prevention Tips
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {errorInfo.errorType === 'FILE_VALIDATION' && (
              <>
                <p>• Ensure files are under 50MB and in supported formats</p>
                <p>• Check that files are not corrupted or password-protected</p>
                <p>• Verify file extensions match actual content</p>
              </>
            )}
            {errorInfo.errorType === 'OCR_PROCESSING' && (
              <>
                <p>• Use high-quality, clear images for better OCR results</p>
                <p>• Ensure text is not too small or distorted</p>
                <p>• Consider preprocessing images for better clarity</p>
              </>
            )}
            {errorInfo.errorType === 'DATABASE_ERROR' && (
              <>
                <p>• Check database connectivity and permissions</p>
                <p>• Verify data doesn't exceed column size limits</p>
                <p>• Ensure unique constraints are not violated</p>
              </>
            )}
            {errorInfo.errorType === 'TIMEOUT_ERROR' && (
              <>
                <p>• Consider breaking large files into smaller chunks</p>
                <p>• Reduce file complexity or size</p>
                <p>• Retry during off-peak hours for better performance</p>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}