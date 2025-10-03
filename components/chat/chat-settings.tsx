"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Settings,
  X,
  Bot,
  Palette,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
  Zap,
  Clock,
  Shield,
  Download,
  Upload,
  RefreshCw,
  Save,
  RotateCcw,
  Monitor,
  Sun,
  Moon,
  Bell,
  BellOff,
  MessageSquare,
  Activity,
  Globe,
  Lock,
  Unlock,
  Users
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Chatbot {
  id: string;
  name: string;
  description: string;
  status: string;
}

interface ChatSettings {
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  autoScroll: boolean;
  showTimestamps: boolean;
  showTypingIndicators: boolean;
  showConnectionStatus: boolean;
  enableMessageStatus: boolean;
  autoRetry: boolean;
  maxRetries: number;
  retryDelay: number;
  messageQueueSize: number;
  compactMode: boolean;
  animationsEnabled: boolean;
  privacyMode: boolean;
  autoDeleteMessages: boolean;
  messageTTL: number; // in hours
}

interface ChatSettingsProps {
  selectedChatbot: Chatbot | null;
  onClose: () => void;
  className?: string;
}

const defaultSettings: ChatSettings = {
  theme: 'system',
  fontSize: 14,
  soundEnabled: true,
  notificationsEnabled: true,
  autoScroll: true,
  showTimestamps: true,
  showTypingIndicators: true,
  showConnectionStatus: true,
  enableMessageStatus: true,
  autoRetry: true,
  maxRetries: 3,
  retryDelay: 1000,
  messageQueueSize: 100,
  compactMode: false,
  animationsEnabled: true,
  privacyMode: false,
  autoDeleteMessages: false,
  messageTTL: 24
};

export function ChatSettings({
  selectedChatbot,
  onClose,
  className
}: ChatSettingsProps) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<ChatSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load settings from localStorage or API
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Try to load from localStorage first
        const savedSettings = localStorage.getItem('chat-settings');
        if (savedSettings) {
          const parsed = JSON.parse(savedSettings);
          setSettings({ ...defaultSettings, ...parsed });
        }

        // Optionally load from API if user is authenticated
        if (selectedChatbot) {
          try {
            const response = await fetch(`/api/v1/settings/chat`);
            if (response.ok) {
              const result = await response.json();
              setSettings({ ...defaultSettings, ...result.data });
            }
          } catch (err) {
            console.log('Could not load settings from API, using local settings');
          }
        }
      } catch (err) {
        console.error('Error loading settings:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [selectedChatbot]);

  // Save settings
  const handleSave = async () => {
    setSaving(true);
    try {
      // Save to localStorage
      localStorage.setItem('chat-settings', JSON.stringify(settings));

      // Optionally save to API if user is authenticated
      if (selectedChatbot) {
        try {
          await fetch(`/api/v1/settings/chat`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
          });
        } catch (err) {
          console.log('Could not save to API, saved locally');
        }
      }

      setHasChanges(false);
      toast({
        title: "Settings saved",
        description: "Your chat settings have been saved"
      });
    } catch (err) {
      console.error('Error saving settings:', err);
      toast({
        title: "Save failed",
        description: "Failed to save settings",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  // Reset to defaults
  const handleReset = () => {
    setSettings(defaultSettings);
    setHasChanges(true);
    toast({
      title: "Settings reset",
      description: "Settings have been reset to defaults"
    });
  };

  // Update setting
  const updateSetting = <K extends keyof ChatSettings>(
    key: K,
    value: ChatSettings[K]
  ) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
    setHasChanges(true);
  };

  // Export settings
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chat-settings.json';
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Settings exported",
      description: "Settings file downloaded"
    });
  };

  // Import settings
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        setSettings({ ...defaultSettings, ...imported });
        setHasChanges(true);
        toast({
          title: "Settings imported",
          description: "Settings have been imported successfully"
        });
      } catch (err) {
        toast({
          title: "Import failed",
          description: "Invalid settings file",
          variant: "destructive"
        });
      }
    };
    reader.readAsText(file);
  };

  if (loading) {
    return (
      <div className={cn("w-full h-full p-4", className)}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-6 w-32 bg-muted rounded animate-pulse" />
            <div className="h-8 w-8 bg-muted rounded animate-pulse" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                <div className="h-6 w-12 bg-muted rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full bg-background border-l", className)}>
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Settings className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Chat Settings</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {selectedChatbot && (
          <div className="mt-2 p-2 bg-muted/50 rounded-md">
            <div className="flex items-center space-x-2">
              <Bot className="h-4 w-4" />
              <span className="text-sm font-medium">{selectedChatbot.name}</span>
              <Badge variant="outline" className="text-xs">
                {selectedChatbot.status}
              </Badge>
            </div>
          </div>
        )}
      </div>

      {/* Settings Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="appearance" className="h-full flex flex-col">
          <TabsList className="mx-4 mt-4">
            <TabsTrigger value="appearance" className="text-xs">
              <Palette className="h-3 w-3 mr-1" />
              Appearance
            </TabsTrigger>
            <TabsTrigger value="behavior" className="text-xs">
              <Zap className="h-3 w-3 mr-1" />
              Behavior
            </TabsTrigger>
            <TabsTrigger value="privacy" className="text-xs">
              <Shield className="h-3 w-3 mr-1" />
              Privacy
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto p-4">
            {/* Appearance Settings */}
            <TabsContent value="appearance" className="space-y-4 mt-0">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Visual Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Theme */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Theme</label>
                      <p className="text-xs text-muted-foreground">Color scheme preference</p>
                    </div>
                    <Select
                      value={settings.theme}
                      onValueChange={(value) => updateSetting('theme', value as any)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">
                          <div className="flex items-center space-x-2">
                            <Sun className="h-3 w-3" />
                            <span>Light</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="dark">
                          <div className="flex items-center space-x-2">
                            <Moon className="h-3 w-3" />
                            <span>Dark</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="system">
                          <div className="flex items-center space-x-2">
                            <Monitor className="h-3 w-3" />
                            <span>System</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Font Size */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Font Size</label>
                      <span className="text-xs text-muted-foreground">{settings.fontSize}px</span>
                    </div>
                    <Slider
                      value={[settings.fontSize]}
                      onValueChange={([value]) => updateSetting('fontSize', value)}
                      min={12}
                      max={20}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  {/* Compact Mode */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Compact Mode</label>
                      <p className="text-xs text-muted-foreground">Reduce spacing and padding</p>
                    </div>
                    <Switch
                      checked={settings.compactMode}
                      onCheckedChange={(checked) => updateSetting('compactMode', checked)}
                    />
                  </div>

                  {/* Animations */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Animations</label>
                      <p className="text-xs text-muted-foreground">Enable smooth transitions</p>
                    </div>
                    <Switch
                      checked={settings.animationsEnabled}
                      onCheckedChange={(checked) => updateSetting('animationsEnabled', checked)}
                    />
                  </div>

                  {/* Show Timestamps */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Show Timestamps</label>
                      <p className="text-xs text-muted-foreground">Display message times</p>
                    </div>
                    <Switch
                      checked={settings.showTimestamps}
                      onCheckedChange={(checked) => updateSetting('showTimestamps', checked)}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Behavior Settings */}
            <TabsContent value="behavior" className="space-y-4 mt-0">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Chat Behavior</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Auto Scroll */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Auto Scroll</label>
                      <p className="text-xs text-muted-foreground">Scroll to new messages</p>
                    </div>
                    <Switch
                      checked={settings.autoScroll}
                      onCheckedChange={(checked) => updateSetting('autoScroll', checked)}
                    />
                  </div>

                  {/* Sound Notifications */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Sound Effects</label>
                      <p className="text-xs text-muted-foreground">Play sounds for events</p>
                    </div>
                    <Switch
                      checked={settings.soundEnabled}
                      onCheckedChange={(checked) => updateSetting('soundEnabled', checked)}
                    />
                  </div>

                  {/* Notifications */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Browser Notifications</label>
                      <p className="text-xs text-muted-foreground">Show desktop notifications</p>
                    </div>
                    <Switch
                      checked={settings.notificationsEnabled}
                      onCheckedChange={(checked) => updateSetting('notificationsEnabled', checked)}
                    />
                  </div>

                  {/* Typing Indicators */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Typing Indicators</label>
                      <p className="text-xs text-muted-foreground">Show when typing</p>
                    </div>
                    <Switch
                      checked={settings.showTypingIndicators}
                      onCheckedChange={(checked) => updateSetting('showTypingIndicators', checked)}
                    />
                  </div>

                  {/* Connection Status */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Connection Status</label>
                      <p className="text-xs text-muted-foreground">Show connection indicator</p>
                    </div>
                    <Switch
                      checked={settings.showConnectionStatus}
                      onCheckedChange={(checked) => updateSetting('showConnectionStatus', checked)}
                    />
                  </div>

                  {/* Message Status */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Message Status</label>
                      <p className="text-xs text-muted-foreground">Show delivery status</p>
                    </div>
                    <Switch
                      checked={settings.enableMessageStatus}
                      onCheckedChange={(checked) => updateSetting('enableMessageStatus', checked)}
                    />
                  </div>

                  {/* Auto Retry */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Auto Retry</label>
                      <p className="text-xs text-muted-foreground">Retry failed messages</p>
                    </div>
                    <Switch
                      checked={settings.autoRetry}
                      onCheckedChange={(checked) => updateSetting('autoRetry', checked)}
                    />
                  </div>

                  {settings.autoRetry && (
                    <>
                      {/* Max Retries */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium">Max Retries</label>
                          <span className="text-xs text-muted-foreground">{settings.maxRetries}</span>
                        </div>
                        <Slider
                          value={[settings.maxRetries]}
                          onValueChange={([value]) => updateSetting('maxRetries', value)}
                          min={1}
                          max={5}
                          step={1}
                          className="w-full"
                        />
                      </div>

                      {/* Retry Delay */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium">Retry Delay</label>
                          <span className="text-xs text-muted-foreground">{settings.retryDelay}ms</span>
                        </div>
                        <Slider
                          value={[settings.retryDelay]}
                          onValueChange={([value]) => updateSetting('retryDelay', value)}
                          min={500}
                          max={5000}
                          step={500}
                          className="w-full"
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Privacy Settings */}
            <TabsContent value="privacy" className="space-y-4 mt-0">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Privacy & Security</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Privacy Mode */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Privacy Mode</label>
                      <p className="text-xs text-muted-foreground">Hide sensitive information</p>
                    </div>
                    <Switch
                      checked={settings.privacyMode}
                      onCheckedChange={(checked) => updateSetting('privacyMode', checked)}
                    />
                  </div>

                  {/* Auto Delete Messages */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Auto Delete Messages</label>
                      <p className="text-xs text-muted-foreground">Delete old messages automatically</p>
                    </div>
                    <Switch
                      checked={settings.autoDeleteMessages}
                      onCheckedChange={(checked) => updateSetting('autoDeleteMessages', checked)}
                    />
                  </div>

                  {settings.autoDeleteMessages && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Message TTL</label>
                        <span className="text-xs text-muted-foreground">{settings.messageTTL}h</span>
                      </div>
                      <Slider
                        value={[settings.messageTTL]}
                        onValueChange={([value]) => updateSetting('messageTTL', value)}
                        min={1}
                        max={168}
                        step={1}
                        className="w-full"
                      />
                    </div>
                  )}

                  {/* Message Queue Size */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Message Queue Size</label>
                      <span className="text-xs text-muted-foreground">{settings.messageQueueSize}</span>
                    </div>
                    <Slider
                      value={[settings.messageQueueSize]}
                      onValueChange={([value]) => updateSetting('messageQueueSize', value)}
                      min={50}
                      max={500}
                      step={50}
                      className="w-full"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t space-y-3">
        {/* Import/Export */}
        <div className="flex items-center space-x-2">
          <input
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
            id="import-settings"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => document.getElementById('import-settings')?.click()}
            className="flex-1"
          >
            <Upload className="h-3 w-3 mr-1" />
            Import
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="flex-1"
          >
            <Download className="h-3 w-3 mr-1" />
            Export
          </Button>
        </div>

        {/* Save/Reset */}
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="flex-1"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Reset
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="flex-1"
          >
            {saving ? (
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Save className="h-3 w-3 mr-1" />
            )}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ChatSettings;