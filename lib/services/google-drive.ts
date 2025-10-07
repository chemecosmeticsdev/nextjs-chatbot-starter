import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  parents?: string[];
  webViewLink?: string;
}

export interface GoogleDriveFolder extends GoogleDriveFile {
  mimeType: 'application/vnd.google-apps.folder';
  isLeafFolder?: boolean; // Contains files but no subfolders
}

export interface FolderStructure {
  path: string;
  supplier?: string;
  ingredient?: string;
  category?: string;
  depth: number;
  isValidTarget: boolean; // Only true for lowest-level folders with files
}

export interface GoogleDriveCredentials {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
}

export class GoogleDriveService {
  private oauth2Client: OAuth2Client;
  private drive: any;

  // Simple circuit breaker state
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private readonly MAX_FAILURES = 5;
  private readonly FAILURE_TIMEOUT = 60000; // 1 minute

  constructor(credentials?: GoogleDriveCredentials) {
    try {
      this.oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/v1/google-drive/auth/callback'
      );

      if (credentials) {
        this.oauth2Client.setCredentials(credentials);
      }

      this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    } catch (initError) {
      console.error('[GoogleDriveService] ❌ Failed to initialize Google Drive service:', initError);
      // Create a minimal non-functional drive instance to prevent crashes
      this.drive = null;
    }
  }

  /**
   * Get OAuth2 authorization URL
   */
  getAuthUrl(): string {
    const scopes = [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file'
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });
  }

  /**
   * Exchange authorization code for access token
   */
  async getAccessToken(code: string): Promise<GoogleDriveCredentials> {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    return tokens as GoogleDriveCredentials;
  }

  /**
   * Set credentials for authenticated requests
   */
  setCredentials(credentials: GoogleDriveCredentials): void {
    this.oauth2Client.setCredentials(credentials);
  }

  /**
   * Test credentials with a minimal API call to validate they work
   * before attempting main operations that could crash the server
   */
  async testCredentials(): Promise<{ valid: boolean; error?: string }> {
    console.log('[GoogleDriveService] 🔍 Testing credentials with minimal API call...');

    try {
      // Check if drive service is available
      if (!this.drive) {
        return { valid: false, error: 'Google Drive service not initialized' };
      }

      // Test with the most minimal API call possible - just get user info
      // This should fail quickly if credentials are invalid
      const startTime = Date.now();
      const testResponse = await this.drive.about.get({
        fields: 'user(emailAddress)'
      });

      const duration = Date.now() - startTime;
      console.log(`[GoogleDriveService] ✅ Credential test successful in ${duration}ms`);
      console.log(`[GoogleDriveService] - User email: ${testResponse.data?.user?.emailAddress || 'unknown'}`);

      return { valid: true };

    } catch (testError) {
      console.error('[GoogleDriveService] ❌ Credential test failed:', testError);

      if (testError && typeof testError === 'object') {
        const errorObj = testError as any;
        const errorMessage = errorObj.message || 'Unknown error';

        // Classify the error type
        if (errorMessage.includes('invalid_grant') || errorMessage.includes('Invalid Credentials')) {
          return { valid: false, error: 'Invalid or expired credentials' };
        }

        if (errorMessage.includes('403') || errorMessage.includes('insufficient permission')) {
          return { valid: false, error: 'Insufficient permissions' };
        }

        if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
          return { valid: false, error: 'Unauthorized - credentials may be expired' };
        }

        if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
          return { valid: false, error: 'Network error connecting to Google API' };
        }

        return { valid: false, error: `Credential test failed: ${errorMessage}` };
      }

      return { valid: false, error: 'Unknown credential validation error' };
    }
  }

  /**
   * Memory monitoring utility
   */
  private getMemoryUsage(): { heapUsed: number; heapTotal: number; rss: number } {
    const usage = process.memoryUsage();
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
      rss: Math.round(usage.rss / 1024 / 1024) // MB
    };
  }

  /**
   * Check if memory usage is approaching dangerous levels
   */
  private isMemoryAtRisk(): boolean {
    const usage = this.getMemoryUsage();
    const HEAP_LIMIT_MB = 1300; // Conservative heap limit to stay under API route's 1400MB
    const RSS_LIMIT_MB = 2600; // Conservative RSS limit to stay under API route's 2800MB
    return usage.heapUsed > HEAP_LIMIT_MB || usage.rss > RSS_LIMIT_MB;
  }

  /**
   * Force garbage collection if available
   */
  private forceGarbageCollection(): void {
    if (global.gc) {
      console.log('[GoogleDriveService] 🗑️ Forcing garbage collection...');
      global.gc();
      const afterGC = this.getMemoryUsage();
      console.log(`[GoogleDriveService] ✅ Post-GC memory: ${afterGC.heapUsed}MB heap, ${afterGC.rss}MB RSS`);
    }
  }

  /**
   * Check if circuit breaker should prevent requests
   */
  private isCircuitBreakerOpen(): boolean {
    const now = Date.now();

    // Reset failure count after timeout
    if (now - this.lastFailureTime > this.FAILURE_TIMEOUT) {
      this.failureCount = 0;
    }

    return this.failureCount >= this.MAX_FAILURES;
  }

  /**
   * Record a failure for circuit breaker
   */
  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    console.warn(`[GoogleDriveService] ⚠️ Circuit breaker failure count: ${this.failureCount}/${this.MAX_FAILURES}`);
  }

  /**
   * Record a success for circuit breaker
   */
  private recordSuccess(): void {
    this.failureCount = 0;
  }

  /**
   * List folders in the root directory or a specific folder with memory protection
   */
  async listFolders(parentId: string = 'root'): Promise<GoogleDriveFolder[]> {
    const startMemory = this.getMemoryUsage();
    console.log(`[GoogleDriveService] 📁 Starting folder listing for parent: ${parentId}`);
    console.log(`[GoogleDriveService] 💾 Initial memory: ${startMemory.heapUsed}MB heap, ${startMemory.rss}MB RSS`);

    // Circuit breaker check
    if (this.isCircuitBreakerOpen()) {
      console.error('[GoogleDriveService] 🚫 Circuit breaker is open, preventing request to avoid cascading failures');
      return [];
    }

    // Memory safety check
    if (this.isMemoryAtRisk()) {
      console.error('[GoogleDriveService] ⚠️ Memory usage too high, aborting to prevent crash');
      this.forceGarbageCollection();
      return [];
    }

    try {
      // Check if drive service is available
      if (!this.drive) {
        console.error('[GoogleDriveService] ❌ Google Drive service not initialized properly');
        return [];
      }

      // Enhanced validation of parentId
      if (!parentId || typeof parentId !== 'string') {
        console.error('[GoogleDriveService] ❌ Invalid parent ID provided:', parentId);
        return [];
      }

      // Pre-validate credentials with a test API call to prevent crashes
      console.log(`[GoogleDriveService] 🔐 Pre-validating credentials before main API call...`);
      const credentialTest = await this.testCredentials();

      if (!credentialTest.valid) {
        console.error(`[GoogleDriveService] ❌ Credential validation failed: ${credentialTest.error}`);
        this.recordFailure();
        throw new Error(credentialTest.error || 'Invalid Google Drive credentials');
      }

      console.log(`[GoogleDriveService] ✅ Credentials validated successfully`);
      console.log(`[GoogleDriveService] 🔍 Executing Google Drive API call with robust error handling...`);

      // Wrap API call in comprehensive try-catch
      let response;
      let folders = [];

      try {
        // Simplified API call without complex timeout handling
        const MAX_RESULTS = 50; // Limit results to prevent memory issues

        // Additional error isolation - wrap in promise with explicit error handling
        console.log(`[GoogleDriveService] 🛡️ Executing API call with additional error isolation...`);

        response = await new Promise((resolve, reject) => {
          // Set a timeout to prevent hanging
          const timeout = setTimeout(() => {
            reject(new Error('Google Drive API call timeout after 30 seconds'));
          }, 30000);

          // Make the actual API call
          this.drive.files.list({
            q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name, mimeType, modifiedTime, parents, webViewLink)',
            orderBy: 'name',
            pageSize: MAX_RESULTS // Limit page size
          }).then(result => {
            clearTimeout(timeout);
            resolve(result);
          }).catch(error => {
            clearTimeout(timeout);
            console.error('[GoogleDriveService] 🚨 googleapis library error caught:', error);
            reject(error);
          });
        });

        console.log(`[GoogleDriveService] ✅ API call successful`);
        folders = response?.data?.files || [];
        console.log(`[GoogleDriveService] 📊 Found ${folders.length} folders (max ${MAX_RESULTS})`);

      } catch (apiError) {
        console.error(`[GoogleDriveService] ❌ Google Drive API call failed:`, apiError);

        // Handle different types of errors
        if (apiError && typeof apiError === 'object') {
          const errorObj = apiError as any;
          console.error(`[GoogleDriveService] - API Error type: ${typeof apiError}`);
          console.error(`[GoogleDriveService] - API Error code: ${errorObj.code || 'unknown'}`);
          console.error(`[GoogleDriveService] - API Error message: ${errorObj.message || 'unknown'}`);

          // Record failure and return empty array instead of crashing
          this.recordFailure();
          return [];
        }

        // For any unknown error types, also return empty array
        this.recordFailure();
        return [];
      }

      // Simplified memory check after API call
      const afterAPIMemory = this.getMemoryUsage();
      console.log(`[GoogleDriveService] 💾 After API call: ${afterAPIMemory.heapUsed}MB heap (+${afterAPIMemory.heapUsed - startMemory.heapUsed}MB)`);

      // Return simplified folder processing
      const processedFolders = this.processFoldersWithMemoryProtection(folders);

      // Final memory log
      const finalMemory = this.getMemoryUsage();
      console.log(`[GoogleDriveService] 💾 Final memory: ${finalMemory.heapUsed}MB heap, ${finalMemory.rss}MB RSS`);

      // Record success for circuit breaker
      this.recordSuccess();

      return processedFolders;

    } catch (error) {
      console.error('[GoogleDriveService] ❌ Critical error listing folders:', error);

      // Record failure for circuit breaker
      this.recordFailure();

      // Conservative memory cleanup on error
      try {
        this.forceGarbageCollection();
      } catch (gcError) {
        console.warn('[GoogleDriveService] ⚠️ Garbage collection failed:', gcError);
      }

      // Enhanced error analysis with null checks
      if (error && typeof error === 'object') {
        const errorObj = error as any;
        console.error(`[GoogleDriveService] - Error type: ${typeof error}`);
        console.error(`[GoogleDriveService] - Error name: ${errorObj.name || 'Unknown'}`);
        console.error(`[GoogleDriveService] - Error message: ${errorObj.message || 'No message'}`);

        const errorMessage = errorObj.message || '';

        // Handle specific Google API errors gracefully
        if (errorMessage.includes('File not found') || errorMessage.includes('404')) {
          console.log('[GoogleDriveService] 🔍 Parent folder not found, returning empty array');
          return [];
        }

        if (errorMessage.includes('insufficient permission') || errorMessage.includes('403')) {
          console.log('[GoogleDriveService] 🚫 Insufficient permissions, returning empty array');
          return [];
        }

        if (errorMessage.includes('invalid_grant') || errorMessage.includes('Invalid Credentials')) {
          console.log('[GoogleDriveService] 🔐 Invalid credentials, re-throwing for auth handling');
          throw new Error('Invalid Google Drive credentials. Please re-authenticate.');
        }

        // Handle network and timeout errors
        if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ETIMEDOUT') ||
            errorMessage.includes('network') || errorMessage.includes('timeout')) {
          console.log('[GoogleDriveService] 🌐 Network error, returning empty array');
          return [];
        }

        // Handle rate limiting
        if (errorMessage.includes('429') || errorMessage.includes('rate limit') ||
            errorMessage.includes('quota exceeded')) {
          console.log('[GoogleDriveService] ⏰ Rate limit exceeded, returning empty array');
          return [];
        }
      }

      // Always return empty array instead of throwing to prevent 502 errors
      console.log('[GoogleDriveService] 🔄 Returning empty array to prevent server crash');
      return [];
    }
  }

  /**
   * Process folders with simplified safe handling
   */
  private processFoldersWithMemoryProtection(folders: any[]): GoogleDriveFolder[] {
    if (!folders || !Array.isArray(folders)) {
      console.warn('[GoogleDriveService] ⚠️ Invalid folders array provided');
      return [];
    }

    console.log(`[GoogleDriveService] 🔄 Processing ${folders.length} folders...`);

    const simplifiedFolders: GoogleDriveFolder[] = [];

    try {
      for (const folder of folders) {
        if (!folder || typeof folder !== 'object') {
          continue; // Skip invalid folders
        }

        const processedFolder: GoogleDriveFolder = {
          id: folder.id || '',
          name: folder.name || 'Unnamed Folder',
          mimeType: 'application/vnd.google-apps.folder',
          modifiedTime: folder.modifiedTime || new Date().toISOString(),
          parents: Array.isArray(folder.parents) ? folder.parents : [],
          webViewLink: folder.webViewLink || undefined,
          isLeafFolder: false // Will be determined later if needed
        };

        simplifiedFolders.push(processedFolder);
      }
    } catch (processingError) {
      console.error('[GoogleDriveService] ❌ Error processing folders:', processingError);
      // Return whatever we've processed so far
    }

    console.log(`[GoogleDriveService] ✅ Successfully processed ${simplifiedFolders.length}/${folders.length} folders`);
    return simplifiedFolders;
  }

  /**
   * Check if a folder is a leaf folder (contains files but no subfolders)
   */
  async isLeafFolder(folderId: string): Promise<boolean> {
    try {
      // Check for subfolders
      const subfoldersResponse = await this.drive.files.list({
        q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id)',
        pageSize: 1
      });

      const hasSubfolders = (subfoldersResponse.data.files || []).length > 0;

      // Check for files
      const filesResponse = await this.drive.files.list({
        q: `'${folderId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id)',
        pageSize: 1
      });

      const hasFiles = (filesResponse.data.files || []).length > 0;

      // It's a leaf folder if it has files but no subfolders
      return hasFiles && !hasSubfolders;
    } catch (error) {
      console.error('Error checking if folder is leaf:', error);
      return false;
    }
  }

  /**
   * List files in a specific folder
   */
  async listFiles(folderId: string): Promise<GoogleDriveFile[]> {
    try {
      const response = await this.drive.files.list({
        q: `'${folderId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name, mimeType, size, modifiedTime, parents, webViewLink)',
        orderBy: 'name'
      });

      return response.data.files || [];
    } catch (error) {
      console.error('Error listing files:', error);
      throw new Error('Failed to list files from Google Drive');
    }
  }

  /**
   * Get folder path from root to the specified folder with memory protection
   */
  async getFolderPath(folderId: string): Promise<string[]> {
    const startMemory = this.getMemoryUsage();
    console.log(`[GoogleDriveService] 🛤️ Starting path traversal for folder: ${folderId}`);
    console.log(`[GoogleDriveService] 💾 Initial memory: ${startMemory.heapUsed}MB heap, ${startMemory.rss}MB RSS`);

    if (folderId === 'root') {
      console.log(`[GoogleDriveService] ✅ Root folder detected, returning empty path`);
      return [];
    }

    // Memory safety check before starting traversal
    if (this.isMemoryAtRisk()) {
      console.error('[GoogleDriveService] ⚠️ Memory usage too high, aborting path traversal to prevent crash');
      this.forceGarbageCollection();
      return [];
    }

    try {
      const path: string[] = [];
      let currentId = folderId;
      let depth = 0;
      const maxDepth = 15; // Reduced from 20 to prevent memory issues
      const API_TIMEOUT = 10000; // 10 seconds per call

      console.log(`[GoogleDriveService] 🔍 Starting folder traversal with memory protection...`);

      while (currentId && currentId !== 'root' && depth < maxDepth) {
        console.log(`[GoogleDriveService] - Depth ${depth}: Processing folder ${currentId}`);

        // Memory check at each level to prevent gradual buildup
        if (depth > 0 && depth % 3 === 0) { // Check every 3 levels
          const currentMemory = this.getMemoryUsage();
          console.log(`[GoogleDriveService] 💾 Memory at depth ${depth}: ${currentMemory.heapUsed}MB heap (+${currentMemory.heapUsed - startMemory.heapUsed}MB)`);

          if (this.isMemoryAtRisk()) {
            console.warn(`[GoogleDriveService] ⚠️ Memory limit reached during path traversal at depth ${depth}`);
            this.forceGarbageCollection();
            break; // Stop traversal to prevent crash
          }
        }

        try {
          // Add timeout to individual API calls
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

          const response = await this.drive.files.get({
            fileId: currentId,
            fields: 'name, parents'
          });

          clearTimeout(timeoutId);
          const folder = response.data;

          if (!folder || !folder.name) {
            console.warn(`[GoogleDriveService] ⚠️ Invalid folder data at depth ${depth}, breaking traversal`);
            break;
          }

          console.log(`[GoogleDriveService] - Found folder: ${folder.name}`);
          path.unshift(folder.name);

          // Move to parent folder
          if (folder.parents && folder.parents.length > 0) {
            currentId = folder.parents[0];
            console.log(`[GoogleDriveService] - Moving to parent: ${currentId}`);
          } else {
            console.log(`[GoogleDriveService] - No parent found, ending traversal`);
            break;
          }

          depth++;

        } catch (folderError) {
          console.error(`[GoogleDriveService] ❌ Error at depth ${depth}:`, folderError);

          // Handle timeout errors
          if (folderError.name === 'AbortError') {
            console.error(`[GoogleDriveService] ⏰ API call timed out at depth ${depth}`);
            break;
          }

          // Handle specific errors
          if (folderError instanceof Error) {
            if (folderError.message.includes('File not found') || folderError.message.includes('404')) {
              console.log(`[GoogleDriveService] 🔍 Folder not found at depth ${depth}, breaking traversal`);
              break;
            }

            if (folderError.message.includes('insufficient permission') || folderError.message.includes('403')) {
              console.log(`[GoogleDriveService] 🚫 Permission denied at depth ${depth}, breaking traversal`);
              break;
            }
          }

          // For other errors, break the loop to prevent infinite recursion
          console.log(`[GoogleDriveService] 🛑 Breaking traversal due to error at depth ${depth}`);
          break;
        }
      }

      if (depth >= maxDepth) {
        console.warn(`[GoogleDriveService] ⚠️ Max depth ${maxDepth} reached, possible deep folder structure`);
      }

      // Final memory check
      const finalMemory = this.getMemoryUsage();
      console.log(`[GoogleDriveService] ✅ Path traversal completed successfully`);
      console.log(`[GoogleDriveService] - Final path: /${path.join('/')} (${path.length} segments)`);
      console.log(`[GoogleDriveService] 💾 Final memory: ${finalMemory.heapUsed}MB heap, ${finalMemory.rss}MB RSS`);

      return path;

    } catch (error) {
      console.error('[GoogleDriveService] ❌ Critical error in folder path traversal:', error);

      // Emergency memory cleanup on error
      this.forceGarbageCollection();

      // Enhanced error analysis
      if (error instanceof Error) {
        console.error(`[GoogleDriveService] - Error name: ${error.name}`);
        console.error(`[GoogleDriveService] - Error message: ${error.message}`);
        console.error(`[GoogleDriveService] - Error stack: ${error.stack || 'No stack trace'}`);

        // Handle specific Google API errors
        if (error.message.includes('File not found') || error.message.includes('404')) {
          console.log('[GoogleDriveService] 🔍 Folder not found, returning empty path');
          return [];
        }

        if (error.message.includes('insufficient permission') || error.message.includes('403')) {
          console.log('[GoogleDriveService] 🚫 Insufficient permissions, returning empty path');
          return [];
        }

        if (error.message.includes('invalid_grant') || error.message.includes('Invalid Credentials')) {
          console.log('[GoogleDriveService] 🔐 Invalid credentials, re-throwing for auth handling');
          throw new Error('Invalid Google Drive credentials. Please re-authenticate.');
        }
      }

      // Return empty path instead of throwing to prevent server crashes
      console.log('[GoogleDriveService] 🔄 Returning empty path to prevent server crash');
      return [];
    }
  }

  /**
   * Analyze folder structure and extract metadata based on RAG implementation plan
   * Expected structure: /PC/{Supplier}/{Ingredient}/{...}
   */
  async analyzeFolderStructure(folderId: string): Promise<FolderStructure> {
    console.log(`[GoogleDriveService] 📊 Starting folder structure analysis for: ${folderId}`);

    try {
      // Enhanced error handling for path segments
      console.log(`[GoogleDriveService] 🔍 Getting folder path...`);
      const pathSegments = await this.getFolderPath(folderId);
      console.log(`[GoogleDriveService] ✅ Path segments retrieved: ${pathSegments.length} segments`);
      console.log(`[GoogleDriveService] - Path: ${pathSegments.join(' -> ')}`);

      const path = '/' + pathSegments.join('/');

      // Check if this follows the expected PC folder structure
      const pcIndex = pathSegments.findIndex(segment => segment.toUpperCase() === 'PC');
      console.log(`[GoogleDriveService] 🔍 PC folder index: ${pcIndex}`);

      let supplier: string | undefined;
      let ingredient: string | undefined;
      let category: string | undefined;
      let isValidTarget = false;

      if (pcIndex >= 0 && pathSegments.length > pcIndex + 2) {
        supplier = pathSegments[pcIndex + 1];
        console.log(`[GoogleDriveService] ✅ Supplier identified: ${supplier}`);

        // Check if this is a supplier-level folder (like "- Certificate" or "- Presentation")
        const supplierLevelFolder = pathSegments[pcIndex + 2];
        if (supplierLevelFolder.startsWith('- ')) {
          category = supplierLevelFolder.substring(2); // Remove "- " prefix
          console.log(`[GoogleDriveService] ✅ Category identified: ${category}`);
        } else {
          ingredient = supplierLevelFolder;
          console.log(`[GoogleDriveService] ✅ Ingredient identified: ${ingredient}`);

          // If there are more segments, it might be a category within the ingredient
          if (pathSegments.length > pcIndex + 3) {
            const subCategory = pathSegments[pcIndex + 3];
            if (!subCategory.startsWith('- ')) {
              category = subCategory;
              console.log(`[GoogleDriveService] ✅ Sub-category identified: ${category}`);
            }
          }
        }

        // Enhanced error handling for leaf folder check
        console.log(`[GoogleDriveService] 🔍 Checking if folder is leaf folder...`);
        try {
          isValidTarget = await this.isLeafFolder(folderId);
          console.log(`[GoogleDriveService] ✅ Leaf folder check completed: ${isValidTarget}`);
        } catch (leafError) {
          console.error(`[GoogleDriveService] ❌ Leaf folder check failed:`, leafError);
          // Continue with isValidTarget = false
          isValidTarget = false;
        }
      } else {
        console.log(`[GoogleDriveService] ℹ️ Folder does not match PC structure pattern`);
      }

      const result = {
        path,
        supplier,
        ingredient,
        category,
        depth: pathSegments.length,
        isValidTarget
      };

      console.log(`[GoogleDriveService] ✅ Folder structure analysis completed successfully`);
      console.log(`[GoogleDriveService] - Result:`, result);

      return result;

    } catch (error) {
      console.error(`[GoogleDriveService] ❌ Critical error in folder structure analysis:`, error);

      // Return minimal fallback structure instead of throwing
      const fallbackResult = {
        path: '',
        depth: 0,
        isValidTarget: false
      };

      console.log(`[GoogleDriveService] 🔄 Returning fallback structure:`, fallbackResult);
      return fallbackResult;
    }
  }

  /**
   * Download file content as base64
   */
  async downloadFileAsBase64(fileId: string): Promise<string> {
    try {
      const response = await this.drive.files.get({
        fileId: fileId,
        alt: 'media'
      }, {
        responseType: 'arraybuffer'
      });

      const buffer = Buffer.from(response.data);
      return buffer.toString('base64');
    } catch (error) {
      console.error('Error downloading file:', error);
      throw new Error('Failed to download file from Google Drive');
    }
  }

  /**
   * Download file and save to local filesystem
   */
  async downloadFile(fileId: string, documentId?: string): Promise<{
    success: boolean;
    filePath?: string;
    fileSize?: number;
    error?: string;
  }> {
    try {
      console.log(`[GoogleDriveService] Starting download for file ID: ${fileId}`);

      // Get file metadata first
      const metadata = await this.getFileMetadata(fileId);
      console.log(`[GoogleDriveService] File metadata: ${metadata.name} (${metadata.mimeType})`);

      // Download file content
      const response = await this.drive.files.get({
        fileId: fileId,
        alt: 'media'
      }, {
        responseType: 'arraybuffer'
      });

      const buffer = Buffer.from(response.data);
      const fileSize = buffer.length;

      // Create download directory if it doesn't exist
      const fs = await import('fs/promises');
      const path = await import('path');

      // Organize by document ID for consistency, fallback to generic folder
      const downloadDir = documentId
        ? path.join(process.cwd(), 'temp', 'google-drive', documentId)
        : path.join(process.cwd(), 'temp', 'google-drive');

      try {
        await fs.mkdir(downloadDir, { recursive: true });
      } catch (error) {
        // Directory might already exist, which is fine
      }

      // Use the original filename if available, fallback to file ID
      const fileName = metadata.name || fileId;
      const filePath = path.join(downloadDir, fileName);

      await fs.writeFile(filePath, buffer);

      console.log(`[GoogleDriveService] File downloaded successfully to: ${filePath} (${fileSize} bytes)`);

      return {
        success: true,
        filePath,
        fileSize
      };
    } catch (error) {
      console.error(`[GoogleDriveService] Error downloading file ${fileId}:`, error);
      return {
        success: false,
        error: `Failed to download file from Google Drive: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(fileId: string): Promise<GoogleDriveFile> {
    try {
      const response = await this.drive.files.get({
        fileId: fileId,
        fields: 'id, name, mimeType, size, modifiedTime, parents, webViewLink'
      });

      return response.data;
    } catch (error) {
      console.error('Error getting file metadata:', error);
      throw new Error('Failed to get file metadata from Google Drive');
    }
  }

  /**
   * Find PC folder in user's Drive with memory protection
   */
  async findPCFolder(): Promise<GoogleDriveFolder | null> {
    const startMemory = this.getMemoryUsage();
    console.log(`[GoogleDriveService] 🔍 Starting PC folder search...`);
    console.log(`[GoogleDriveService] 💾 Initial memory: ${startMemory.heapUsed}MB heap, ${startMemory.rss}MB RSS`);

    // Memory safety check
    if (this.isMemoryAtRisk()) {
      console.error('[GoogleDriveService] ⚠️ Memory usage too high, aborting PC folder search to prevent crash');
      this.forceGarbageCollection();
      return null;
    }

    try {
      console.log(`[GoogleDriveService] 📋 Executing Google Drive API search for PC folder...`);

      const API_TIMEOUT = 15000; // 15 seconds
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

      try {
        const response = await this.drive.files.list({
          q: "name='PC' and mimeType='application/vnd.google-apps.folder' and trashed=false",
          fields: 'files(id, name, mimeType, modifiedTime, parents, webViewLink)',
          pageSize: 10 // Limit results
        });

        clearTimeout(timeoutId);

        console.log(`[GoogleDriveService] ✅ PC folder search API call successful`);
        const pcFolders = response.data.files || [];
        console.log(`[GoogleDriveService] 📊 Found ${pcFolders.length} potential PC folders`);

        // Check memory after API call
        const afterAPIMemory = this.getMemoryUsage();
        console.log(`[GoogleDriveService] 💾 After API call: ${afterAPIMemory.heapUsed}MB heap (+${afterAPIMemory.heapUsed - startMemory.heapUsed}MB)`);

        if (pcFolders.length > 0) {
          const pcFolder = pcFolders[0];
          console.log(`[GoogleDriveService] ✅ PC folder found: ${pcFolder.name} (${pcFolder.id})`);

          // Enhanced validation of PC folder data
          const validatedPCFolder: GoogleDriveFolder = {
            id: pcFolder.id || '',
            name: pcFolder.name || 'PC',
            mimeType: pcFolder.mimeType as 'application/vnd.google-apps.folder',
            modifiedTime: pcFolder.modifiedTime || new Date().toISOString(),
            parents: pcFolder.parents || [],
            webViewLink: pcFolder.webViewLink || undefined,
            isLeafFolder: false // PC folder will never be a leaf folder
          };

          console.log(`[GoogleDriveService] ✅ PC folder validated and ready to return`);

          // Final memory check
          const finalMemory = this.getMemoryUsage();
          console.log(`[GoogleDriveService] 💾 Final memory: ${finalMemory.heapUsed}MB heap, ${finalMemory.rss}MB RSS`);

          return validatedPCFolder;
        }

        console.log(`[GoogleDriveService] ❌ No PC folder found in user's Drive`);
        return null;

      } catch (apiError) {
        clearTimeout(timeoutId);

        if (apiError.name === 'AbortError') {
          console.error('[GoogleDriveService] ⏰ PC folder search timed out after 15 seconds');
          return null;
        }

        throw apiError;
      }

    } catch (error) {
      console.error('[GoogleDriveService] ❌ Critical error finding PC folder:', error);

      // Emergency memory cleanup on error
      this.forceGarbageCollection();

      // Enhanced error analysis
      if (error instanceof Error) {
        console.error(`[GoogleDriveService] - Error name: ${error.name}`);
        console.error(`[GoogleDriveService] - Error message: ${error.message}`);
        console.error(`[GoogleDriveService] - Error stack: ${error.stack || 'No stack trace'}`);

        // Handle specific Google API errors gracefully
        if (error.message.includes('insufficient permission') || error.message.includes('403')) {
          console.log('[GoogleDriveService] 🚫 Insufficient permissions for Drive search, returning null');
          return null;
        }

        if (error.message.includes('invalid_grant') || error.message.includes('Invalid Credentials')) {
          console.log('[GoogleDriveService] 🔐 Invalid credentials, re-throwing for auth handling');
          throw new Error('Invalid Google Drive credentials. Please re-authenticate.');
        }

        if (error.message.includes('429') || error.message.includes('rate limit')) {
          console.log('[GoogleDriveService] ⏰ Rate limit hit, returning null');
          return null;
        }
      }

      // Return null instead of throwing to prevent 502 errors
      console.log('[GoogleDriveService] 🔄 Returning null to prevent server crash');
      return null;
    }
  }

  /**
   * Validate if the selected folder contains processable documents
   */
  async validateFolderForProcessing(folderId: string): Promise<{
    isValid: boolean;
    fileCount: number;
    supportedFileCount: number;
    folderStructure: FolderStructure;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Analyze folder structure
      const folderStructure = await this.analyzeFolderStructure(folderId);

      // Check if it's a valid target folder (CRITICAL - blocks processing)
      if (!folderStructure.isValidTarget) {
        errors.push('Selected folder must contain files and no subfolders');
      }

      // Check folder structure pattern (WARNING - doesn't block processing)
      if (!folderStructure.supplier) {
        warnings.push('Folder structure does not match expected pattern: /PC/{Supplier}/{Ingredient}/...');
        warnings.push('Supplier name could not be extracted from folder path');
      }

      if (folderStructure.supplier && !folderStructure.ingredient) {
        warnings.push('Ingredient name could not be extracted from folder path');
      }

      // Get files in the folder
      const files = await this.listFiles(folderId);
      const fileCount = files.length;

      // Filter supported file types (enhanced list)
      const supportedMimeTypes = [
        // Documents
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'text/markdown',
        'application/rtf',
        // Images
        'image/jpeg',
        'image/png',
        'image/tiff',
        'image/bmp',
        'image/gif'
      ];

      const supportedFileExtensions = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|rtf|jpg|jpeg|png|tif|tiff|bmp|gif)$/i;

      const supportedFiles = files.filter(file =>
        supportedMimeTypes.includes(file.mimeType) ||
        supportedFileExtensions.test(file.name.toLowerCase())
      );

      const supportedFileCount = supportedFiles.length;
      const unsupportedFileCount = fileCount - supportedFileCount;

      // Critical errors (block processing)
      if (fileCount === 0) {
        errors.push('Selected folder is empty');
      } else if (supportedFileCount === 0) {
        errors.push('No supported file types found in selected folder');
      }

      // Warnings (don't block processing)
      if (unsupportedFileCount > 0) {
        warnings.push(`${unsupportedFileCount} files will be skipped (unsupported format)`);
      }

      if (fileCount > 100) {
        warnings.push(`Large folder detected (${fileCount} files). Processing may take significant time.`);
      }

      if (folderStructure.depth < 3) {
        warnings.push('Folder appears to be at a high level. Consider selecting a more specific folder.');
      }

      // Check for large files that might cause processing issues
      const largeFiles = files.filter(file => file.size && parseInt(file.size) > 50 * 1024 * 1024); // 50MB
      if (largeFiles.length > 0) {
        warnings.push(`${largeFiles.length} files are larger than 50MB and may take longer to process`);
      }

      return {
        isValid: errors.length === 0,
        fileCount,
        supportedFileCount,
        folderStructure,
        errors,
        warnings
      };
    } catch (error) {
      console.error('Error validating folder:', error);
      return {
        isValid: false,
        fileCount: 0,
        supportedFileCount: 0,
        folderStructure: {
          path: '',
          depth: 0,
          isValidTarget: false
        },
        errors: ['Failed to validate folder: ' + (error as Error).message],
        warnings: []
      };
    }
  }
}

// Export default instance
export const googleDriveService = new GoogleDriveService();