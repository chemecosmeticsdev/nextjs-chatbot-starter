import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

/**
 * WebSocket Route Handler for Next.js App Router
 *
 * Note: Next.js App Router doesn't support WebSocket upgrades directly.
 * This endpoint provides information about WebSocket availability.
 * The actual WebSocket server is handled via the instrumentation file.
 */

export async function GET(request: NextRequest) {
  const url = new URL(request.url);

  // Check if this is a WebSocket upgrade request
  const upgrade = request.headers.get('upgrade');
  const connection = request.headers.get('connection');

  if (upgrade?.toLowerCase() === 'websocket' || connection?.toLowerCase().includes('upgrade')) {
    // WebSocket upgrade requests should be handled by the instrumentation WebSocket server
    return NextResponse.json(
      {
        error: 'WebSocket upgrades not supported in this endpoint',
        message: 'WebSocket server runs on the same port via instrumentation',
        websocketUrl: `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}/api/ws`
      },
      { status: 400 }
    );
  }

  // Regular HTTP request - return WebSocket server information
  return NextResponse.json({
    status: 'WebSocket server available',
    endpoint: `/api/ws`,
    protocol: url.protocol === 'https:' ? 'wss:' : 'ws:',
    url: `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}/api/ws`,
    supportedFeatures: [
      'real-time chat',
      'typing indicators',
      'connection status',
      'room-based messaging',
      'authentication'
    ]
  });
}

export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: 'POST not supported on WebSocket endpoint' },
    { status: 405 }
  );
}