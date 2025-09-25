'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Bot, ArrowLeft, Zap, Brain, MessageCircle, FileText, Settings } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function CreateChatbotPage() {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    model: '',
    temperature: 0.7,
    maxTokens: 2048,
    systemPrompt: '',
    knowledgeBase: true,
    contextMemory: true,
    webSearch: false,
    imageProcessing: false,
  });

  const [step, setStep] = useState(1);
  const totalSteps = 3;

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const nextStep = () => {
    if (step < totalSteps) setStep(step + 1);
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = () => {
    console.log('Creating chatbot:', formData);
    // Here you would normally submit to an API
    alert('Chatbot created successfully!');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="icon" asChild>
            <a href="/dashboard/chatbots">
              <ArrowLeft className="h-4 w-4" />
            </a>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Create New Chatbot</h1>
            <p className="text-muted-foreground">
              Set up your AI assistant with custom configuration
            </p>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          Step {step} of {totalSteps}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${(step / totalSteps) * 100}%` }}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          {/* Step 1: Basic Information */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Basic Information
                </CardTitle>
                <CardDescription>
                  Give your chatbot a name and describe its purpose
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Chatbot Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Customer Support Assistant"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe what your chatbot will help with..."
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="model">AI Model *</Label>
                  <Select value={formData.model} onValueChange={(value) => handleInputChange('model', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose an AI model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4">GPT-4 (Best Quality)</SelectItem>
                      <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo (Fast & Cost-effective)</SelectItem>
                      <SelectItem value="claude-3">Claude 3 (Analytical)</SelectItem>
                      <SelectItem value="gemini-pro">Gemini Pro (Versatile)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: AI Behavior */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  AI Behavior & Personality
                </CardTitle>
                <CardDescription>
                  Configure how your chatbot thinks and responds
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="systemPrompt">System Prompt *</Label>
                  <Textarea
                    id="systemPrompt"
                    placeholder="You are a helpful assistant that..."
                    value={formData.systemPrompt}
                    onChange={(e) => handleInputChange('systemPrompt', e.target.value)}
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    This defines your chatbot&apos;s personality and behavior guidelines
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="temperature">
                      Creativity Level: {formData.temperature}
                    </Label>
                    <input
                      id="temperature"
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={formData.temperature}
                      onChange={(e) => handleInputChange('temperature', parseFloat(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Conservative</span>
                      <span>Creative</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maxTokens">
                      Response Length: {formData.maxTokens}
                    </Label>
                    <input
                      id="maxTokens"
                      type="range"
                      min="256"
                      max="4096"
                      step="256"
                      value={formData.maxTokens}
                      onChange={(e) => handleInputChange('maxTokens', parseInt(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Short</span>
                      <span>Long</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Features & Integration */}
          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Features & Integration
                </CardTitle>
                <CardDescription>
                  Enable advanced features for your chatbot
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        <Label className="font-medium">Knowledge Base Integration</Label>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Access uploaded documents and training data
                      </p>
                    </div>
                    <Switch
                      checked={formData.knowledgeBase}
                      onCheckedChange={(checked) => handleInputChange('knowledgeBase', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <MessageCircle className="h-4 w-4" />
                        <Label className="font-medium">Context Memory</Label>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Remember conversation history and context
                      </p>
                    </div>
                    <Switch
                      checked={formData.contextMemory}
                      onCheckedChange={(checked) => handleInputChange('contextMemory', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        <Label className="font-medium">Web Search</Label>
                        <Badge variant="secondary">Premium</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Access real-time information from the web
                      </p>
                    </div>
                    <Switch
                      checked={formData.webSearch}
                      onCheckedChange={(checked) => handleInputChange('webSearch', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4" />
                        <Label className="font-medium">Image Processing</Label>
                        <Badge variant="secondary">Premium</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Analyze and understand images from users
                      </p>
                    </div>
                    <Switch
                      checked={formData.imageProcessing}
                      onCheckedChange={(checked) => handleInputChange('imageProcessing', checked)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={prevStep}
              disabled={step === 1}
            >
              Previous
            </Button>
            {step < totalSteps ? (
              <Button
                onClick={nextStep}
                disabled={
                  (step === 1 && (!formData.name || !formData.model)) ||
                  (step === 2 && !formData.systemPrompt)
                }
              >
                Next
              </Button>
            ) : (
              <Button onClick={handleSubmit}>
                Create Chatbot
              </Button>
            )}
          </div>
        </div>

        {/* Sidebar with Preview */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Configuration Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs font-medium text-muted-foreground">NAME</Label>
                <p className="font-medium">{formData.name || 'Unnamed Chatbot'}</p>
              </div>

              {formData.description && (
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">DESCRIPTION</Label>
                  <p className="text-sm">{formData.description}</p>
                </div>
              )}

              {formData.model && (
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">MODEL</Label>
                  <p className="font-medium">{formData.model.toUpperCase()}</p>
                </div>
              )}

              <div>
                <Label className="text-xs font-medium text-muted-foreground">CREATIVITY</Label>
                <div className="flex items-center justify-between">
                  <p className="font-medium">{formData.temperature}</p>
                  <Badge variant="secondary">
                    {formData.temperature < 0.3 ? 'Conservative' :
                     formData.temperature > 0.7 ? 'Creative' : 'Balanced'}
                  </Badge>
                </div>
              </div>

              <div>
                <Label className="text-xs font-medium text-muted-foreground">ENABLED FEATURES</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {formData.knowledgeBase && (
                    <Badge variant="secondary" className="text-xs">Knowledge Base</Badge>
                  )}
                  {formData.contextMemory && (
                    <Badge variant="secondary" className="text-xs">Context Memory</Badge>
                  )}
                  {formData.webSearch && (
                    <Badge variant="secondary" className="text-xs">Web Search</Badge>
                  )}
                  {formData.imageProcessing && (
                    <Badge variant="secondary" className="text-xs">Image Processing</Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-sm">Quick Tips</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {step === 1 && (
                <>
                  <p>• Choose a descriptive name that reflects the bot&apos;s purpose</p>
                  <p>• GPT-4 offers the best quality but costs more</p>
                  <p>• GPT-3.5 Turbo is faster and more cost-effective</p>
                </>
              )}
              {step === 2 && (
                <>
                  <p>• Lower creativity for factual responses</p>
                  <p>• Higher creativity for creative tasks</p>
                  <p>• Be specific in your system prompt</p>
                </>
              )}
              {step === 3 && (
                <>
                  <p>• Knowledge base integration requires uploaded documents</p>
                  <p>• Premium features may incur additional costs</p>
                  <p>• You can modify these settings later</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}