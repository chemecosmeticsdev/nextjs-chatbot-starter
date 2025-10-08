/**
 * Application setup and initialization
 * This file should be imported early in the application lifecycle
 */

import {
  configureEventEmitters,
  setupGracefulShutdown,
  monitorEventEmitterMemory,
  debugEventEmitters,
  startLightweightMemoryMonitoring
} from './utils/event-emitter-config';
// Dynamic import for job-processors to prevent build-time initialization

/**
 * Get job queue manager with dynamic import to prevent build-time initialization
 */
async function getJobQueueManager() {
  try {
    const { jobQueueManager } = await import('./services/job-processors');
    return jobQueueManager;
  } catch (error) {
    console.error('[Setup] Failed to load job queue manager:', error);
    throw new Error('Job queue manager unavailable');
  }
}

// Track initialization to prevent multiple starts
let isInitialized = false;
let isInitializing = false;

/**
 * Initialize all application-wide configurations
 * Protected against multiple initializations to prevent memory leaks
 */
export async function initializeApplication() {
  if (isInitialized) {
    console.log('[Setup] Application already initialized, skipping...');
    return;
  }

  if (isInitializing) {
    console.log('[Setup] Application initialization already in progress, skipping...');
    return;
  }

  isInitializing = true;
  console.log('[Setup] Initializing application...');

  try {
    // Configure EventEmitter settings
    configureEventEmitters();

    // Setup graceful shutdown handling
    setupGracefulShutdown();

    // Start job queue manager for background processing (with safety check)
    try {
      const jobQueueManager = await getJobQueueManager();
      await jobQueueManager.start();
      console.log('[Setup] Job queue manager started successfully');
    } catch (jobQueueError) {
      console.error('[Setup] Failed to start job queue manager:', jobQueueError);
      // Don't throw - allow app to continue without background processing
      console.warn('[Setup] Background job processing will be disabled');
    }

    // Enable optional monitoring in development (opt-in only)
    if (process.env.NODE_ENV === 'development') {
      // Heavy memory monitoring is opt-in only via ENABLE_MEMORY_MONITORING=true
      // (disabled by default to prevent memory issues)
      monitorEventEmitterMemory();

      // Lightweight memory monitoring is opt-in via ENABLE_LIGHTWEIGHT_MONITORING=true
      const lightweightCleanup = startLightweightMemoryMonitoring();

      // Debug monitoring is opt-in via DEBUG_EVENT_EMITTERS=true
      const debugCleanup = debugEventEmitters();

      // Store cleanup functions for shutdown
      if (lightweightCleanup) {
        process.once('SIGINT', lightweightCleanup);
        process.once('SIGTERM', lightweightCleanup);
      }
      if (debugCleanup) {
        process.once('SIGINT', debugCleanup);
        process.once('SIGTERM', debugCleanup);
      }
    }

    console.log('[Setup] Application initialized successfully');
    isInitialized = true;
  } catch (error) {
    console.error('[Setup] Failed to initialize application:', error);
    isInitializing = false; // Reset flag on error
    throw error;
  } finally {
    isInitializing = false;
  }
}

/**
 * Shutdown application and cleanup resources
 */
export async function shutdownApplication() {
  if (!isInitialized) {
    console.log('[Setup] Application not initialized, nothing to shutdown');
    return;
  }

  console.log('[Setup] Shutting down application...');

  try {
    // Stop job queue manager
    const jobQueueManager = await getJobQueueManager();
    await jobQueueManager.stop();
    console.log('[Setup] Job queue manager stopped');

    isInitialized = false;
    console.log('[Setup] Application shutdown complete');
  } catch (error) {
    console.error('[Setup] Failed to shutdown application:', error);
    throw error;
  }
}

// REMOVED: Auto-initialization to prevent double initialization
// This is now only called from instrumentation.ts to prevent memory leaks
// The previous auto-initialization was causing multiple job queue managers to start