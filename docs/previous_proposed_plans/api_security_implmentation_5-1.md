 Phase 5.1 - API Security Implementation Plan

    Current Security Assessment

    ✅ Existing Implementation:
    - JWT-based authentication with 24h expiry
    - Session cookie management with secure settings
    - AWS Cognito integration for user authentication
    - Basic middleware for route protection
    - Input validation on login endpoints

    ❌ Missing Critical Security:
    - No rate limiting on API endpoints
    - No API key authentication for external access
    - No input sanitization/validation middleware
    - No CORS configuration for widget embedding
    - No centralized security headers
    - No audit logging for security events

    Implementation Tasks

    1. Rate Limiting System (4 hours)

    - Create lib/security/rate-limiter.ts - Redis-based rate limiting service
    - Create lib/middleware/rate-limit.ts - Express-style middleware for API routes
    - Implement different limits: auth endpoints (5/min), API endpoints (100/min), public endpoints (20/min)
    - Add IP-based and user-based rate limiting with proper error responses

    2. API Key Authentication (3 hours)

    - Create lib/security/api-keys.ts - API key generation and validation service
    - Add API key management to database schema (new table: api_keys)
    - Create middleware for API key validation on external endpoints
    - Implement API key scopes and permissions (read-only, full-access)
    - Add API key management UI for admins

    3. Input Sanitization & Validation (3 hours)

    - Create lib/security/validation.ts - Centralized validation schemas using Zod
    - Create lib/middleware/sanitize.ts - Input sanitization middleware
    - Implement XSS protection, SQL injection prevention, and data validation
    - Add request body size limits and file upload restrictions
    - Update all API endpoints to use validation middleware

    4. CORS Configuration (2 hours)

    - Create lib/security/cors.ts - Dynamic CORS configuration service
    - Implement domain whitelist management for widget embedding
    - Add preflight request handling for complex CORS scenarios
    - Configure security headers (CSP, HSTS, X-Frame-Options)

    5. Security Headers & Monitoring (2 hours)

    - Create lib/middleware/security-headers.ts - Security headers middleware
    - Implement audit logging for authentication and authorization events
    - Add security event monitoring and alerting
    - Create security dashboard for monitoring failed attempts

    New Files to Create

    lib/security/
    ├── rate-limiter.ts      # Redis-based rate limiting
    ├── api-keys.ts          # API key management
    ├── validation.ts        # Zod validation schemas
    ├── cors.ts             # CORS configuration
    └── audit-logger.ts     # Security event logging

    lib/middleware/
    ├── rate-limit.ts       # Rate limiting middleware
    ├── sanitize.ts         # Input sanitization
    ├── security-headers.ts # Security headers
    ├── api-auth.ts         # API key authentication
    └── audit.ts           # Audit logging middleware

    app/api/v1/admin/
    └── api-keys/           # API key management endpoints

    Database Schema Changes

    -- New API keys table
    CREATE TABLE api_keys (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      key_hash VARCHAR(255) NOT NULL,
      user_id VARCHAR(255) REFERENCES users(id),
      scopes JSONB DEFAULT '[]',
      expires_at TIMESTAMP,
      last_used_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Enhanced audit logging
    ALTER TABLE activity_logs ADD COLUMN security_event BOOLEAN DEFAULT FALSE;
    ALTER TABLE activity_logs ADD COLUMN ip_address INET;
    ALTER TABLE activity_logs ADD COLUMN user_agent TEXT;

    Security Enhancements

    1. JWT Token Refresh - Implement automatic token refresh mechanism
    2. Session Management - Add session invalidation and concurrent session limits  
    3. IP-based Access Controls - Implement IP whitelisting for admin endpoints
    4. Brute Force Protection - Account lockout after failed attempts
    5. Security Audit Reports - Automated security scanning and reports

    Testing Strategy

    - Security Testing - Penetration testing for all new endpoints
    - Rate Limit Testing - Load testing to verify rate limiting effectiveness
    - Integration Testing - CORS and API key authentication flows
    - Performance Testing - Ensure security middleware doesn't impact performance

    Timeline: 1 Day (14 hours total)

    - Morning: Rate limiting + API keys (7 hours)
    - Afternoon: Validation + CORS + Headers (7 hours)
    - Final: Testing and documentation

    This implementation will establish production-grade API security, making the system ready for external integrations 
    and widget embedding while protecting against common security threats.