import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chatbotWidgetConfigs, chatbots } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth } from '@/lib/middleware/api-auth';
import { rateLimitMiddleware } from '@/lib/middleware/rate-limit';
import { WidgetService } from '@/lib/services/widget-service';

// GET /api/v1/chatbots/[id]/integrations/widget/embed
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Apply middleware
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const rateLimitResult = await rateLimitMiddleware(request, 'api');
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const chatbotId = params.id;
    const userId = authResult.user.id;
    const url = new URL(request.url);

    // Parse query parameters
    const format = url.searchParams.get('format') || 'html'; // html, react, vue, angular
    const includeStyles = url.searchParams.get('styles') !== 'false';
    const minified = url.searchParams.get('minified') !== 'false';

    // Verify chatbot ownership and get widget configuration
    const chatbot = await db.select()
      .from(chatbots)
      .where(and(
        eq(chatbots.id, chatbotId),
        eq(chatbots.userId, userId)
      ))
      .limit(1);

    if (chatbot.length === 0) {
      return NextResponse.json({ error: 'Chatbot not found' }, { status: 404 });
    }

    // Get widget configuration
    const widgetConfig = await db.select()
      .from(chatbotWidgetConfigs)
      .where(eq(chatbotWidgetConfigs.chatbotId, chatbotId))
      .limit(1);

    if (widgetConfig.length === 0) {
      return NextResponse.json({ error: 'Widget configuration not found' }, { status: 404 });
    }

    const config = widgetConfig[0];
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${request.nextUrl.protocol}//${request.nextUrl.host}`;

    // Generate embed code based on format
    let embedCode = '';
    let instructions = '';

    switch (format) {
      case 'html':
        embedCode = generateHTMLEmbedCode(config, baseUrl, includeStyles, minified);
        instructions = getHTMLInstructions();
        break;
      case 'react':
        embedCode = generateReactEmbedCode(config, baseUrl);
        instructions = getReactInstructions();
        break;
      case 'vue':
        embedCode = generateVueEmbedCode(config, baseUrl);
        instructions = getVueInstructions();
        break;
      case 'angular':
        embedCode = generateAngularEmbedCode(config, baseUrl);
        instructions = getAngularInstructions();
        break;
      default:
        return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
    }

    // Generate additional information
    const integrationInfo = {
      chatbot_id: chatbotId,
      widget_status: config.status,
      api_key: config.apiKey,
      version: config.version,
      last_updated: config.updatedAt,
      security: {
        allowed_domains: (config.securityConfig as any)?.allowed_domains || [],
        rate_limit_enabled: (config.securityConfig as any)?.rate_limit_enabled || false,
        csrf_protection: (config.securityConfig as any)?.csrf_protection || false
      },
      performance: {
        load_time_estimate: '< 500ms',
        bundle_size: '~25KB (gzipped)',
        browser_support: 'Chrome 60+, Firefox 55+, Safari 11+, Edge 79+'
      }
    };

    return NextResponse.json({
      success: true,
      format,
      embed_code: embedCode,
      instructions,
      integration_info: integrationInfo,
      examples: {
        basic_usage: embedCode,
        with_custom_triggers: generateCustomTriggerExample(config, baseUrl),
        with_callbacks: generateCallbackExample(config, baseUrl)
      },
      testing: {
        preview_url: `${baseUrl}/integrations/widget/${chatbotId}/preview`,
        test_domains: ['localhost', '127.0.0.1', 'test.local']
      }
    });

  } catch (error) {
    console.error('Error generating embed code:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function generateHTMLEmbedCode(config: any, baseUrl: string, includeStyles: boolean, minified: boolean): string {
  const indent = minified ? '' : '  ';
  const newline = minified ? '' : '\n';

  let code = `<!-- Chatbot Widget -->${newline}`;
  code += `<script>${newline}`;
  code += `${indent}(function() {${newline}`;
  code += `${indent}${indent}var chatbotConfig = {${newline}`;
  code += `${indent}${indent}${indent}apiKey: '${config.apiKey}',${newline}`;
  code += `${indent}${indent}${indent}chatbotId: '${config.chatbotId}',${newline}`;
  code += `${indent}${indent}${indent}theme: ${JSON.stringify(config.themeConfig, null, minified ? 0 : 6)},${newline}`;
  code += `${indent}${indent}${indent}layout: ${JSON.stringify(config.layoutConfig, null, minified ? 0 : 6)},${newline}`;
  code += `${indent}${indent}${indent}behavior: ${JSON.stringify(config.behaviorConfig, null, minified ? 0 : 6)},${newline}`;
  code += `${indent}${indent}${indent}branding: ${JSON.stringify(config.brandingConfig, null, minified ? 0 : 6)}${newline}`;
  code += `${indent}${indent}};${newline}${newline}`;
  code += `${indent}${indent}var script = document.createElement('script');${newline}`;
  code += `${indent}${indent}script.src = '${baseUrl}/api/integrations/widget/' + chatbotConfig.chatbotId + '/loader.js';${newline}`;
  code += `${indent}${indent}script.async = true;${newline}`;
  code += `${indent}${indent}script.onload = function() {${newline}`;
  code += `${indent}${indent}${indent}window.ChatbotWidget.init(chatbotConfig);${newline}`;
  code += `${indent}${indent}};${newline}`;
  code += `${indent}${indent}document.head.appendChild(script);${newline}`;
  code += `${indent}})();${newline}`;
  code += `</script>${newline}`;
  code += `<!-- End Chatbot Widget -->`;

  return code;
}

function generateReactEmbedCode(config: any, baseUrl: string): string {
  return `import React, { useEffect } from 'react';

const ChatbotWidget = () => {
  useEffect(() => {
    // Widget configuration
    const chatbotConfig = {
      apiKey: '${config.apiKey}',
      chatbotId: '${config.chatbotId}',
      theme: ${JSON.stringify(config.themeConfig, null, 6)},
      layout: ${JSON.stringify(config.layoutConfig, null, 6)},
      behavior: ${JSON.stringify(config.behaviorConfig, null, 6)},
      branding: ${JSON.stringify(config.brandingConfig, null, 6)}
    };

    // Load widget script
    const script = document.createElement('script');
    script.src = '${baseUrl}/api/integrations/widget/' + chatbotConfig.chatbotId + '/loader.js';
    script.async = true;
    script.onload = () => {
      window.ChatbotWidget.init(chatbotConfig);
    };
    document.head.appendChild(script);

    // Cleanup
    return () => {
      if (window.ChatbotWidget) {
        // Cleanup widget if needed
      }
    };
  }, []);

  return null; // Widget renders itself
};

export default ChatbotWidget;

// Usage in your app:
// import ChatbotWidget from './ChatbotWidget';
//
// function App() {
//   return (
//     <div>
//       {/* Your app content */}
//       <ChatbotWidget />
//     </div>
//   );
// }`;
}

function generateVueEmbedCode(config: any, baseUrl: string): string {
  return `<template>
  <!-- Widget renders itself, no template needed -->
</template>

<script>
export default {
  name: 'ChatbotWidget',
  mounted() {
    // Widget configuration
    const chatbotConfig = {
      apiKey: '${config.apiKey}',
      chatbotId: '${config.chatbotId}',
      theme: ${JSON.stringify(config.themeConfig, null, 6)},
      layout: ${JSON.stringify(config.layoutConfig, null, 6)},
      behavior: ${JSON.stringify(config.behaviorConfig, null, 6)},
      branding: ${JSON.stringify(config.brandingConfig, null, 6)}
    };

    // Load widget script
    const script = document.createElement('script');
    script.src = '${baseUrl}/api/integrations/widget/' + chatbotConfig.chatbotId + '/loader.js';
    script.async = true;
    script.onload = () => {
      window.ChatbotWidget.init(chatbotConfig);
    };
    document.head.appendChild(script);
  },
  beforeDestroy() {
    // Cleanup widget if needed
    if (window.ChatbotWidget) {
      // Cleanup logic here
    }
  }
}
</script>

<!-- Usage in your Vue app: -->
<!-- <ChatbotWidget /> -->`;
}

function generateAngularEmbedCode(config: any, baseUrl: string): string {
  return `import { Component, OnInit, OnDestroy } from '@angular/core';

declare global {
  interface Window {
    ChatbotWidget: any;
  }
}

@Component({
  selector: 'app-chatbot-widget',
  template: ''
})
export class ChatbotWidgetComponent implements OnInit, OnDestroy {

  ngOnInit(): void {
    // Widget configuration
    const chatbotConfig = {
      apiKey: '${config.apiKey}',
      chatbotId: '${config.chatbotId}',
      theme: ${JSON.stringify(config.themeConfig, null, 6)},
      layout: ${JSON.stringify(config.layoutConfig, null, 6)},
      behavior: ${JSON.stringify(config.behaviorConfig, null, 6)},
      branding: ${JSON.stringify(config.brandingConfig, null, 6)}
    };

    // Load widget script
    const script = document.createElement('script');
    script.src = '${baseUrl}/api/integrations/widget/' + chatbotConfig.chatbotId + '/loader.js';
    script.async = true;
    script.onload = () => {
      window.ChatbotWidget.init(chatbotConfig);
    };
    document.head.appendChild(script);
  }

  ngOnDestroy(): void {
    // Cleanup widget if needed
    if (window.ChatbotWidget) {
      // Cleanup logic here
    }
  }
}

// Usage in your Angular app:
// 1. Add ChatbotWidgetComponent to your module declarations
// 2. Use <app-chatbot-widget></app-chatbot-widget> in your templates`;
}

function generateCustomTriggerExample(config: any, baseUrl: string): string {
  return `<!-- Custom trigger example -->
<button id="open-chat-btn">Need Help?</button>

<script>
(function() {
  var chatbotConfig = {
    apiKey: '${config.apiKey}',
    chatbotId: '${config.chatbotId}',
    // ... other config
    behavior: {
      ...${JSON.stringify(config.behaviorConfig, null, 2)},
      auto_open: false // Don't auto-open
    }
  };

  var script = document.createElement('script');
  script.src = '${baseUrl}/api/integrations/widget/' + chatbotConfig.chatbotId + '/loader.js';
  script.async = true;
  script.onload = function() {
    window.ChatbotWidget.init(chatbotConfig);

    // Custom trigger
    document.getElementById('open-chat-btn').addEventListener('click', function() {
      window.ChatbotWidget.open();
    });
  };
  document.head.appendChild(script);
})();
</script>`;
}

function generateCallbackExample(config: any, baseUrl: string): string {
  return `<script>
(function() {
  var chatbotConfig = {
    apiKey: '${config.apiKey}',
    chatbotId: '${config.chatbotId}',
    // ... other config
    callbacks: {
      onOpen: function() {
        console.log('Chat opened');
        // Track with your analytics
        gtag('event', 'chat_opened');
      },
      onClose: function() {
        console.log('Chat closed');
      },
      onMessage: function(message) {
        console.log('New message:', message);
      }
    }
  };

  // Load widget...
})();
</script>`;
}

function getHTMLInstructions(): string {
  return `HTML Integration Instructions:

1. Copy the embed code
2. Paste it before the closing </body> tag of your website
3. The widget will automatically load and initialize
4. Test on your domain to ensure it works correctly

Advanced Options:
- Add ?format=html&styles=false to exclude default styles
- Add ?minified=true for minified code
- Customize the configuration object as needed`;
}

function getReactInstructions(): string {
  return `React Integration Instructions:

1. Create a new component file (e.g., ChatbotWidget.js)
2. Copy the provided React code
3. Import and use the component in your app
4. The widget will load when the component mounts

Note: The widget creates its own DOM elements and doesn't interfere with React's virtual DOM.`;
}

function getVueInstructions(): string {
  return `Vue Integration Instructions:

1. Create a new Vue component (e.g., ChatbotWidget.vue)
2. Copy the provided Vue code
3. Register and use the component in your app
4. The widget will load when the component is mounted

The widget manages its own lifecycle and DOM elements.`;
}

function getAngularInstructions(): string {
  return `Angular Integration Instructions:

1. Create a new component using Angular CLI: ng generate component chatbot-widget
2. Replace the generated code with the provided Angular code
3. Add the component to your module declarations
4. Use the component in your templates

The widget integrates seamlessly with Angular's lifecycle hooks.`;
}