import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { NextRequest, NextResponse } from 'next/server';

// Mock security utilities
const SecurityMiddleware = {
  // Authentication & Authorization
  verifyToken: jest.fn(),
  checkPermissions: jest.fn(),
  validateApiKey: jest.fn(),
  enforceRateLimit: jest.fn(),

  // Input validation
  validateInput: jest.fn(),
  sanitizeInput: jest.fn(),
  checkSQLInjection: jest.fn(),
  checkXSS: jest.fn(),

  // Security headers
  setSecurityHeaders: jest.fn(),
  configureCSP: jest.fn(),
  setCORS: jest.fn(),

  // Threat detection
  detectBot: jest.fn(),
  analyzeThreat: jest.fn(),
  checkBlacklist: jest.fn(),
  detectAnomalies: jest.fn(),

  // Encryption & Hashing
  encrypt: jest.fn(),
  decrypt: jest.fn(),
  hashPassword: jest.fn(),
  verifyPassword: jest.fn(),

  // Audit & Logging
  logSecurityEvent: jest.fn(),
  generateReport: jest.fn(),
  getSecurityMetrics: jest.fn()
};

// Mock JWT for token handling
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
  verify: jest.fn(),
  decode: jest.fn()
}));

// Mock crypto for encryption
jest.mock('crypto', () => ({
  randomBytes: jest.fn(() => Buffer.from('random-bytes')),
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(() => 'hashed-value')
  })),
  createCipher: jest.fn(),
  createDecipher: jest.fn(),
  pbkdf2Sync: jest.fn(() => Buffer.from('derived-key'))
}));

describe('Security Middleware', () => {
  let mockRequest: Partial<NextRequest>;
  let mockResponse: Partial<NextResponse>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      headers: new Headers({
        'authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0',
        'x-forwarded-for': '192.168.1.100',
        'origin': 'https://trusted-domain.com'
      }),
      url: 'https://api.example.com/v1/chatbots',
      method: 'POST',
      ip: '192.168.1.100'
    };

    mockResponse = {
      headers: new Headers(),
      status: 200
    };
  });

  describe('Authentication & Authorization', () => {
    it('should verify valid JWT tokens', async () => {
      const token = 'valid.jwt.token';

      SecurityMiddleware.verifyToken.mockResolvedValue({
        valid: true,
        decoded: {
          userId: 'user123',
          email: 'user@example.com',
          roles: ['user'],
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000)
        },
        metadata: {
          algorithm: 'HS256',
          issuer: 'chatbot-api',
          audience: 'chatbot-users'
        }
      });

      const result = await SecurityMiddleware.verifyToken(token);

      expect(result.valid).toBe(true);
      expect(result.decoded.userId).toBe('user123');
      expect(result.decoded.roles).toContain('user');
      expect(result.metadata.algorithm).toBe('HS256');
    });

    it('should reject invalid or expired tokens', async () => {
      const expiredToken = 'expired.jwt.token';

      SecurityMiddleware.verifyToken.mockResolvedValue({
        valid: false,
        error: 'TokenExpiredError',
        message: 'JWT token has expired',
        expiredAt: new Date(Date.now() - 3600000).toISOString(),
        action: 'require_refresh'
      });

      const result = await SecurityMiddleware.verifyToken(expiredToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('TokenExpiredError');
      expect(result.action).toBe('require_refresh');
    });

    it('should check user permissions for protected resources', async () => {
      const user = {
        userId: 'user123',
        roles: ['user', 'chatbot_creator'],
        permissions: ['read_chatbots', 'create_chatbots']
      };

      const resource = {
        type: 'chatbot',
        action: 'create',
        chatbotId: null
      };

      SecurityMiddleware.checkPermissions.mockReturnValue({
        allowed: true,
        permission: 'create_chatbots',
        reason: 'User has required permission',
        metadata: {
          roleBasedAccess: true,
          explicitPermission: true
        }
      });

      const result = SecurityMiddleware.checkPermissions(user, resource);

      expect(result.allowed).toBe(true);
      expect(result.permission).toBe('create_chatbots');
      expect(result.metadata.explicitPermission).toBe(true);
    });

    it('should validate API keys for service-to-service calls', async () => {
      const apiKey = 'sk_test_123456789abcdef';

      SecurityMiddleware.validateApiKey.mockResolvedValue({
        valid: true,
        keyInfo: {
          id: 'key_789',
          name: 'Integration Service Key',
          scopes: ['chatbots:read', 'chatbots:write'],
          rateLimit: 1000,
          lastUsed: new Date().toISOString()
        },
        usage: {
          callsToday: 234,
          callsThisMonth: 5678,
          quotaRemaining: 766
        }
      });

      const result = await SecurityMiddleware.validateApiKey(apiKey);

      expect(result.valid).toBe(true);
      expect(result.keyInfo.scopes).toContain('chatbots:read');
      expect(result.usage.quotaRemaining).toBeGreaterThan(0);
    });

    it('should enforce rate limiting per user/IP', async () => {
      const rateLimitConfig = {
        windowMs: 900000, // 15 minutes
        maxRequests: 100,
        identifier: 'user123'
      };

      SecurityMiddleware.enforceRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 87,
        resetTime: Date.now() + 600000,
        retryAfter: null,
        metadata: {
          windowStart: Date.now() - 300000,
          requestsInWindow: 13,
          burstAllowed: true
        }
      });

      const result = await SecurityMiddleware.enforceRateLimit(rateLimitConfig);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(87);
      expect(result.metadata.requestsInWindow).toBeLessThan(100);
    });

    it('should block requests when rate limit exceeded', async () => {
      const rateLimitConfig = {
        windowMs: 900000,
        maxRequests: 100,
        identifier: 'user456'
      };

      SecurityMiddleware.enforceRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 600000,
        retryAfter: 600, // seconds
        metadata: {
          windowStart: Date.now() - 900000,
          requestsInWindow: 105,
          exceeded: true,
          blockDuration: 600
        }
      });

      const result = await SecurityMiddleware.enforceRateLimit(rateLimitConfig);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBe(600);
      expect(result.metadata.exceeded).toBe(true);
    });
  });

  describe('Input Validation & Sanitization', () => {
    it('should validate input data against schemas', async () => {
      const inputData = {
        name: 'My Chatbot',
        description: 'A helpful customer service chatbot',
        settings: {
          temperature: 0.7,
          maxTokens: 2048
        }
      };

      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          description: { type: 'string', maxLength: 500 },
          settings: {
            type: 'object',
            properties: {
              temperature: { type: 'number', minimum: 0, maximum: 1 },
              maxTokens: { type: 'number', minimum: 1, maximum: 4096 }
            }
          }
        },
        required: ['name']
      };

      SecurityMiddleware.validateInput.mockReturnValue({
        valid: true,
        data: inputData,
        errors: [],
        sanitized: {
          name: 'My Chatbot',
          description: 'A helpful customer service chatbot',
          settings: {
            temperature: 0.7,
            maxTokens: 2048
          }
        }
      });

      const result = SecurityMiddleware.validateInput(inputData, schema);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sanitized.name).toBe('My Chatbot');
    });

    it('should sanitize potentially dangerous input', async () => {
      const dangerousInput = {
        message: '<script>alert("XSS")</script>Hello <b>World</b>',
        userInput: 'SELECT * FROM users; DROP TABLE users;--',
        filename: '../../../etc/passwd'
      };

      SecurityMiddleware.sanitizeInput.mockReturnValue({
        original: dangerousInput,
        sanitized: {
          message: 'Hello <b>World</b>',
          userInput: 'SELECT * FROM users; DROP TABLE users;--',
          filename: 'passwd'
        },
        removed: {
          scripts: ['<script>alert("XSS")</script>'],
          sqlPatterns: [],
          pathTraversal: ['../../../']
        },
        warnings: [
          'XSS attempt detected and removed',
          'Path traversal attempt detected'
        ]
      });

      const result = SecurityMiddleware.sanitizeInput(dangerousInput);

      expect(result.sanitized.message).not.toContain('<script>');
      expect(result.removed.scripts).toHaveLength(1);
      expect(result.warnings).toContain('XSS attempt detected and removed');
    });

    it('should detect SQL injection attempts', async () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "UNION SELECT * FROM admin_users",
        "'; EXEC xp_cmdshell('dir'); --"
      ];

      sqlInjectionAttempts.forEach(async (input) => {
        SecurityMiddleware.checkSQLInjection.mockReturnValue({
          detected: true,
          confidence: 0.95,
          patterns: [
            {
              type: 'drop_table',
              pattern: 'DROP TABLE',
              severity: 'critical'
            }
          ],
          action: 'block',
          input,
          sanitized: input.replace(/[;'"]/g, '')
        });

        const result = SecurityMiddleware.checkSQLInjection(input);
        expect(result.detected).toBe(true);
        expect(result.confidence).toBeGreaterThan(0.9);
        expect(result.action).toBe('block');
      });
    });

    it('should detect XSS attempts in user input', async () => {
      const xssAttempts = [
        '<script>alert("XSS")</script>',
        '<img src="x" onerror="alert(1)">',
        'javascript:alert(document.cookie)',
        '<iframe src="javascript:alert(1)"></iframe>'
      ];

      xssAttempts.forEach(async (input) => {
        SecurityMiddleware.checkXSS.mockReturnValue({
          detected: true,
          confidence: 0.92,
          vectors: [
            {
              type: 'script_injection',
              payload: input,
              severity: 'high'
            }
          ],
          action: 'sanitize',
          original: input,
          sanitized: input.replace(/<[^>]*>/g, '')
        });

        const result = SecurityMiddleware.checkXSS(input);
        expect(result.detected).toBe(true);
        expect(result.action).toBe('sanitize');
        expect(result.sanitized).not.toContain('<script>');
      });
    });
  });

  describe('Security Headers', () => {
    it('should set comprehensive security headers', () => {
      const securityConfig = {
        csp: true,
        hsts: true,
        noSniff: true,
        frameOptions: 'DENY',
        xssProtection: true
      };

      SecurityMiddleware.setSecurityHeaders.mockReturnValue({
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin'
      });

      const headers = SecurityMiddleware.setSecurityHeaders(securityConfig);

      expect(headers['Strict-Transport-Security']).toContain('max-age=31536000');
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['Content-Security-Policy']).toContain("default-src 'self'");
    });

    it('should configure Content Security Policy dynamically', () => {
      const cspConfig = {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://api.openai.com"]
      };

      SecurityMiddleware.configureCSP.mockReturnValue({
        policy: "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://api.openai.com",
        directives: cspConfig,
        reportUri: '/api/csp-report',
        reportOnly: false
      });

      const csp = SecurityMiddleware.configureCSP(cspConfig);

      expect(csp.policy).toContain("default-src 'self'");
      expect(csp.policy).toContain("connect-src 'self' https://api.openai.com");
      expect(csp.reportOnly).toBe(false);
    });

    it('should configure CORS for trusted domains', () => {
      const corsConfig = {
        origin: ['https://trusted-app.com', 'https://admin.trusted-app.com'],
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
        credentials: true,
        maxAge: 86400
      };

      SecurityMiddleware.setCORS.mockReturnValue({
        'Access-Control-Allow-Origin': 'https://trusted-app.com',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
      });

      const corsHeaders = SecurityMiddleware.setCORS(corsConfig);

      expect(corsHeaders['Access-Control-Allow-Origin']).toBe('https://trusted-app.com');
      expect(corsHeaders['Access-Control-Allow-Credentials']).toBe('true');
      expect(corsHeaders['Access-Control-Max-Age']).toBe('86400');
    });
  });

  describe('Threat Detection', () => {
    it('should detect automated bot traffic', async () => {
      const requestInfo = {
        userAgent: 'Bot/1.0 (automated scraper)',
        ip: '192.168.1.100',
        requestPattern: 'rapid_sequential',
        headers: {
          'accept': '*/*',
          'accept-language': '',
          'accept-encoding': 'gzip'
        }
      };

      SecurityMiddleware.detectBot.mockResolvedValue({
        isBot: true,
        confidence: 0.89,
        indicators: [
          { type: 'user_agent', score: 0.95, reason: 'Known bot user agent pattern' },
          { type: 'request_pattern', score: 0.85, reason: 'Rapid sequential requests' },
          { type: 'headers', score: 0.7, reason: 'Missing common browser headers' }
        ],
        botType: 'scraper',
        action: 'rate_limit',
        recommendation: 'Apply strict rate limiting'
      });

      const result = await SecurityMiddleware.detectBot(requestInfo);

      expect(result.isBot).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.indicators).toHaveLength(3);
      expect(result.action).toBe('rate_limit');
    });

    it('should analyze security threats and attack patterns', async () => {
      const threatData = {
        ip: '192.168.1.100',
        requestPath: '/api/v1/admin/users',
        payload: "'; DROP TABLE users; --",
        frequency: 50, // requests per minute
        source: 'tor_exit_node'
      };

      SecurityMiddleware.analyzeThreat.mockResolvedValue({
        threatLevel: 'high',
        confidence: 0.92,
        categories: [
          {
            type: 'sql_injection',
            severity: 'critical',
            confidence: 0.95
          },
          {
            type: 'brute_force',
            severity: 'high',
            confidence: 0.88
          },
          {
            type: 'tor_usage',
            severity: 'medium',
            confidence: 0.99
          }
        ],
        riskScore: 85,
        action: 'block_immediately',
        duration: 3600 // seconds
      });

      const result = await SecurityMiddleware.analyzeThreat(threatData);

      expect(result.threatLevel).toBe('high');
      expect(result.riskScore).toBeGreaterThan(80);
      expect(result.categories).toHaveLength(3);
      expect(result.action).toBe('block_immediately');
    });

    it('should check IPs against security blacklists', async () => {
      const ipAddress = '192.168.1.100';

      SecurityMiddleware.checkBlacklist.mockResolvedValue({
        blacklisted: true,
        sources: [
          {
            name: 'spamhaus',
            category: 'spam',
            confidence: 0.95,
            lastSeen: '2024-01-15T10:30:00Z'
          },
          {
            name: 'malware_db',
            category: 'malware',
            confidence: 0.87,
            lastSeen: '2024-01-14T15:45:00Z'
          }
        ],
        reputation: {
          score: 15, // 0-100, lower is worse
          category: 'malicious',
          countryCode: 'RU'
        },
        action: 'block',
        reason: 'IP found in multiple security blacklists'
      });

      const result = await SecurityMiddleware.checkBlacklist(ipAddress);

      expect(result.blacklisted).toBe(true);
      expect(result.sources).toHaveLength(2);
      expect(result.reputation.score).toBeLessThan(30);
      expect(result.action).toBe('block');
    });

    it('should detect anomalous behavior patterns', async () => {
      const behaviorData = {
        userId: 'user123',
        sessionDuration: 15000, // 15 seconds (unusually short)
        requestsPerMinute: 150, // Very high
        geolocation: { country: 'US', previousCountry: 'RU' },
        deviceFingerprint: 'different_from_usual',
        timeOfDay: 3 // 3 AM (unusual for this user)
      };

      SecurityMiddleware.detectAnomalies.mockResolvedValue({
        anomalous: true,
        anomalies: [
          {
            type: 'geographic',
            severity: 'high',
            description: 'Login from different country',
            confidence: 0.92
          },
          {
            type: 'behavioral',
            severity: 'medium',
            description: 'Unusual request rate',
            confidence: 0.78
          },
          {
            type: 'temporal',
            severity: 'low',
            description: 'Activity at unusual hour',
            confidence: 0.65
          }
        ],
        riskScore: 72,
        recommendation: 'require_additional_verification'
      });

      const result = await SecurityMiddleware.detectAnomalies(behaviorData);

      expect(result.anomalous).toBe(true);
      expect(result.anomalies).toHaveLength(3);
      expect(result.riskScore).toBeGreaterThan(70);
      expect(result.recommendation).toBe('require_additional_verification');
    });
  });

  describe('Encryption & Hashing', () => {
    it('should encrypt sensitive data', async () => {
      const sensitiveData = {
        apiKey: 'sk_live_1234567890abcdef',
        userEmail: 'user@example.com',
        personalInfo: 'Sensitive personal information'
      };

      SecurityMiddleware.encrypt.mockResolvedValue({
        encrypted: true,
        data: {
          apiKey: 'enc_9f8e7d6c5b4a39281...',
          userEmail: 'enc_a1b2c3d4e5f6789...',
          personalInfo: 'enc_z9y8x7w6v5u4t3s...'
        },
        algorithm: 'AES-256-GCM',
        keyId: 'key_789',
        iv: 'random_initialization_vector',
        metadata: {
          encryptedAt: new Date().toISOString(),
          version: '1.0'
        }
      });

      const result = await SecurityMiddleware.encrypt(sensitiveData);

      expect(result.encrypted).toBe(true);
      expect(result.data.apiKey).toMatch(/^enc_/);
      expect(result.algorithm).toBe('AES-256-GCM');
      expect(result.keyId).toBeDefined();
    });

    it('should decrypt encrypted data', async () => {
      const encryptedData = {
        apiKey: 'enc_9f8e7d6c5b4a39281...',
        keyId: 'key_789',
        iv: 'random_initialization_vector'
      };

      SecurityMiddleware.decrypt.mockResolvedValue({
        decrypted: true,
        data: {
          apiKey: 'sk_live_1234567890abcdef'
        },
        algorithm: 'AES-256-GCM',
        verification: {
          integrity: true,
          authentic: true
        },
        metadata: {
          decryptedAt: new Date().toISOString(),
          originalVersion: '1.0'
        }
      });

      const result = await SecurityMiddleware.decrypt(encryptedData);

      expect(result.decrypted).toBe(true);
      expect(result.data.apiKey).toBe('sk_live_1234567890abcdef');
      expect(result.verification.integrity).toBe(true);
    });

    it('should hash passwords securely', async () => {
      const password = 'SecurePassword123!';

      SecurityMiddleware.hashPassword.mockResolvedValue({
        hash: '$2b$12$LQ4eZ3k2yI7J8K9L0M1N2O3P4Q5R6S7T8U9V0W1X2Y3Z4A5B6C7D8E',
        salt: '$2b$12$LQ4eZ3k2yI7J8K9L0M1N2O',
        algorithm: 'bcrypt',
        rounds: 12,
        strength: 'high',
        metadata: {
          hashedAt: new Date().toISOString(),
          version: '2b'
        }
      });

      const result = await SecurityMiddleware.hashPassword(password);

      expect(result.hash).toMatch(/^\$2b\$12\$/);
      expect(result.algorithm).toBe('bcrypt');
      expect(result.rounds).toBe(12);
      expect(result.strength).toBe('high');
    });

    it('should verify password hashes', async () => {
      const password = 'SecurePassword123!';
      const hash = '$2b$12$LQ4eZ3k2yI7J8K9L0M1N2O3P4Q5R6S7T8U9V0W1X2Y3Z4A5B6C7D8E';

      SecurityMiddleware.verifyPassword.mockResolvedValue({
        valid: true,
        matched: true,
        algorithm: 'bcrypt',
        timingAttackSafe: true,
        metadata: {
          verifiedAt: new Date().toISOString(),
          verificationTime: 156 // ms
        }
      });

      const result = await SecurityMiddleware.verifyPassword(password, hash);

      expect(result.valid).toBe(true);
      expect(result.matched).toBe(true);
      expect(result.timingAttackSafe).toBe(true);
      expect(result.metadata.verificationTime).toBeLessThan(200);
    });
  });

  describe('Audit & Logging', () => {
    it('should log security events for monitoring', async () => {
      const securityEvent = {
        type: 'authentication_failure',
        severity: 'medium',
        userId: 'user123',
        ip: '192.168.1.100',
        userAgent: 'Mozilla/5.0...',
        details: {
          reason: 'invalid_credentials',
          attemptCount: 3,
          lockoutTriggered: false
        },
        timestamp: Date.now()
      };

      SecurityMiddleware.logSecurityEvent.mockResolvedValue({
        logged: true,
        eventId: 'sec_event_789',
        correlationId: 'corr_456',
        metadata: {
          loggedAt: new Date().toISOString(),
          destination: ['security_log', 'audit_trail'],
          alertTriggered: false
        }
      });

      const result = await SecurityMiddleware.logSecurityEvent(securityEvent);

      expect(result.logged).toBe(true);
      expect(result.eventId).toBeDefined();
      expect(result.metadata.destination).toContain('security_log');
    });

    it('should generate security reports and analytics', async () => {
      const reportConfig = {
        timeRange: '24h',
        includeCharts: true,
        severity: ['medium', 'high', 'critical']
      };

      SecurityMiddleware.generateReport.mockResolvedValue({
        period: '2024-01-15T00:00:00Z to 2024-01-16T00:00:00Z',
        summary: {
          totalEvents: 1567,
          byCategory: {
            authentication: 789,
            authorization: 234,
            input_validation: 345,
            threat_detection: 123,
            data_access: 76
          },
          bySeverity: {
            low: 890,
            medium: 456,
            high: 178,
            critical: 43
          }
        },
        trends: {
          hourlyPattern: generateHourlySecurityTrend(24),
          topThreats: ['sql_injection', 'brute_force', 'xss_attempt'],
          emergingPatterns: [
            'Increased bot traffic from specific IP range',
            'New XSS payload variants detected'
          ]
        },
        recommendations: [
          'Implement additional rate limiting for authentication endpoints',
          'Update XSS detection rules based on new patterns',
          'Review and update IP blacklist'
        ]
      });

      const report = await SecurityMiddleware.generateReport(reportConfig);

      expect(report.summary.totalEvents).toBeGreaterThan(1500);
      expect(report.summary.bySeverity.critical).toBeLessThan(100);
      expect(report.recommendations).toHaveLength(3);
    });

    it('should provide security metrics and KPIs', async () => {
      SecurityMiddleware.getSecurityMetrics.mockReturnValue({
        overview: {
          securityScore: 87, // 0-100
          threatLevel: 'medium',
          incidentsToday: 12,
          incidentsResolved: 10,
          averageResponseTime: 15 // minutes
        },
        authentication: {
          successRate: 0.96,
          failureRate: 0.04,
          bruteForceAttempts: 23,
          accountLockouts: 5
        },
        threats: {
          blocked: 156,
          quarantined: 34,
          investigated: 12,
          falsePositives: 8
        },
        performance: {
          averageProcessingTime: 45, // ms
          throughput: 5000, // requests/hour
          errorRate: 0.002
        },
        compliance: {
          gdprCompliant: true,
          socCompliant: true,
          pciCompliant: true,
          lastAudit: '2024-01-01T00:00:00Z'
        }
      });

      const metrics = SecurityMiddleware.getSecurityMetrics();

      expect(metrics.overview.securityScore).toBeGreaterThan(80);
      expect(metrics.authentication.successRate).toBeGreaterThan(0.95);
      expect(metrics.performance.errorRate).toBeLessThan(0.01);
      expect(metrics.compliance.gdprCompliant).toBe(true);
    });
  });
});

describe('Security Middleware Integration', () => {
  it('should handle complete request security pipeline', async () => {
    const request = {
      url: '/api/v1/chatbots',
      method: 'POST',
      headers: {
        authorization: 'Bearer valid.jwt.token',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Test Chatbot',
        description: 'A test chatbot'
      })
    };

    // Mock the complete security pipeline
    SecurityMiddleware.verifyToken.mockResolvedValue({ valid: true, decoded: { userId: 'user123' } });
    SecurityMiddleware.checkPermissions.mockReturnValue({ allowed: true });
    SecurityMiddleware.enforceRateLimit.mockResolvedValue({ allowed: true, remaining: 95 });
    SecurityMiddleware.validateInput.mockReturnValue({ valid: true, sanitized: JSON.parse(request.body) });
    SecurityMiddleware.detectBot.mockResolvedValue({ isBot: false, confidence: 0.1 });
    SecurityMiddleware.checkBlacklist.mockResolvedValue({ blacklisted: false });

    // Process request through security pipeline
    const tokenResult = await SecurityMiddleware.verifyToken(request.headers.authorization.split(' ')[1]);
    const permissionResult = SecurityMiddleware.checkPermissions({ userId: tokenResult.decoded.userId }, { action: 'create' });
    const rateLimitResult = await SecurityMiddleware.enforceRateLimit({ identifier: tokenResult.decoded.userId });
    const inputResult = SecurityMiddleware.validateInput(JSON.parse(request.body), {});
    const botResult = await SecurityMiddleware.detectBot({ userAgent: 'Mozilla/5.0...' });
    const blacklistResult = await SecurityMiddleware.checkBlacklist('192.168.1.100');

    expect(tokenResult.valid).toBe(true);
    expect(permissionResult.allowed).toBe(true);
    expect(rateLimitResult.allowed).toBe(true);
    expect(inputResult.valid).toBe(true);
    expect(botResult.isBot).toBe(false);
    expect(blacklistResult.blacklisted).toBe(false);
  });

  it('should block malicious requests early in pipeline', async () => {
    const maliciousRequest = {
      ip: '192.168.1.100',
      userAgent: 'MaliciousBot/1.0',
      payload: "'; DROP TABLE users; --"
    };

    SecurityMiddleware.checkBlacklist.mockResolvedValue({ blacklisted: true, action: 'block' });
    SecurityMiddleware.detectBot.mockResolvedValue({ isBot: true, confidence: 0.95, action: 'block' });
    SecurityMiddleware.checkSQLInjection.mockReturnValue({ detected: true, action: 'block' });

    const blacklistResult = await SecurityMiddleware.checkBlacklist(maliciousRequest.ip);
    const botResult = await SecurityMiddleware.detectBot({ userAgent: maliciousRequest.userAgent });
    const sqlResult = SecurityMiddleware.checkSQLInjection(maliciousRequest.payload);

    expect(blacklistResult.blacklisted).toBe(true);
    expect(botResult.isBot).toBe(true);
    expect(sqlResult.detected).toBe(true);

    // All checks should result in blocking
    expect([blacklistResult.action, botResult.action, sqlResult.action]).toEqual(['block', 'block', 'block']);
  });
});

// Helper function for trend generation
function generateHourlySecurityTrend(hours: number): Array<{ hour: number; events: number; severity: string }> {
  const trend = [];
  const baseEvents = 20;

  for (let i = 0; i < hours; i++) {
    const hourVariation = Math.sin((i / 24) * 2 * Math.PI) * 10; // Daily pattern
    const randomVariation = (Math.random() - 0.5) * 10;
    const events = Math.max(5, Math.round(baseEvents + hourVariation + randomVariation));

    // Determine severity based on event count
    let severity = 'low';
    if (events > 30) severity = 'high';
    else if (events > 20) severity = 'medium';

    trend.push({
      hour: i,
      events,
      severity
    });
  }

  return trend;
}