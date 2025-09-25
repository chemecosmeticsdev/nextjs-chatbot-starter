1. Authentication Endpoints
YAML

# Authentication
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/refresh
GET    /api/v1/auth/me
2. User Management
YAML

# Users
GET    /api/v1/users?page={page}&limit={limit}&sort={sort}  # List users with pagination and sorting (admin only)
POST   /api/v1/users                                        # Create a user (admin only)
GET    /api/v1/users/{userId}                               # Get user details
PUT    /api/v1/users/{userId}                               # Update a user
DELETE /api/v1/users/{userId}                               # Delete a user (admin only)
3. Document Management
YAML

# Documents
GET    /api/v1/documents?page={page}&limit={limit}&filter={filter}  # List all documents (INCI/Formulation) with filters
POST   /api/v1/documents                                            # Upload a document (INCI or Formulation)
GET    /api/v1/documents/{docId}                                    # Get document details
DELETE /api/v1/documents/{docId}                                    # Delete a document (soft delete)

# Document Processing Status
GET    /api/v1/documents/{docId}/status    # Get processing status
GET    /api/v1/documents/{docId}/chunks    # Get document chunks
Note: The previous schema had separate endpoints for INCI and Formulation documents. A more flexible and scalable approach is to use a single /documents endpoint with a documentType field in the request body for uploads and filters for listing.

4. Product & Supplier Management
YAML

# Suppliers
GET    /api/v1/suppliers
POST   /api/v1/suppliers
GET    /api/v1/suppliers/{supplierId}
PUT    /api/v1/suppliers/{supplierId}
DELETE /api/v1/suppliers/{supplierId}

# Products
GET    /api/v1/products
POST   /api/v1/products
GET    /api/v1/products/{productId}
PUT    /api/v1/products/{productId}
DELETE /api/v1/products/{productId}
5. Search & Query
YAML

# Vector Search
POST   /api/v1/searches/similarity    # Perform similarity search, returns a result ID for history
GET    /api/v1/searches/history       # Get search history
GET    /api/v1/searches/{queryId}     # Get a specific search result (with cache headers)
6. System Management
YAML

# Settings (Admin only)
GET    /api/v1/settings
PUT    /api/v1/settings/{key}
POST   /api/v1/settings
DELETE /api/v1/settings/{key}  # Added DELETE for managing settings

# Activity Logs
GET    /api/v1/activities?page={page}&limit={limit}&filter={filter} # List activities with pagination
GET    /api/v1/activities/stats
7. Detailed Request/Response Examples
Upload Document:

JSON

POST /api/v1/documents
Content-Type: multipart/form-data

{
  "file": <binary>,
  "documentType": "inci", // 'inci' or 'formulation'
  "productId": "uuid", // Required for INCI, optional for Formulation
  "metadata": { ... }
}
Error Response Example:

JSON

HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "Invalid file type. Only PDF and DOCX are supported.",
  "code": "INVALID_FILE_TYPE",
  "details": {
    "fileType": "image/jpeg"
  }
}