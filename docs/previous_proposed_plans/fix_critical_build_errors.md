Fix Critical Build Errors

     Issues Identified:

     1. Drizzle ORM Import Error: pgIndex function doesn't exist in drizzle-orm v0.44.6, causing /api/v1/settings to fail with 500 errors
     2. Next.js Metadata Warning: Viewport configuration should use viewport export instead of metadata export  
     3. Build Cache Issues: Possible stale build cache causing discrepancies

     Fix Plan:

     1. Fix Database Schema Import Issue

     - Remove any remaining pgIndex imports and ensure only index is used
     - Verify all index definitions use the correct Drizzle ORM v0.44.6 syntax
     - Clean build cache to resolve any webpack caching issues

     2. Fix Next.js Metadata Warnings

     - Update layout files to use viewport export instead of embedding viewport in metadata
     - Apply to: /login, /dashboard, /dashboard/chatbots, /dashboard/settings

     3. Clear Build Cache

     - Remove .next directory and node_modules cache
     - Restart development server with clean state

     4. Verify Fixes

     - Test /api/v1/settings endpoint functionality
     - Confirm dashboard navigation works without errors
     - Validate settings page loads properly

     Priority: Critical - This breaks core functionality including settings management