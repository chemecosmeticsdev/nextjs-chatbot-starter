'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function WidgetPreviewPage() {
  const params = useParams();
  const chatbotId = params.id as string;
  const [widgetConfig, setWidgetConfig] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadWidgetConfig = async () => {
      try {
        // In a real implementation, this would fetch the public widget config
        // For now, we'll create a mock configuration
        const mockConfig = {
          apiKey: 'preview_key',
          chatbotId: chatbotId,
          theme: {
            primary_color: '#3b82f6',
            secondary_color: '#f3f4f6',
            background_color: '#ffffff',
            text_color: '#374151',
            border_radius: 12,
            font_family: 'Inter, sans-serif',
            font_size: 14
          },
          layout: {
            position: 'bottom-right',
            width: 380,
            height: 500,
            margin: 20,
            bubble_style: 'circle'
          },
          behavior: {
            greeting_message: 'Hi! This is a preview of your chatbot widget. How can I help you today?',
            placeholder_text: 'Type your message...',
            auto_open: false,
            auto_open_delay: 3000,
            show_typing_indicator: true,
            sound_enabled: false, // Disabled for preview
            persistent: true
          },
          branding: {
            show_powered_by: true,
            bot_name: 'Preview Bot',
            company_name: 'Your Company'
          }
        };

        setWidgetConfig(mockConfig);
        setIsLoading(false);

        // Load widget script dynamically
        const script = document.createElement('script');
        script.src = `/widget.js`;
        script.async = true;
        script.onload = () => {
          if (window.ChatbotWidget) {
            window.ChatbotWidget.init(mockConfig);
          }
        };
        document.head.appendChild(script);

      } catch (err) {
        setError('Failed to load widget configuration');
        setIsLoading(false);
      }
    };

    loadWidgetConfig();
  }, [chatbotId]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading widget preview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Preview Error</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Widget Preview</h1>
                <p className="text-gray-600">Chatbot ID: {chatbotId}</p>
              </div>
              <div className="flex items-center space-x-4">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                  <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
                  Live Preview
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Preview Section */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Live Preview</h2>
            <div className="bg-gray-50 rounded-lg p-8 min-h-[400px] relative border-2 border-dashed border-gray-300">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-gray-400 text-4xl mb-4">💬</div>
                  <p className="text-gray-600 mb-2">Your chatbot widget will appear here</p>
                  <p className="text-sm text-gray-500">Look for the chat bubble in the bottom-right corner</p>
                </div>
              </div>

              {/* Simulated website content */}
              <div className="relative z-10 space-y-4">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                <div className="mt-6 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-full"></div>
                  <div className="h-3 bg-gray-200 rounded w-full"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                </div>
              </div>
            </div>

            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-medium text-blue-900 mb-2">Testing Instructions</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Click the chat bubble to open the widget</li>
                <li>• Send a test message to see how it responds</li>
                <li>• Try resizing your browser window to test responsiveness</li>
                <li>• Use keyboard shortcut Ctrl+Shift+C to toggle the widget</li>
              </ul>
            </div>
          </div>

          {/* Configuration Info */}
          <div className="space-y-6">
            {/* Widget Status */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Widget Status</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className="text-green-600 font-medium">Preview Mode</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Position:</span>
                  <span className="font-medium">{widgetConfig?.layout?.position}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Auto-open:</span>
                  <span className="font-medium">{widgetConfig?.behavior?.auto_open ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Typing indicator:</span>
                  <span className="font-medium">{widgetConfig?.behavior?.show_typing_indicator ? 'Yes' : 'No'}</span>
                </div>
              </div>
            </div>

            {/* Theme Preview */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Theme Preview</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Primary Color:</span>
                  <div className="flex items-center space-x-2">
                    <div
                      className="w-6 h-6 rounded border"
                      style={{ backgroundColor: widgetConfig?.theme?.primary_color }}
                    ></div>
                    <span className="font-mono text-sm">{widgetConfig?.theme?.primary_color}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Secondary Color:</span>
                  <div className="flex items-center space-x-2">
                    <div
                      className="w-6 h-6 rounded border"
                      style={{ backgroundColor: widgetConfig?.theme?.secondary_color }}
                    ></div>
                    <span className="font-mono text-sm">{widgetConfig?.theme?.secondary_color}</span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Border Radius:</span>
                  <span className="font-medium">{widgetConfig?.theme?.border_radius}px</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Font Family:</span>
                  <span className="font-medium">{widgetConfig?.theme?.font_family}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Actions</h2>
              <div className="space-y-3">
                <button
                  onClick={() => {
                    if (window.ChatbotWidget) {
                      window.ChatbotWidget.open();
                    }
                  }}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Open Widget
                </button>
                <button
                  onClick={() => {
                    if (window.ChatbotWidget) {
                      window.ChatbotWidget.close();
                    }
                  }}
                  className="w-full bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Close Widget
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors"
                >
                  Reload Preview
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    ChatbotWidget: {
      init: (config: any) => void;
      open: () => void;
      close: () => void;
    };
  }
}