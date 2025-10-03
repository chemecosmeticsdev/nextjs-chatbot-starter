'use client';

import { useEffect, useRef } from 'react';
import { apiSpec } from '@/lib/docs/api-spec';

/**
 * Interactive API Documentation Page
 * Renders Swagger UI for the Public API
 */
export default function ApiDocsPage() {
  const swaggerUIRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Dynamically import SwaggerUI to avoid SSR issues
    import('swagger-ui-react').then(({ default: SwaggerUI }) => {
      import('swagger-ui-react/swagger-ui.css');

      const { render } = require('react-dom');

      if (swaggerUIRef.current) {
        render(
          <SwaggerUI
            spec={apiSpec}
            docExpansion="list"
            defaultModelsExpandDepth={1}
            defaultModelExpandDepth={1}
            tryItOutEnabled={true}
            requestInterceptor={(request) => {
              // Add API key to requests for testing
              const apiKey = localStorage.getItem('api_key');
              if (apiKey) {
                request.headers['x-api-key'] = apiKey;
              }
              return request;
            }}
            onComplete={(system) => {
              // Add custom styling and features
              const style = document.createElement('style');
              style.textContent = `
                .swagger-ui .topbar { display: none; }
                .swagger-ui .info .title {
                  color: #1f2937;
                  font-size: 2.5rem;
                  font-weight: 700;
                }
                .swagger-ui .scheme-container {
                  background: #f8fafc;
                  border: 1px solid #e2e8f0;
                  border-radius: 8px;
                  padding: 1rem;
                  margin-bottom: 2rem;
                }
                .swagger-ui .info .description p {
                  font-size: 1.1rem;
                  line-height: 1.6;
                  color: #4b5563;
                }
              `;
              document.head.appendChild(style);
            }}
          />,
          swaggerUIRef.current
        );
      }
    }).catch(error => {
      console.error('Failed to load Swagger UI:', error);
      // Fallback to basic documentation
      if (swaggerUIRef.current) {
        swaggerUIRef.current.innerHTML = `
          <div class="p-8 max-w-4xl mx-auto">
            <h1 class="text-3xl font-bold text-gray-900 mb-6">Chatbot Public API Documentation</h1>
            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <p class="text-yellow-800">
                Interactive documentation is temporarily unavailable. Please refer to the static documentation below.
              </p>
            </div>
            <div class="prose prose-lg max-w-none">
              <h2>Authentication</h2>
              <p>All API requests require authentication using an API key:</p>
              <pre class="bg-gray-100 p-4 rounded"><code>x-api-key: cb_live_your_api_key_here</code></pre>

              <h2>Endpoints</h2>

              <h3>GET /api/v1/public/chat/{chatbotId}/config</h3>
              <p>Retrieve chatbot configuration for widget integration.</p>

              <h3>POST /api/v1/public/chat/{chatbotId}/messages</h3>
              <p>Send a message to the chatbot and receive a response.</p>

              <h3>GET /api/v1/public/chat/{chatbotId}/messages</h3>
              <p>Retrieve conversation history for a session.</p>

              <h2>Rate Limits</h2>
              <ul>
                <li><strong>Free Tier</strong>: 1,000 requests/hour, 10,000 requests/day</li>
                <li><strong>Basic Tier</strong>: 10,000 requests/hour, 100,000 requests/day</li>
                <li><strong>Premium Tier</strong>: 100,000 requests/hour, 1,000,000 requests/day</li>
                <li><strong>Enterprise Tier</strong>: Custom limits</li>
              </ul>
            </div>
          </div>
        `;
      }
    });
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">API Documentation</h1>
              <p className="mt-2 text-blue-100">
                Complete reference for the Chatbot Public API
              </p>
            </div>
            <div className="hidden md:flex items-center space-x-4">
              <a
                href="/docs/guides"
                className="bg-blue-500 hover:bg-blue-400 px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Guides
              </a>
              <a
                href="/docs/examples"
                className="bg-blue-500 hover:bg-blue-400 px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Examples
              </a>
              <a
                href="/portal"
                className="bg-white text-blue-600 hover:bg-gray-50 px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Developer Portal
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* API Key Input */}
      <div className="bg-gray-50 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center space-x-4">
            <label htmlFor="api-key" className="text-sm font-medium text-gray-700">
              API Key (for testing):
            </label>
            <input
              type="password"
              id="api-key"
              placeholder="cb_live_your_api_key_here"
              className="flex-1 max-w-md px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              onChange={(e) => {
                localStorage.setItem('api_key', e.target.value);
              }}
            />
            <button
              onClick={() => {
                const input = document.getElementById('api-key') as HTMLInputElement;
                if (input) {
                  input.value = '';
                  localStorage.removeItem('api_key');
                }
              }}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Clear
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            Enter your API key to test endpoints directly from this documentation.
          </p>
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap gap-4">
            <a
              href="#/Chat/sendMessage"
              className="text-blue-600 hover:text-blue-800 font-medium text-sm"
            >
              Send Message
            </a>
            <a
              href="#/Chat/getConversationHistory"
              className="text-blue-600 hover:text-blue-800 font-medium text-sm"
            >
              Get History
            </a>
            <a
              href="#/Chat/getChatbotConfig"
              className="text-blue-600 hover:text-blue-800 font-medium text-sm"
            >
              Get Config
            </a>
            <a
              href="#/components/schemas/SendMessageRequest"
              className="text-blue-600 hover:text-blue-800 font-medium text-sm"
            >
              Request Schema
            </a>
          </div>
        </div>
      </div>

      {/* Swagger UI Container */}
      <div ref={swaggerUIRef} className="swagger-ui-container" />

      {/* Footer */}
      <footer className="bg-gray-50 border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Resources</h3>
              <ul className="space-y-2">
                <li>
                  <a href="/docs/guides/getting-started" className="text-gray-600 hover:text-gray-900">
                    Getting Started
                  </a>
                </li>
                <li>
                  <a href="/docs/guides/authentication" className="text-gray-600 hover:text-gray-900">
                    Authentication
                  </a>
                </li>
                <li>
                  <a href="/docs/guides/rate-limits" className="text-gray-600 hover:text-gray-900">
                    Rate Limits
                  </a>
                </li>
                <li>
                  <a href="/docs/guides/webhooks" className="text-gray-600 hover:text-gray-900">
                    Webhooks
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">SDKs</h3>
              <ul className="space-y-2">
                <li>
                  <a href="/docs/sdks/javascript" className="text-gray-600 hover:text-gray-900">
                    JavaScript/TypeScript
                  </a>
                </li>
                <li>
                  <a href="/docs/sdks/python" className="text-gray-600 hover:text-gray-900">
                    Python
                  </a>
                </li>
                <li>
                  <a href="/docs/sdks/php" className="text-gray-600 hover:text-gray-900">
                    PHP
                  </a>
                </li>
                <li>
                  <a href="/docs/sdks/go" className="text-gray-600 hover:text-gray-900">
                    Go
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Support</h3>
              <ul className="space-y-2">
                <li>
                  <a href="/docs/support" className="text-gray-600 hover:text-gray-900">
                    Contact Support
                  </a>
                </li>
                <li>
                  <a href="/docs/status" className="text-gray-600 hover:text-gray-900">
                    API Status
                  </a>
                </li>
                <li>
                  <a href="/docs/changelog" className="text-gray-600 hover:text-gray-900">
                    Changelog
                  </a>
                </li>
                <li>
                  <a href="/community" className="text-gray-600 hover:text-gray-900">
                    Community
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-200">
            <p className="text-center text-gray-600">
              © 2024 Chatbot API. All rights reserved. API Version 1.0
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}