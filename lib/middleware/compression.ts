import { NextRequest, NextResponse } from 'next/server';
import { gzip, deflate, brotliCompress } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const deflateAsync = promisify(deflate);
const brotliAsync = promisify(brotliCompress);

export interface CompressionOptions {
  enabled?: boolean;
  threshold?: number; // Minimum size to compress (bytes)
  level?: number; // Compression level (1-9)
  algorithms?: ('gzip' | 'deflate' | 'br')[];
  mimeTypes?: string[];
  excludePaths?: string[];
}

export interface CacheOptions {
  enabled?: boolean;
  maxAge?: number; // Cache duration in seconds
  staleWhileRevalidate?: number; // SWR duration in seconds
  mustRevalidate?: boolean;
  noCache?: boolean;
  private?: boolean;
  immutable?: boolean;
  etag?: boolean;
  lastModified?: boolean;
  varyHeaders?: string[];
}

/**
 * Response compression middleware
 */
export function withCompression(options: CompressionOptions = {}) {
  const {
    enabled = true,
    threshold = 1024, // 1KB
    level = 6,
    algorithms = ['br', 'gzip', 'deflate'],
    mimeTypes = [
      'text/html',
      'text/css',
      'text/javascript',
      'text/xml',
      'text/plain',
      'application/javascript',
      'application/json',
      'application/xml',
      'application/rss+xml',
      'application/atom+xml',
      'image/svg+xml'
    ],
    excludePaths = []
  } = options;

  return function (handler: Function) {
    return async function compressionMiddleware(
      request: NextRequest,
      context?: any
    ): Promise<NextResponse> {
      // Skip if disabled or excluded path
      if (!enabled || excludePaths.some(path => request.nextUrl.pathname.startsWith(path))) {
        return await handler(request, context);
      }

      // Get original response
      const response = await handler(request, context);

      // Skip compression for certain conditions
      if (
        !response ||
        response.status !== 200 ||
        response.headers.get('content-encoding') ||
        response.headers.get('content-length') === '0'
      ) {
        return response;
      }

      // Check content type
      const contentType = response.headers.get('content-type') || '';
      const shouldCompress = mimeTypes.some(type => contentType.includes(type));

      if (!shouldCompress) {
        return response;
      }

      // Get response body
      const body = await response.text();
      const bodyBuffer = Buffer.from(body, 'utf8');

      // Skip if below threshold
      if (bodyBuffer.length < threshold) {
        return response;
      }

      // Determine best compression algorithm
      const acceptEncoding = request.headers.get('accept-encoding') || '';
      const algorithm = getBestCompressionAlgorithm(acceptEncoding, algorithms);

      if (!algorithm) {
        return response;
      }

      try {
        // Compress the response
        const compressedBuffer = await compressBuffer(bodyBuffer, algorithm, level);

        // Create new response with compressed content
        const compressedResponse = new NextResponse(compressedBuffer, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });

        // Set compression headers
        compressedResponse.headers.set('content-encoding', algorithm);
        compressedResponse.headers.set('content-length', compressedBuffer.length.toString());
        compressedResponse.headers.set('vary', 'Accept-Encoding');

        return compressedResponse;
      } catch (error) {
        console.error('Compression error:', error);
        return response; // Return original response on compression error
      }
    };
  };
}

/**
 * Cache headers middleware
 */
export function withCacheHeaders(options: CacheOptions = {}) {
  const {
    enabled = true,
    maxAge = 300, // 5 minutes default
    staleWhileRevalidate,
    mustRevalidate = false,
    noCache = false,
    private: isPrivate = false,
    immutable = false,
    etag = true,
    lastModified = true,
    varyHeaders = ['Accept-Encoding']
  } = options;

  return function (handler: Function) {
    return async function cacheMiddleware(
      request: NextRequest,
      context?: any
    ): Promise<NextResponse> {
      const response = await handler(request, context);

      if (!enabled || !response || response.status !== 200) {
        return response;
      }

      // Build cache control directive
      const cacheDirectives: string[] = [];

      if (noCache) {
        cacheDirectives.push('no-cache', 'no-store', 'must-revalidate');
      } else {
        if (isPrivate) {
          cacheDirectives.push('private');
        } else {
          cacheDirectives.push('public');
        }

        cacheDirectives.push(`max-age=${maxAge}`);

        if (staleWhileRevalidate) {
          cacheDirectives.push(`stale-while-revalidate=${staleWhileRevalidate}`);
        }

        if (mustRevalidate) {
          cacheDirectives.push('must-revalidate');
        }

        if (immutable) {
          cacheDirectives.push('immutable');
        }
      }

      // Set cache control header
      response.headers.set('cache-control', cacheDirectives.join(', '));

      // Set vary headers
      if (varyHeaders.length > 0) {
        response.headers.set('vary', varyHeaders.join(', '));
      }

      // Generate ETag if enabled
      if (etag && !response.headers.get('etag')) {
        const body = await response.text();
        const etagValue = generateETag(body);
        response.headers.set('etag', etagValue);

        // Check if client has matching ETag
        const clientETag = request.headers.get('if-none-match');
        if (clientETag === etagValue) {
          return new NextResponse(null, {
            status: 304,
            headers: {
              'cache-control': response.headers.get('cache-control') || '',
              'etag': etagValue
            }
          });
        }
      }

      // Set last modified if enabled
      if (lastModified && !response.headers.get('last-modified')) {
        response.headers.set('last-modified', new Date().toUTCString());
      }

      return response;
    };
  };
}

/**
 * Combined compression and caching middleware
 */
export function withOptimizedResponse(
  compressionOptions: CompressionOptions = {},
  cacheOptions: CacheOptions = {}
) {
  return function (handler: Function) {
    const compressionMiddleware = withCompression(compressionOptions);
    const cacheMiddleware = withCacheHeaders(cacheOptions);

    return cacheMiddleware(compressionMiddleware(handler));
  };
}

/**
 * Predefined optimization configurations
 */
export const optimizationConfigs = {
  // For API endpoints - moderate caching, aggressive compression
  api: {
    compression: {
      enabled: true,
      threshold: 512,
      level: 6,
      algorithms: ['br', 'gzip', 'deflate'] as const
    },
    cache: {
      enabled: true,
      maxAge: 300, // 5 minutes
      staleWhileRevalidate: 600, // 10 minutes
      etag: true,
      varyHeaders: ['Accept-Encoding', 'Authorization']
    }
  },

  // For static assets - long cache, high compression
  static: {
    compression: {
      enabled: true,
      threshold: 256,
      level: 9,
      algorithms: ['br', 'gzip', 'deflate'] as const
    },
    cache: {
      enabled: true,
      maxAge: 31536000, // 1 year
      immutable: true,
      etag: true
    }
  },

  // For dynamic content - short cache, light compression
  dynamic: {
    compression: {
      enabled: true,
      threshold: 1024,
      level: 4,
      algorithms: ['gzip', 'deflate'] as const
    },
    cache: {
      enabled: true,
      maxAge: 60, // 1 minute
      mustRevalidate: true,
      etag: true,
      private: true
    }
  },

  // For admin content - no cache, light compression
  admin: {
    compression: {
      enabled: true,
      threshold: 2048,
      level: 3,
      algorithms: ['gzip'] as const
    },
    cache: {
      enabled: true,
      noCache: true,
      etag: false
    }
  },

  // For real-time data - no cache, no compression
  realtime: {
    compression: {
      enabled: false
    },
    cache: {
      enabled: true,
      noCache: true,
      etag: false
    }
  }
};

// Helper functions

function getBestCompressionAlgorithm(
  acceptEncoding: string,
  supportedAlgorithms: string[]
): string | null {
  const algorithms = acceptEncoding.toLowerCase().split(',').map(s => s.trim());

  // Priority order: brotli > gzip > deflate
  const priorityOrder = ['br', 'gzip', 'deflate'];

  for (const algorithm of priorityOrder) {
    if (
      supportedAlgorithms.includes(algorithm) &&
      algorithms.some(accepted => accepted.includes(algorithm))
    ) {
      return algorithm;
    }
  }

  return null;
}

async function compressBuffer(
  buffer: Buffer,
  algorithm: string,
  level: number
): Promise<Buffer> {
  switch (algorithm) {
    case 'br':
      return await brotliAsync(buffer, { level });
    case 'gzip':
      return await gzipAsync(buffer, { level });
    case 'deflate':
      return await deflateAsync(buffer, { level });
    default:
      throw new Error(`Unsupported compression algorithm: ${algorithm}`);
  }
}

function generateETag(content: string): string {
  const crypto = require('crypto');
  const hash = crypto.createHash('md5').update(content).digest('hex');
  return `"${hash}"`;
}

/**
 * Convenience functions for common use cases
 */
export const withApiOptimization = () => withOptimizedResponse(
  optimizationConfigs.api.compression,
  optimizationConfigs.api.cache
);

export const withStaticOptimization = () => withOptimizedResponse(
  optimizationConfigs.static.compression,
  optimizationConfigs.static.cache
);

export const withDynamicOptimization = () => withOptimizedResponse(
  optimizationConfigs.dynamic.compression,
  optimizationConfigs.dynamic.cache
);

export const withAdminOptimization = () => withOptimizedResponse(
  optimizationConfigs.admin.compression,
  optimizationConfigs.admin.cache
);

export const withRealtimeOptimization = () => withOptimizedResponse(
  optimizationConfigs.realtime.compression,
  optimizationConfigs.realtime.cache
);

/**
 * Response size and compression statistics
 */
export class CompressionStats {
  private static stats = {
    totalRequests: 0,
    compressedRequests: 0,
    totalOriginalSize: 0,
    totalCompressedSize: 0,
    compressionsByAlgorithm: {
      br: 0,
      gzip: 0,
      deflate: 0
    },
    averageCompressionRatio: 0
  };

  static trackCompression(
    originalSize: number,
    compressedSize: number,
    algorithm: string
  ): void {
    this.stats.totalRequests++;
    this.stats.compressedRequests++;
    this.stats.totalOriginalSize += originalSize;
    this.stats.totalCompressedSize += compressedSize;

    if (algorithm in this.stats.compressionsByAlgorithm) {
      this.stats.compressionsByAlgorithm[algorithm as keyof typeof this.stats.compressionsByAlgorithm]++;
    }

    // Update average compression ratio
    this.stats.averageCompressionRatio = this.stats.totalOriginalSize > 0
      ? this.stats.totalCompressedSize / this.stats.totalOriginalSize
      : 0;
  }

  static trackUncompressed(): void {
    this.stats.totalRequests++;
  }

  static getStats() {
    return {
      ...this.stats,
      compressionRate: this.stats.totalRequests > 0
        ? this.stats.compressedRequests / this.stats.totalRequests
        : 0,
      totalSavings: this.stats.totalOriginalSize - this.stats.totalCompressedSize,
      savingsPercentage: this.stats.totalOriginalSize > 0
        ? ((this.stats.totalOriginalSize - this.stats.totalCompressedSize) / this.stats.totalOriginalSize) * 100
        : 0
    };
  }

  static resetStats(): void {
    this.stats = {
      totalRequests: 0,
      compressedRequests: 0,
      totalOriginalSize: 0,
      totalCompressedSize: 0,
      compressionsByAlgorithm: {
        br: 0,
        gzip: 0,
        deflate: 0
      },
      averageCompressionRatio: 0
    };
  }
}