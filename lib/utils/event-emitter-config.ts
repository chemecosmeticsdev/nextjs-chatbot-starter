/**
 * EventEmitter configuration utilities
 * Addresses memory leak warnings and manages event listener limits
 */

import { EventEmitter } from 'events';
import { jobQueueManager } from '../services/job-processors';

/**
 * Configure global EventEmitter settings to prevent memory leak warnings
 */
export function configureEventEmitters() {
  // Increase default max listeners to handle Next.js server operations
  if (process.env.NODE_ENV === 'development') {
    EventEmitter.defaultMaxListeners = 30;
    process.setMaxListeners(30);
  } else {
    EventEmitter.defaultMaxListeners = 25;
    process.setMaxListeners(25);
  }

  console.log(`[EventEmitter] Default max listeners set to ${EventEmitter.defaultMaxListeners}`);

  // Add listener count monitoring for critical events
  const originalSetMaxListeners = EventEmitter.prototype.setMaxListeners;
  EventEmitter.prototype.setMaxListeners = function(n: number) {
    if (process.env.NODE_ENV === 'development' && n < 15) {
      console.warn(`[EventEmitter] Low max listeners (${n}) set for event emitter. Consider increasing to prevent warnings.`);
    }
    return originalSetMaxListeners.call(this, n);
  };
}

/**
 * Create a safe EventEmitter with proper cleanup methods
 */
export class SafeEventEmitter extends EventEmitter {
  private cleanupCallbacks: Array<() => void> = [];

  constructor(maxListeners: number = 25) {
    super();
    this.setMaxListeners(maxListeners);
  }

  /**
   * Add a cleanup callback to be called when the emitter is destroyed
   */
  addCleanup(callback: () => void) {
    this.cleanupCallbacks.push(callback);
  }

  /**
   * Clean up all listeners and cleanup callbacks
   */
  cleanup() {
    // Remove all listeners
    this.removeAllListeners();

    // Execute cleanup callbacks
    this.cleanupCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Error during EventEmitter cleanup:', error);
      }
    });

    this.cleanupCallbacks = [];
  }

  /**
   * Override on to provide better cleanup tracking
   */
  on(event: string | symbol, listener: (...args: any[]) => void) {
    const result = super.on(event, listener);

    // Warn if getting close to limit
    const currentCount = this.listenerCount(event);
    if (currentCount > this.getMaxListeners() * 0.8) {
      console.warn(`[EventEmitter] High listener count for event '${String(event)}': ${currentCount}/${this.getMaxListeners()}`);
    }

    return result;
  }

  /**
   * Get current listener statistics
   */
  getListenerStats() {
    const events = this.eventNames();
    const stats = events.map(event => ({
      event: String(event),
      listeners: this.listenerCount(event)
    }));

    return {
      totalEvents: events.length,
      maxListeners: this.getMaxListeners(),
      events: stats
    };
  }
}

/**
 * Global cleanup function for graceful shutdown
 */
export function setupGracefulShutdown() {
  const cleanup = async () => {
    console.log('[EventEmitter] Performing graceful shutdown cleanup...');

    try {
      // Stop job queue manager to allow background jobs to complete gracefully
      console.log('[EventEmitter] Stopping job queue manager...');
      await jobQueueManager.stop();
      console.log('[EventEmitter] Job queue manager stopped successfully');
    } catch (error) {
      console.error('[EventEmitter] Error stopping job queue manager:', error);
    }

    // Force garbage collection if available (development mode)
    if (global.gc && process.env.NODE_ENV === 'development') {
      global.gc();
    }

    process.exit(0);
  };

  // Handle various shutdown signals
  process.on('SIGINT', () => {
    cleanup().catch(error => {
      console.error('[EventEmitter] Error during SIGINT cleanup:', error);
      process.exit(1);
    });
  });

  process.on('SIGTERM', () => {
    cleanup().catch(error => {
      console.error('[EventEmitter] Error during SIGTERM cleanup:', error);
      process.exit(1);
    });
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    cleanup().catch(cleanupError => {
      console.error('[EventEmitter] Error during exception cleanup:', cleanupError);
      process.exit(1);
    });
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit on unhandled rejections in development
    if (process.env.NODE_ENV !== 'development') {
      cleanup().catch(cleanupError => {
        console.error('[EventEmitter] Error during rejection cleanup:', cleanupError);
        process.exit(1);
      });
    }
  });
}

/**
 * Monitor EventEmitter memory usage
 * DISABLED by default to prevent memory issues caused by global emit interception
 */
export function monitorEventEmitterMemory() {
  // Only enable if explicitly requested via environment variable
  if (process.env.ENABLE_MEMORY_MONITORING !== 'true') {
    console.log('[EventEmitter] Memory monitoring disabled (set ENABLE_MEMORY_MONITORING=true to enable)');
    return;
  }

  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  console.log('[EventEmitter] Memory monitoring enabled - this may impact performance');

  const originalEmit = EventEmitter.prototype.emit;
  let emitCount = 0;
  let lastMemoryCheck = 0;
  const MEMORY_CHECK_INTERVAL = 10000; // Increased interval to reduce overhead
  const MEMORY_THRESHOLD_MB = 1500; // Alert when memory exceeds 1.5GB

  EventEmitter.prototype.emit = function(type: string | symbol, ...args: any[]) {
    emitCount++;

    // Log memory stats less frequently and only when necessary
    if (emitCount % MEMORY_CHECK_INTERVAL === 0) {
      const memUsage = process.memoryUsage();
      const rssUsageMB = Math.round(memUsage.rss / 1024 / 1024);

      // Only log if memory usage is concerning or has changed significantly
      if (rssUsageMB > MEMORY_THRESHOLD_MB || (rssUsageMB - lastMemoryCheck) > 100) {
        console.log(`[EventEmitter] Memory usage after ${emitCount} emits:`, {
          rss: `${rssUsageMB}MB`,
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
        });

        // Trigger garbage collection if available and memory is high
        if (global.gc && rssUsageMB > MEMORY_THRESHOLD_MB) {
          global.gc();
          console.log(`[EventEmitter] Triggered garbage collection due to high memory usage`);
        }

        lastMemoryCheck = rssUsageMB;
      }
    }

    return originalEmit.call(this, type, ...args);
  };
}

/**
 * Lightweight memory monitoring that doesn't intercept EventEmitter calls
 * Uses simple setInterval to check memory periodically
 */
export function startLightweightMemoryMonitoring() {
  if (process.env.NODE_ENV !== 'development' || process.env.ENABLE_LIGHTWEIGHT_MONITORING !== 'true') {
    return null;
  }

  console.log('[EventEmitter] Starting lightweight memory monitoring (30 second intervals)');

  let consecutiveHighMemoryChecks = 0;
  const MEMORY_THRESHOLD_MB = 1500;
  const CRITICAL_MEMORY_THRESHOLD_MB = 2000;

  const memoryInterval = setInterval(() => {
    const memUsage = process.memoryUsage();
    const rssUsageMB = Math.round(memUsage.rss / 1024 / 1024);

    // Only log if memory usage is concerning
    if (rssUsageMB > MEMORY_THRESHOLD_MB) {
      consecutiveHighMemoryChecks++;

      console.log('[EventEmitter] High memory usage detected:', {
        rss: `${rssUsageMB}MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        consecutiveChecks: consecutiveHighMemoryChecks
      });

      // Trigger garbage collection if available and memory is critically high
      if (global.gc && rssUsageMB > CRITICAL_MEMORY_THRESHOLD_MB) {
        global.gc();
        console.log('[EventEmitter] Triggered garbage collection due to critical memory usage');
      }

      // If memory stays high for multiple checks, suggest investigation
      if (consecutiveHighMemoryChecks >= 3) {
        console.warn('[EventEmitter] Memory usage has been high for 3+ consecutive checks. Consider investigating memory leaks.');
      }
    } else {
      consecutiveHighMemoryChecks = 0;
    }
  }, 30000); // Check every 30 seconds

  // Return cleanup function
  return () => {
    clearInterval(memoryInterval);
    console.log('[EventEmitter] Lightweight memory monitoring stopped');
  };
}

/**
 * Debug EventEmitter listener counts
 */
export function debugEventEmitters() {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  let debugInterval: NodeJS.Timeout | null = null;

  // Only enable debug monitoring if explicitly requested via environment variable
  if (process.env.DEBUG_EVENT_EMITTERS === 'true') {
    // Monitor process listeners less frequently
    debugInterval = setInterval(() => {
      const events = process.eventNames();
      const processStats = events.map(event => ({
        event: String(event),
        listeners: process.listenerCount(event)
      })).filter(stat => stat.listeners > 5); // Only report if >5 listeners

      if (processStats.length > 0) {
        console.log('[EventEmitter] Process listener stats (>5 listeners):', processStats);
      }
    }, 60000); // Reduced frequency to every 60 seconds
  }

  // Cleanup function for graceful shutdown
  return () => {
    if (debugInterval) {
      clearInterval(debugInterval);
      debugInterval = null;
    }
  };
}