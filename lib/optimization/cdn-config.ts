import { NextRequest, NextResponse } from 'next/server';

export interface CDNConfig {
  enabled?: boolean;
  provider?: 'cloudfront' | 'cloudflare' | 'custom';
  domain?: string;
  staticPaths?: string[];
  imagePaths?: string[];
  cacheBehaviors?: {
    static?: number; // TTL in seconds
    images?: number;
    api?: number;
    html?: number;
  };
  compression?: boolean;
  minification?: boolean;
  imageOptimization?: boolean;
}

export interface AssetOptimizationConfig {
  images?: {
    formats?: ('webp' | 'avif' | 'jpeg' | 'png')[];
    quality?: number;
    sizes?: number[];
    placeholder?: 'blur' | 'empty';
  };
  fonts?: {
    preload?: string[];
    display?: 'swap' | 'block' | 'fallback' | 'optional';
  };
  css?: {
    minify?: boolean;
    inline?: boolean;
    critical?: boolean;
  };
  js?: {
    minify?: boolean;
    compress?: boolean;
    splitChunks?: boolean;
  };
}

/**
 * CDN optimization middleware
 */
export function withCDNOptimization(config: CDNConfig = {}) {
  const {
    enabled = true,
    staticPaths = ['/static', '/images', '/fonts', '/icons'],
    cacheBehaviors = {
      static: 31536000, // 1 year
      images: 7776000,  // 90 days
      api: 300,         // 5 minutes
      html: 3600        // 1 hour
    }
  } = config;

  return function (handler: Function) {
    return async function cdnMiddleware(
      request: NextRequest,
      context?: any
    ): Promise<NextResponse> {
      const response = await handler(request, context);

      if (!enabled || !response) {
        return response;
      }

      const pathname = request.nextUrl.pathname;

      // Determine asset type and set appropriate cache headers
      if (isStaticAsset(pathname, staticPaths)) {
        setCDNHeaders(response, cacheBehaviors.static!);
      } else if (isImageAsset(pathname)) {
        setCDNHeaders(response, cacheBehaviors.images!);
      } else if (isAPIRequest(pathname)) {
        setCDNHeaders(response, cacheBehaviors.api!);
      } else {
        setCDNHeaders(response, cacheBehaviors.html!);
      }

      // Add CDN-specific headers
      if (config.domain) {
        response.headers.set('x-cdn-domain', config.domain);
      }

      // Add performance hints
      addPerformanceHints(response, pathname);

      return response;
    };
  };
}

/**
 * Next.js Image optimization configuration
 */
export const imageOptimizationConfig = {
  domains: [
    'images.unsplash.com',
    'cdn.example.com',
    // Add your CDN domains here
  ],
  formats: ['image/webp', 'image/avif'],
  imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  minimumCacheTTL: 86400, // 24 hours
  dangerouslyAllowSVG: false,
  contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
};

/**
 * Font optimization configuration
 */
export const fontOptimizationConfig = {
  preload: [
    '/fonts/inter-var.woff2',
    '/fonts/geist-sans.woff2',
    '/fonts/geist-mono.woff2'
  ],
  display: 'swap' as const,
  fallback: {
    'Inter': ['system-ui', 'sans-serif'],
    'Geist Sans': ['system-ui', 'sans-serif'],
    'Geist Mono': ['Monaco', 'monospace']
  }
};

/**
 * Static asset optimization utilities
 */
export class StaticAssetOptimizer {
  /**
   * Generate optimized asset URLs
   */
  static getOptimizedAssetUrl(
    path: string,
    config: CDNConfig = {}
  ): string {
    if (!config.enabled || !config.domain) {
      return path;
    }

    // Handle absolute URLs
    if (path.startsWith('http')) {
      return path;
    }

    // Ensure path starts with /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    return `${config.domain}${normalizedPath}`;
  }

  /**
   * Generate responsive image sources
   */
  static generateImageSources(
    src: string,
    sizes: number[],
    config: CDNConfig = {}
  ): { src: string; srcSet: string; sizes: string } {
    const baseSrc = this.getOptimizedAssetUrl(src, config);

    const srcSet = sizes
      .map(size => `${baseSrc}?w=${size}&q=75 ${size}w`)
      .join(', ');

    const sizesAttr = sizes
      .map((size, index) => {
        if (index === sizes.length - 1) return `${size}px`;
        return `(max-width: ${size}px) ${size}px`;
      })
      .join(', ');

    return {
      src: `${baseSrc}?w=${sizes[sizes.length - 1]}&q=75`,
      srcSet,
      sizes: sizesAttr
    };
  }

  /**
   * Preload critical assets
   */
  static generatePreloadLinks(assets: {
    href: string;
    as: 'font' | 'image' | 'style' | 'script';
    type?: string;
    crossorigin?: boolean;
  }[]): string[] {
    return assets.map(asset => {
      const attributes = [
        `rel="preload"`,
        `href="${asset.href}"`,
        `as="${asset.as}"`
      ];

      if (asset.type) {
        attributes.push(`type="${asset.type}"`);
      }

      if (asset.crossorigin) {
        attributes.push('crossorigin');
      }

      return `<link ${attributes.join(' ')}>`;
    });
  }
}

/**
 * Performance optimization for static assets
 */
export class PerformanceOptimizer {
  private static readonly CRITICAL_RESOURCES = [
    '/fonts/inter-var.woff2',
    '/css/critical.css',
    '/js/core.js'
  ];

  /**
   * Generate resource hints for better loading performance
   */
  static generateResourceHints(): {
    preload: string[];
    prefetch: string[];
    preconnect: string[];
  } {
    return {
      preload: this.CRITICAL_RESOURCES,
      prefetch: [
        '/css/non-critical.css',
        '/js/analytics.js'
      ],
      preconnect: [
        'https://fonts.googleapis.com',
        'https://cdn.example.com'
      ]
    };
  }

  /**
   * Calculate and set performance budgets
   */
  static getPerformanceBudgets() {
    return {
      // File size budgets (in KB)
      maxBundleSize: 250,      // Total JS bundle
      maxCSSSize: 50,          // Total CSS
      maxImageSize: 100,       // Individual images
      maxFontSize: 30,         // Individual fonts

      // Performance metrics budgets
      maxFCP: 1500,            // First Contentful Paint (ms)
      maxLCP: 2500,            // Largest Contentful Paint (ms)
      maxFID: 100,             // First Input Delay (ms)
      maxCLS: 0.1,             // Cumulative Layout Shift
      maxTTI: 3000,            // Time to Interactive (ms)
    };
  }

  /**
   * Generate Service Worker caching strategy
   */
  static generateCachingStrategy() {
    return {
      static: {
        strategy: 'CacheFirst',
        maxAge: 365 * 24 * 60 * 60, // 1 year
        maxEntries: 100
      },
      images: {
        strategy: 'CacheFirst',
        maxAge: 90 * 24 * 60 * 60, // 90 days
        maxEntries: 50
      },
      api: {
        strategy: 'NetworkFirst',
        maxAge: 5 * 60, // 5 minutes
        maxEntries: 20
      },
      html: {
        strategy: 'StaleWhileRevalidate',
        maxAge: 24 * 60 * 60, // 24 hours
        maxEntries: 10
      }
    };
  }
}

// Helper functions

function isStaticAsset(pathname: string, staticPaths: string[]): boolean {
  return staticPaths.some(path => pathname.startsWith(path)) ||
         pathname.match(/\.(css|js|ico|woff2?|ttf|eot)$/);
}

function isImageAsset(pathname: string): boolean {
  return pathname.match(/\.(jpg|jpeg|png|gif|webp|avif|svg)$/);
}

function isAPIRequest(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

function setCDNHeaders(response: NextResponse, maxAge: number): void {
  const cacheControl = [
    'public',
    `max-age=${maxAge}`,
    `s-maxage=${maxAge}`,
    'stale-while-revalidate=86400' // 24 hours
  ].join(', ');

  response.headers.set('cache-control', cacheControl);
  response.headers.set('x-cache-status', 'CDN');

  // Add CORS headers for cross-origin requests
  response.headers.set('access-control-allow-origin', '*');
  response.headers.set('access-control-allow-methods', 'GET, HEAD, OPTIONS');
}

function addPerformanceHints(response: NextResponse, pathname: string): void {
  // Add timing headers for monitoring
  response.headers.set('server-timing', `edge;dur=0`);

  // Add security headers for static assets
  if (isStaticAsset(pathname, ['/static', '/images', '/fonts', '/icons'])) {
    response.headers.set('x-content-type-options', 'nosniff');
    response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  }
}

/**
 * Predefined CDN configurations
 */
export const cdnConfigs = {
  // CloudFront configuration
  cloudfront: {
    enabled: true,
    provider: 'cloudfront' as const,
    cacheBehaviors: {
      static: 31536000,    // 1 year
      images: 7776000,     // 90 days
      api: 300,            // 5 minutes
      html: 3600           // 1 hour
    },
    compression: true,
    imageOptimization: true
  },

  // Cloudflare configuration
  cloudflare: {
    enabled: true,
    provider: 'cloudflare' as const,
    cacheBehaviors: {
      static: 31536000,    // 1 year
      images: 2592000,     // 30 days
      api: 300,            // 5 minutes
      html: 1800           // 30 minutes
    },
    compression: true,
    imageOptimization: true
  },

  // Development configuration (no CDN)
  development: {
    enabled: false,
    cacheBehaviors: {
      static: 0,
      images: 0,
      api: 0,
      html: 0
    }
  }
};

/**
 * Convenience functions for common CDN setups
 */
export const withCloudFrontOptimization = () => withCDNOptimization(cdnConfigs.cloudfront);
export const withCloudflareOptimization = () => withCDNOptimization(cdnConfigs.cloudflare);
export const withDevelopmentOptimization = () => withCDNOptimization(cdnConfigs.development);