import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chatbotWidgetConfigs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { rateLimitMiddleware } from '@/lib/middleware/rate-limit';
import { readFile } from 'fs/promises';
import { join } from 'path';

// GET /api/integrations/widget/[id]/loader.js
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Apply rate limiting for public widget loading
    const rateLimitResult = await rateLimitMiddleware(request, 'public');
    if (!rateLimitResult.success) {
      return new NextResponse('Rate limit exceeded', { status: 429 });
    }

    const chatbotId = params.id;

    // Get widget configuration
    const widgetConfig = await db.select()
      .from(chatbotWidgetConfigs)
      .where(eq(chatbotWidgetConfigs.chatbotId, chatbotId))
      .limit(1);

    if (widgetConfig.length === 0) {
      return new NextResponse('Widget not found', { status: 404 });
    }

    const config = widgetConfig[0];

    // Check if widget is active
    if (config.status !== 'active') {
      return new NextResponse('Widget not active', { status: 403 });
    }

    // Validate domain if restrictions are set
    const referer = request.headers.get('referer');
    if (referer && config.securityConfig) {
      const securityConfig = config.securityConfig as any;
      if (securityConfig.allowed_domains && securityConfig.allowed_domains.length > 0) {
        const domain = new URL(referer).hostname;
        const isAllowed = securityConfig.allowed_domains.some((allowedDomain: string) => {
          if (allowedDomain.startsWith('*.')) {
            const baseDomain = allowedDomain.substring(2);
            return domain === baseDomain || domain.endsWith('.' + baseDomain);
          }
          return domain === allowedDomain;
        });

        if (!isAllowed) {
          return new NextResponse('Domain not allowed', { status: 403 });
        }
      }
    }

    // Read the widget runtime file
    const widgetRuntimePath = join(process.cwd(), 'public', 'widget.js');
    const widgetRuntime = await readFile(widgetRuntimePath, 'utf-8');

    // Generate widget initialization code
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${request.nextUrl.protocol}//${request.nextUrl.host}`;

    const initializationCode = `
// Auto-generated widget loader for chatbot: ${chatbotId}
// Generated at: ${new Date().toISOString()}

(function() {
  // Widget configuration
  window.chatbotConfig = {
    apiKey: '${config.apiKey}',
    chatbotId: '${chatbotId}',
    theme: ${JSON.stringify(config.themeConfig)},
    layout: ${JSON.stringify(config.layoutConfig)},
    behavior: ${JSON.stringify(config.behaviorConfig)},
    branding: ${JSON.stringify(config.brandingConfig)},
    baseUrl: '${baseUrl}'
  };

  // Load and initialize widget
  ${widgetRuntime}
})();
`;

    // Set appropriate headers for JavaScript content
    const headers = new Headers();
    headers.set('Content-Type', 'application/javascript; charset=utf-8');
    headers.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET');
    headers.set('X-Content-Type-Options', 'nosniff');

    return new NextResponse(initializationCode, {
      status: 200,
      headers
    });

  } catch (error) {
    console.error('Error serving widget loader:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}

// OPTIONS for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}