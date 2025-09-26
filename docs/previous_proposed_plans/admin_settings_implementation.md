Admin Settings Implementation Plan

    Based on my comprehensive analysis of your codebase and design documents, I'll implement an admin-only 
    settings interface with database CRUD operations following your established patterns.

    Current Analysis Summary:

    - Database: Connected to Neon PostgreSQL (project: old-unit-76511442)
    - Existing Schema: system_settings table already exists with proper structure
    - Design Documents: Following ImprovedAPISchema.txt patterns
    - Authentication: Cognito integration with super_admin role validation
    - Current Settings UI: Basic structure exists, needs enhancement for admin functionality

    Database Schema Analysis:

    The existing system_settings table is perfect for our needs:
    - Primary key: key (varchar) 
    - value (jsonb) for flexible data storage
    - description, is_public, updated_by tracking
    - Follows design document patterns exactly

    Implementation Plan:

    1. API Endpoints (/api/v1/settings)

    Following your ImprovedAPISchema.txt design:
    - GET /api/v1/settings - Retrieve all admin settings (masked sensitive data)
    - PUT /api/v1/settings/{key} - Update specific setting
    - POST /api/v1/settings - Create new setting
    - DELETE /api/v1/settings/{key} - Remove setting

    2. Admin Settings Configuration

    Implement the 5 required settings:
    1. mistral_ocr_api_key - Encrypted storage for OCR processing
    2. aws_bedrock_credentials - Key, secret, region (encrypted)
    3. default_llm_model - Dropdown populated from Bedrock API
    4. s3_document_bucket - Storage location for uploads
    5. embedding_model - Display-only field as requested

    3. Enhanced UI Components

    Replace existing static sections with:
    - Secure form fields with proper validation using Zod
    - AWS Bedrock models dropdown (fetched dynamically)
    - Sensitive data masking (show only hints)
    - Real-time validation and user feedback
    - Integration with existing shadcn/ui components

    4. Prepopulation from Environment

    From .env.local analysis, I can prepopulate:
    - AWS credentials: BAWS_ACCESS_KEY_ID, BAWS_SECRET_ACCESS_KEY
    - AWS regions: DEFAULT_REGION (ap-southeast-1), BEDROCK_REGION (us-east-1)
    - Default Bedrock model: amazon.nova-micro-v1:0 from lib/config.ts

    5. Security Implementation

    - Leverage existing super_admin role checking pattern
    - Encrypt sensitive fields using PostgreSQL's pgcrypto
    - Audit logging through existing activity_logs table
    - Input validation and sanitization
    - Rate limiting for API endpoints

    6. AWS Bedrock Integration

    - Fetch available models dynamically from Bedrock API
    - Cache model list with refresh capability  
    - Handle regional differences (us-east-1 for Bedrock)
    - Support for model filtering by category/capability

    API Design (Following Your Schema):

    GET    /api/v1/settings                    # List all settings (admin only)
    POST   /api/v1/settings                    # Create new setting  
    PUT    /api/v1/settings/{key}              # Update existing setting
    DELETE /api/v1/settings/{key}              # Delete setting

    Database Operations:

    - Use existing system_settings table structure
    - Store sensitive values encrypted in JSONB format
    - Track changes via updated_by and updated_at fields
    - Log all admin actions to activity_logs table

    Suggested Environment Additions:

    - MISTRAL_OCR_API_KEY for OCR functionality
    - S3_DOCUMENT_BUCKET for file storage
    - Consider AWS Systems Manager Parameter Store for production secrets

    This implementation will seamlessly integrate with your existing dashboard structure, authentication 
    system, and follows the established API patterns from your design documents.