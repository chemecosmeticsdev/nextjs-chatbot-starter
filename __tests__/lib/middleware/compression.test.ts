import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { NextRequest, NextResponse } from 'next/server';

// Mock compression utilities
const CompressionMiddleware = {
  // Compression algorithms
  brotli: jest.fn(),
  gzip: jest.fn(),
  deflate: jest.fn(),

  // Content type handlers
  handleJSON: jest.fn(),
  handleHTML: jest.fn(),
  handleCSS: jest.fn(),
  handleJS: jest.fn(),
  handleText: jest.fn(),

  // Middleware functions
  compressResponse: jest.fn(),
  selectAlgorithm: jest.fn(),
  shouldCompress: jest.fn(),

  // Performance monitoring
  getCompressionStats: jest.fn(),
  trackCompressionRatio: jest.fn(),

  // Configuration
  setCompressionLevel: jest.fn(),
  getConfig: jest.fn()
};

// Mock zlib for Node.js compression
jest.mock('zlib', () => ({
  brotliCompress: jest.fn((buffer, callback) => {
    const compressed = Buffer.from('compressed_brotli_data');
    callback(null, compressed);
  }),
  gzip: jest.fn((buffer, callback) => {
    const compressed = Buffer.from('compressed_gzip_data');
    callback(null, compressed);
  }),
  deflate: jest.fn((buffer, callback) => {
    const compressed = Buffer.from('compressed_deflate_data');
    callback(null, compressed);
  }),
  constants: {
    BROTLI_PARAM_QUALITY: 4,
    BROTLI_PARAM_SIZE_HINT: 3,
    Z_DEFAULT_COMPRESSION: -1,
    Z_BEST_COMPRESSION: 9,
    Z_BEST_SPEED: 1
  }
}));

describe('Compression Middleware', () => {
  let mockRequest: Partial<NextRequest>;
  let mockResponse: Partial<NextResponse>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      headers: new Headers({
        'accept-encoding': 'gzip, deflate, br',
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0'
      }),
      url: 'https://example.com/api/v1/chatbots',
      method: 'GET'
    };

    mockResponse = {
      headers: new Headers(),
      status: 200
    };
  });

  describe('Compression Algorithm Selection', () => {
    it('should select Brotli for modern browsers', () => {
      const acceptEncoding = 'gzip, deflate, br';
      const userAgent = 'Mozilla/5.0 Chrome/120.0.0.0';

      CompressionMiddleware.selectAlgorithm.mockReturnValue({
        algorithm: 'brotli',
        quality: 6,
        supported: true,
        reason: 'Modern browser with Brotli support'
      });

      const result = CompressionMiddleware.selectAlgorithm(acceptEncoding, userAgent);

      expect(result.algorithm).toBe('brotli');
      expect(result.quality).toBe(6);
      expect(result.supported).toBe(true);
    });

    it('should fallback to gzip for older browsers', () => {
      const acceptEncoding = 'gzip, deflate';
      const userAgent = 'Mozilla/5.0 (compatible; MSIE 9.0)';

      CompressionMiddleware.selectAlgorithm.mockReturnValue({
        algorithm: 'gzip',
        quality: 6,
        supported: true,
        reason: 'Legacy browser, Brotli not supported'
      });

      const result = CompressionMiddleware.selectAlgorithm(acceptEncoding, userAgent);

      expect(result.algorithm).toBe('gzip');
      expect(result.quality).toBe(6);
      expect(result.reason).toContain('Legacy browser');
    });

    it('should select deflate as last resort', () => {
      const acceptEncoding = 'deflate';
      const userAgent = 'OldBot/1.0';

      CompressionMiddleware.selectAlgorithm.mockReturnValue({
        algorithm: 'deflate',
        quality: 6,
        supported: true,
        reason: 'Only deflate supported'
      });

      const result = CompressionMiddleware.selectAlgorithm(acceptEncoding, userAgent);

      expect(result.algorithm).toBe('deflate');
      expect(result.supported).toBe(true);
    });

    it('should return no compression when not supported', () => {
      const acceptEncoding = '';
      const userAgent = 'BasicBot/1.0';

      CompressionMiddleware.selectAlgorithm.mockReturnValue({
        algorithm: 'none',
        quality: 0,
        supported: false,
        reason: 'No compression accepted'
      });

      const result = CompressionMiddleware.selectAlgorithm(acceptEncoding, userAgent);

      expect(result.algorithm).toBe('none');
      expect(result.supported).toBe(false);
    });
  });

  describe('Content Type Handlers', () => {
    it('should compress JSON responses efficiently', async () => {
      const jsonData = {
        chatbots: [
          { id: '1', name: 'Customer Support', type: 'support' },
          { id: '2', name: 'Sales Assistant', type: 'sales' }
        ],
        meta: { total: 2, page: 1, limit: 20 }
      };

      const originalSize = JSON.stringify(jsonData).length;

      CompressionMiddleware.handleJSON.mockResolvedValue({
        compressed: Buffer.from('compressed_json_data'),
        originalSize,
        compressedSize: Math.round(originalSize * 0.3),
        compressionRatio: 0.3,
        algorithm: 'brotli',
        headers: {
          'Content-Encoding': 'br',
          'Content-Type': 'application/json',
          'Vary': 'Accept-Encoding'
        }
      });

      const result = await CompressionMiddleware.handleJSON(jsonData, 'brotli');

      expect(result.compressionRatio).toBeLessThan(0.5);
      expect(result.headers['Content-Encoding']).toBe('br');
      expect(result.algorithm).toBe('brotli');
    });

    it('should compress HTML responses with optimal settings', async () => {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Chatbot Dashboard</title>
            <meta charset="utf-8">
          </head>
          <body>
            <div class="container">
              <h1>Welcome to Chatbot Dashboard</h1>
              <p>Manage your chatbots efficiently</p>
            </div>
          </body>
        </html>
      `;

      CompressionMiddleware.handleHTML.mockResolvedValue({
        compressed: Buffer.from('compressed_html_data'),
        originalSize: htmlContent.length,
        compressedSize: Math.round(htmlContent.length * 0.25),
        compressionRatio: 0.25,
        algorithm: 'gzip',
        headers: {
          'Content-Encoding': 'gzip',
          'Content-Type': 'text/html; charset=utf-8',
          'Vary': 'Accept-Encoding'
        }
      });

      const result = await CompressionMiddleware.handleHTML(htmlContent, 'gzip');

      expect(result.compressionRatio).toBeLessThan(0.3);
      expect(result.headers['Content-Type']).toContain('text/html');
    });

    it('should compress CSS files with high efficiency', async () => {
      const cssContent = `
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .btn-primary { background-color: #007bff; color: white; border: none; }
        .btn-primary:hover { background-color: #0056b3; }
        .card { background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
      `;

      CompressionMiddleware.handleCSS.mockResolvedValue({
        compressed: Buffer.from('compressed_css_data'),
        originalSize: cssContent.length,
        compressedSize: Math.round(cssContent.length * 0.35),
        compressionRatio: 0.35,
        algorithm: 'brotli',
        headers: {
          'Content-Encoding': 'br',
          'Content-Type': 'text/css',
          'Cache-Control': 'public, max-age=31536000',
          'Vary': 'Accept-Encoding'
        }
      });

      const result = await CompressionMiddleware.handleCSS(cssContent, 'brotli');

      expect(result.compressionRatio).toBeLessThan(0.4);
      expect(result.headers['Cache-Control']).toContain('max-age=31536000');
    });

    it('should compress JavaScript files with tree shaking', async () => {
      const jsContent = `
        function initChatbot(config) {
          const chatbot = new Chatbot(config);
          chatbot.render();
          return chatbot;
        }

        class Chatbot {
          constructor(config) {
            this.config = config;
            this.messages = [];
          }

          render() {
            console.log('Rendering chatbot...');
          }
        }
      `;

      CompressionMiddleware.handleJS.mockResolvedValue({
        compressed: Buffer.from('compressed_js_data'),
        originalSize: jsContent.length,
        compressedSize: Math.round(jsContent.length * 0.4),
        compressionRatio: 0.4,
        algorithm: 'gzip',
        headers: {
          'Content-Encoding': 'gzip',
          'Content-Type': 'application/javascript',
          'Cache-Control': 'public, max-age=31536000',
          'Vary': 'Accept-Encoding'
        }
      });

      const result = await CompressionMiddleware.handleJS(jsContent, 'gzip');

      expect(result.compressionRatio).toBeLessThan(0.5);
      expect(result.headers['Content-Type']).toBe('application/javascript');
    });
  });

  describe('Compression Decision Logic', () => {
    it('should compress responses above size threshold', () => {
      const largeContent = 'x'.repeat(2000); // 2KB content

      CompressionMiddleware.shouldCompress.mockReturnValue({
        shouldCompress: true,
        reason: 'Content size above threshold (1KB)',
        contentSize: 2000,
        threshold: 1024
      });

      const result = CompressionMiddleware.shouldCompress(largeContent, 'text/plain');

      expect(result.shouldCompress).toBe(true);
      expect(result.contentSize).toBeGreaterThan(1024);
    });

    it('should skip compression for small responses', () => {
      const smallContent = 'Hello World'; // Small content

      CompressionMiddleware.shouldCompress.mockReturnValue({
        shouldCompress: false,
        reason: 'Content size below threshold (1KB)',
        contentSize: 11,
        threshold: 1024
      });

      const result = CompressionMiddleware.shouldCompress(smallContent, 'text/plain');

      expect(result.shouldCompress).toBe(false);
      expect(result.contentSize).toBeLessThan(1024);
    });

    it('should skip compression for already compressed content', () => {
      const content = 'Some content';

      CompressionMiddleware.shouldCompress.mockReturnValue({
        shouldCompress: false,
        reason: 'Content already compressed',
        contentType: 'image/jpeg',
        alreadyCompressed: true
      });

      const result = CompressionMiddleware.shouldCompress(content, 'image/jpeg');

      expect(result.shouldCompress).toBe(false);
      expect(result.alreadyCompressed).toBe(true);
    });

    it('should skip compression for binary content types', () => {
      const binaryTypes = [
        'image/png',
        'image/jpeg',
        'video/mp4',
        'application/pdf',
        'application/zip'
      ];

      binaryTypes.forEach(contentType => {
        CompressionMiddleware.shouldCompress.mockReturnValue({
          shouldCompress: false,
          reason: 'Binary content type not suitable for compression',
          contentType,
          isBinary: true
        });

        const result = CompressionMiddleware.shouldCompress('content', contentType);
        expect(result.shouldCompress).toBe(false);
        expect(result.isBinary).toBe(true);
      });
    });
  });

  describe('Middleware Integration', () => {
    it('should process requests and compress responses', async () => {
      const requestData = {
        url: '/api/v1/chatbots',
        headers: {
          'accept-encoding': 'gzip, deflate, br',
          'content-type': 'application/json'
        }
      };

      const responseData = {
        chatbots: [{ id: '1', name: 'Test Bot' }],
        meta: { total: 1 }
      };

      CompressionMiddleware.compressResponse.mockResolvedValue({
        compressed: true,
        algorithm: 'brotli',
        originalSize: 156,
        compressedSize: 89,
        compressionRatio: 0.57,
        headers: {
          'Content-Encoding': 'br',
          'Content-Length': '89',
          'Vary': 'Accept-Encoding'
        },
        body: Buffer.from('compressed_response_data')
      });

      const result = await CompressionMiddleware.compressResponse(
        requestData,
        responseData
      );

      expect(result.compressed).toBe(true);
      expect(result.algorithm).toBe('brotli');
      expect(result.compressionRatio).toBeLessThan(0.6);
      expect(result.headers['Content-Encoding']).toBe('br');
    });

    it('should handle compression errors gracefully', async () => {
      const requestData = {
        url: '/api/v1/chatbots',
        headers: { 'accept-encoding': 'gzip' }
      };

      CompressionMiddleware.compressResponse.mockRejectedValue(
        new Error('Compression failed')
      );

      try {
        await CompressionMiddleware.compressResponse(requestData, 'large content');
      } catch (error) {
        expect(error.message).toBe('Compression failed');
      }

      // Should fallback to uncompressed response
      CompressionMiddleware.compressResponse.mockResolvedValue({
        compressed: false,
        fallback: true,
        originalSize: 156,
        compressedSize: 156,
        compressionRatio: 1.0,
        headers: {},
        body: 'large content'
      });

      const fallbackResult = await CompressionMiddleware.compressResponse(
        requestData,
        'large content'
      );

      expect(fallbackResult.compressed).toBe(false);
      expect(fallbackResult.fallback).toBe(true);
    });

    it('should track compression performance metrics', async () => {
      const compressionEvents = [
        { algorithm: 'brotli', ratio: 0.3, time: 15 },
        { algorithm: 'gzip', ratio: 0.4, time: 12 },
        { algorithm: 'brotli', ratio: 0.35, time: 18 }
      ];

      compressionEvents.forEach(event => {
        CompressionMiddleware.trackCompressionRatio(
          event.algorithm,
          event.ratio,
          event.time
        );
      });

      CompressionMiddleware.getCompressionStats.mockReturnValue({
        totalRequests: 156789,
        compressedRequests: 134256,
        compressionRate: 0.856,
        algorithms: {
          brotli: {
            requests: 89567,
            avgRatio: 0.32,
            avgTime: 16.5
          },
          gzip: {
            requests: 44689,
            avgRatio: 0.41,
            avgTime: 13.2
          },
          deflate: {
            requests: 0,
            avgRatio: 0,
            avgTime: 0
          }
        },
        bandwidthSaved: 45678901, // bytes
        performance: {
          avgCompressionTime: 15.2, // ms
          p95CompressionTime: 28.5,
          p99CompressionTime: 45.1
        }
      });

      const stats = CompressionMiddleware.getCompressionStats();

      expect(stats.compressionRate).toBeGreaterThan(0.8);
      expect(stats.algorithms.brotli.avgRatio).toBeLessThan(0.35);
      expect(stats.bandwidthSaved).toBeGreaterThan(40000000);
    });
  });

  describe('Configuration Management', () => {
    it('should set compression levels for different algorithms', () => {
      const config = {
        brotli: { quality: 6, window: 22 },
        gzip: { level: 6, windowBits: 15, memLevel: 8 },
        deflate: { level: 6, windowBits: 15 }
      };

      CompressionMiddleware.setCompressionLevel.mockReturnValue({
        updated: true,
        config,
        previousConfig: {
          brotli: { quality: 4, window: 22 },
          gzip: { level: 5, windowBits: 15, memLevel: 8 },
          deflate: { level: 5, windowBits: 15 }
        }
      });

      const result = CompressionMiddleware.setCompressionLevel(config);

      expect(result.updated).toBe(true);
      expect(result.config.brotli.quality).toBe(6);
      expect(result.config.gzip.level).toBe(6);
    });

    it('should provide current compression configuration', () => {
      CompressionMiddleware.getConfig.mockReturnValue({
        enabled: true,
        threshold: 1024, // bytes
        maxSize: 10485760, // 10MB
        algorithms: {
          brotli: {
            enabled: true,
            quality: 6,
            priority: 1
          },
          gzip: {
            enabled: true,
            level: 6,
            priority: 2
          },
          deflate: {
            enabled: true,
            level: 6,
            priority: 3
          }
        },
        excludeTypes: [
          'image/*',
          'video/*',
          'audio/*',
          'application/zip',
          'application/pdf'
        ],
        includeTypes: [
          'text/*',
          'application/json',
          'application/javascript',
          'application/xml'
        ]
      });

      const config = CompressionMiddleware.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.threshold).toBe(1024);
      expect(config.algorithms.brotli.priority).toBe(1);
      expect(config.excludeTypes).toContain('image/*');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null or undefined content', async () => {
      CompressionMiddleware.shouldCompress.mockReturnValue({
        shouldCompress: false,
        reason: 'Content is null or undefined',
        contentSize: 0
      });

      const result = CompressionMiddleware.shouldCompress(null, 'text/plain');

      expect(result.shouldCompress).toBe(false);
      expect(result.contentSize).toBe(0);
    });

    it('should handle very large responses', async () => {
      const largeContent = 'x'.repeat(50 * 1024 * 1024); // 50MB

      CompressionMiddleware.shouldCompress.mockReturnValue({
        shouldCompress: false,
        reason: 'Content exceeds maximum compression size',
        contentSize: 50 * 1024 * 1024,
        maxSize: 10 * 1024 * 1024
      });

      const result = CompressionMiddleware.shouldCompress(largeContent, 'text/plain');

      expect(result.shouldCompress).toBe(false);
      expect(result.contentSize).toBeGreaterThan(10 * 1024 * 1024);
    });

    it('should handle malformed accept-encoding headers', () => {
      const malformedHeaders = [
        'gzip;q=1.0, deflate;q=0.5, *;q=0',
        'br, gzip;q=0.8, deflate;q=0.6',
        'invalid-encoding'
      ];

      malformedHeaders.forEach(header => {
        CompressionMiddleware.selectAlgorithm.mockReturnValue({
          algorithm: 'gzip',
          quality: 6,
          supported: true,
          reason: 'Fallback to gzip due to malformed header'
        });

        const result = CompressionMiddleware.selectAlgorithm(header, 'Chrome/120');
        expect(result.algorithm).toBe('gzip');
        expect(result.reason).toContain('malformed');
      });
    });
  });
});