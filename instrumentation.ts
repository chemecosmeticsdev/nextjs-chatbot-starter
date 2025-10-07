/**
 * Next.js Instrumentation
 * This file runs when the Next.js server starts up
 * Perfect for application initialization like starting job queues and WebSocket server
 */

export async function register() {
  // Only run initialization on the server side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('Initializing application services...');

    try {
      // Initialize WebSocket server for development
      if (process.env.NODE_ENV === 'development') {
        const { startWebSocketServer } = await import('@/lib/websocket/dev-server');
        await startWebSocketServer();
      }

      // Import and run setup initialization
      // const { initializeApplication } = await import('./lib/setup');
      // await initializeApplication();

      console.log('Application services initialized successfully');
    } catch (error) {
      console.error('Failed to initialize application services:', error);
    }
  }
}