'use client';

import { useState, useEffect } from 'react';
import { useBreadcrumbs } from '@/lib/hooks/use-breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { FileText, Upload, Search, Filter, MoreHorizontal, Download, RefreshCw, Trash2, Loader2, Edit3, Save } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface Document {
  id: string;
  name: string;
  type: string;
  size: string;
  uploadedAt: string;
  status: 'processing' | 'ready' | 'error';
  uploadedBy: string;
}

interface ApiDocument {
  id: string;
  title: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  processingStatus: string;
  metadata: any;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
  chunkCount: number;
  // Structured metadata fields
  supplierName?: string;
  supplierNormalized?: string;
  supplierCountry?: string;
  ingredientName?: string;
  ingredientNormalized?: string;
  ingredientInciName?: string;
  ingredientCasNumber?: string;
  ragDocumentType?: string;
  documentSubtype?: string;
  complianceTypes?: string[];
  certificationBodies?: string[];
  regulatoryRegions?: string[];
  keywords?: string[];
  casNumbers?: string[];
  inciNames?: string[];
  allergens?: string[];
  qualityScore?: number;
  validationStatus?: string;
  language?: string;
  pageCount?: number;
  wordCount?: number;
}

interface ApiResponse {
  success: boolean;
  data: {
    documents: ApiDocument[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export default function DocumentsPage() {
  // Set up breadcrumbs for Document Management page
  useBreadcrumbs({
    autoGenerate: true,
    trackAnalytics: false,
    customTitles: {
      'documents': 'Document Management'
    }
  });

  const [documents, setDocuments] = useState<Document[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State for document actions
  const [actionLoading, setActionLoading] = useState<{ [key: string]: boolean }>({});
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showReprocessDialog, setShowReprocessDialog] = useState(false);
  const [showMetadataDialog, setShowMetadataDialog] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [metadataForm, setMetadataForm] = useState<Partial<ApiDocument>>({});
  const [metadataSaving, setMetadataSaving] = useState(false);


  // Helper function to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Helper function to get file extension from mime type
  const getFileTypeFromMime = (mimeType: string): string => {
    const mimeMap: { [key: string]: string } = {
      'application/pdf': 'PDF',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
      'application/msword': 'DOC',
      'text/plain': 'TXT',
      'application/json': 'JSON',
      'text/csv': 'CSV',
      'application/vnd.ms-excel': 'XLS',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX'
    };
    return mimeMap[mimeType] || mimeType.split('/')[1]?.toUpperCase() || 'FILE';
  };

  // Helper function to map processing status
  const mapProcessingStatus = (status: string): 'processing' | 'ready' | 'error' => {
    switch (status) {
      case 'completed':
        return 'ready';
      case 'processing':
      case 'pending':
        return 'processing';
      case 'failed':
      case 'error':
        return 'error';
      default:
        return 'processing';
    }
  };

  // Transform API document to component document
  const transformDocument = (apiDoc: ApiDocument): Document => ({
    id: apiDoc.id,
    name: apiDoc.title || apiDoc.filename,
    type: getFileTypeFromMime(apiDoc.mimeType),
    size: formatFileSize(apiDoc.fileSize),
    uploadedAt: new Date(apiDoc.createdAt).toLocaleDateString(),
    status: mapProcessingStatus(apiDoc.processingStatus),
    uploadedBy: apiDoc.uploadedBy
  });

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/v1/knowledge-base/documents?limit=50');

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const apiResponse: ApiResponse = await response.json();

      if (apiResponse.success && apiResponse.data.documents) {
        const transformedDocuments = apiResponse.data.documents.map(transformDocument);
        setDocuments(transformedDocuments);
      } else {
        throw new Error('Invalid API response format');
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
      setError(error instanceof Error ? error.message : 'Failed to load documents');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return <Badge className="bg-green-100 text-green-800">Ready</Badge>;
      case 'processing':
        return <Badge className="bg-yellow-100 text-yellow-800">Processing</Badge>;
      case 'error':
        return <Badge className="bg-red-100 text-red-800">Error</Badge>;
      default:
        return <Badge>Unknown</Badge>;
    }
  };

  // Search functionality
  const fetchDocumentsWithSearch = async (search?: string) => {
    try {
      setLoading(true);
      setError(null);

      const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
      const response = await fetch(`/api/v1/knowledge-base/documents?limit=50${searchParam}`);

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const apiResponse: ApiResponse = await response.json();

      if (apiResponse.success && apiResponse.data.documents) {
        const transformedDocuments = apiResponse.data.documents.map(transformDocument);
        setDocuments(transformedDocuments);
      } else {
        throw new Error('Invalid API response format');
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
      setError(error instanceof Error ? error.message : 'Failed to load documents');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  // Handle search with debouncing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchTerm.trim()) {
        fetchDocumentsWithSearch(searchTerm.trim());
      } else {
        fetchDocuments();
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  // For display purposes, show all documents (already filtered by API)
  const filteredDocuments = documents;

  // Action handlers
  const handleDownload = async (doc: Document) => {
    try {
      setActionLoading(prev => ({ ...prev, [doc.id]: true }));

      const response = await fetch(`/api/v1/knowledge-base/documents/${doc.id}/download`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Download failed');
      }

      // Create blob and download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(`${doc.name} has been downloaded.`);

    } catch (error) {
      console.error('Download error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to download document.');
    } finally {
      setActionLoading(prev => ({ ...prev, [doc.id]: false }));
    }
  };

  const handleReprocess = async () => {
    if (!selectedDocument) return;

    try {
      setActionLoading(prev => ({ ...prev, [selectedDocument.id]: true }));

      const response = await fetch(`/api/v1/knowledge-base/documents/${selectedDocument.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'reprocess',
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || 'Reprocessing failed');
      }

      if (result.success && result.data.success) {
        toast.success(`${selectedDocument.name} has been queued for reprocessing.`);

        // Update document status to processing
        setDocuments(prev => prev.map(doc =>
          doc.id === selectedDocument.id
            ? { ...doc, status: 'processing' as const }
            : doc
        ));

        // Refresh the documents list after a short delay
        setTimeout(() => {
          fetchDocuments();
        }, 2000);
      } else {
        throw new Error(result.data?.message || 'Reprocessing failed');
      }

    } catch (error) {
      console.error('Reprocess error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to reprocess document.');
    } finally {
      setActionLoading(prev => ({ ...prev, [selectedDocument.id]: false }));
      setShowReprocessDialog(false);
      setSelectedDocument(null);
    }
  };

  const handleDelete = async () => {
    if (!selectedDocument) return;

    try {
      setActionLoading(prev => ({ ...prev, [selectedDocument.id]: true }));

      const response = await fetch(`/api/v1/knowledge-base/documents/${selectedDocument.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'delete',
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || 'Deletion failed');
      }

      if (result.success && result.data.success) {
        // Optimistically remove from UI
        setDocuments(prev => prev.filter(doc => doc.id !== selectedDocument.id));

        toast.success(`${selectedDocument.name} has been permanently deleted.`);
      } else {
        throw new Error(result.data?.message || 'Deletion failed');
      }

    } catch (error) {
      console.error('Delete error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete document.');

      // Refresh documents on error to ensure UI consistency
      fetchDocuments();
    } finally {
      setActionLoading(prev => ({ ...prev, [selectedDocument.id]: false }));
      setShowDeleteDialog(false);
      setSelectedDocument(null);
    }
  };

  const openDeleteDialog = (doc: Document) => {
    setSelectedDocument(doc);
    setShowDeleteDialog(true);
  };

  const openReprocessDialog = (doc: Document) => {
    setSelectedDocument(doc);
    setShowReprocessDialog(true);
  };

  const openMetadataDialog = async (doc: Document) => {
    try {
      setSelectedDocument(doc);

      // Fetch full document details including metadata
      const response = await fetch(`/api/v1/knowledge-base/documents/${doc.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch document details');
      }

      const result = await response.json();
      if (result.success) {
        setMetadataForm(result.data);
      } else {
        throw new Error(result.error?.message || 'Failed to load document metadata');
      }

      setShowMetadataDialog(true);
    } catch (error) {
      console.error('Error loading document metadata:', error);
      toast.error(error instanceof Error ? error.message : 'Could not load document metadata for editing.');
    }
  };

  const handleSaveMetadata = async () => {
    if (!selectedDocument) return;

    try {
      setMetadataSaving(true);

      const response = await fetch(`/api/v1/knowledge-base/documents/${selectedDocument.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update_metadata',
          // Basic metadata (JSONB field)
          metadata: {
            category: metadataForm.metadata?.category,
            supplier: metadataForm.metadata?.supplier,
            tags: metadataForm.metadata?.tags,
            description: metadataForm.metadata?.description,
          },
          // Structured metadata fields
          supplierName: metadataForm.supplierName,
          supplierCountry: metadataForm.supplierCountry,
          ingredientName: metadataForm.ingredientName,
          ingredientInciName: metadataForm.ingredientInciName,
          ingredientCasNumber: metadataForm.ingredientCasNumber,
          ragDocumentType: metadataForm.ragDocumentType,
          documentSubtype: metadataForm.documentSubtype,
          complianceTypes: metadataForm.complianceTypes,
          certificationBodies: metadataForm.certificationBodies,
          regulatoryRegions: metadataForm.regulatoryRegions,
          keywords: metadataForm.keywords,
          casNumbers: metadataForm.casNumbers,
          inciNames: metadataForm.inciNames,
          allergens: metadataForm.allergens,
          qualityScore: metadataForm.qualityScore,
          validationStatus: metadataForm.validationStatus,
          language: metadataForm.language,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || 'Failed to update metadata');
      }

      if (result.success) {
        toast.success(`Metadata for "${selectedDocument.name}" has been updated successfully.`);

        // Refresh the documents list to show updated metadata
        fetchDocuments();

        // Close the dialog
        setShowMetadataDialog(false);
        setSelectedDocument(null);
        setMetadataForm({});
      } else {
        throw new Error(result.data?.message || 'Failed to update metadata');
      }

    } catch (error) {
      console.error('Save metadata error:', error);
      toast.error(error instanceof Error ? error.message : 'Could not save metadata changes.');
    } finally {
      setMetadataSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
          <p className="text-muted-foreground">
            Manage your knowledge base documents
          </p>
        </div>
        <Button asChild>
          <a href="/dashboard/documents/upload">
            <Upload className="mr-2 h-4 w-4" />
            Upload Document
          </a>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{documents.length}</div>
            <p className="text-xs text-muted-foreground">
              +2 from last month
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ready</CardTitle>
            <Badge className="bg-green-100 text-green-800">●</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {documents.filter(d => d.status === 'ready').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Available for chatbots
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processing</CardTitle>
            <Badge className="bg-yellow-100 text-yellow-800">●</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {documents.filter(d => d.status === 'processing').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Being processed
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Errors</CardTitle>
            <Badge className="bg-red-100 text-red-800">●</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {documents.filter(d => d.status === 'error').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Need attention
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Document Library</CardTitle>
              <CardDescription>
                All uploaded documents and their processing status
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search documents..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button variant="outline" size="icon">
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center justify-between p-4 border rounded-lg animate-pulse">
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 bg-gray-200 rounded"></div>
                    <div className="space-y-1">
                      <div className="h-4 bg-gray-200 rounded w-48"></div>
                      <div className="h-3 bg-gray-200 rounded w-32"></div>
                    </div>
                  </div>
                  <div className="h-6 bg-gray-200 rounded w-16"></div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <div className="mx-auto h-12 w-12 text-red-500 mb-4">
                <svg className="h-full w-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-red-900 mb-2">Error Loading Documents</h3>
              <p className="text-sm text-red-700 mb-4">{error}</p>
              <Button onClick={fetchDocuments} variant="outline">
                Try Again
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDocuments.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-blue-100 rounded">
                      <FileText className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium">{doc.name}</p>
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <span>{doc.type}</span>
                        <span>•</span>
                        <span>{doc.size}</span>
                        <span>•</span>
                        <span>Uploaded {doc.uploadedAt}</span>
                        <span>•</span>
                        <span>{doc.uploadedBy}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusBadge(doc.status)}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={actionLoading[doc.id]}
                        >
                          {actionLoading[doc.id] ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MoreHorizontal className="h-4 w-4" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleDownload(doc)}
                          disabled={actionLoading[doc.id]}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => openMetadataDialog(doc)}
                          disabled={actionLoading[doc.id]}
                        >
                          <Edit3 className="mr-2 h-4 w-4" />
                          Edit Metadata
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => openReprocessDialog(doc)}
                          disabled={actionLoading[doc.id] || doc.status === 'processing'}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Reprocess
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => openDeleteDialog(doc)}
                          disabled={actionLoading[doc.id]}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
              {filteredDocuments.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No documents found</h3>
                  <p className="text-sm">
                    {searchTerm ? 'No documents match your search. Try adjusting your filters.' : 'Upload your first document to get started.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedDocument?.name}"? This action cannot be undone.
              The document and all its associated data will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false);
                setSelectedDocument(null);
              }}
              disabled={selectedDocument ? actionLoading[selectedDocument.id] : false}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={selectedDocument ? actionLoading[selectedDocument.id] : false}
            >
              {selectedDocument && actionLoading[selectedDocument.id] ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reprocess Confirmation Dialog */}
      <Dialog open={showReprocessDialog} onOpenChange={setShowReprocessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprocess Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to reprocess "{selectedDocument?.name}"? This will regenerate
              the document chunks and embeddings. The existing processed data will be replaced.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowReprocessDialog(false);
                setSelectedDocument(null);
              }}
              disabled={selectedDocument ? actionLoading[selectedDocument.id] : false}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReprocess}
              disabled={selectedDocument ? actionLoading[selectedDocument.id] : false}
            >
              {selectedDocument && actionLoading[selectedDocument.id] ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reprocess
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Metadata Dialog */}
      <Dialog open={showMetadataDialog} onOpenChange={setShowMetadataDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Document Metadata</DialogTitle>
            <DialogDescription>
              Update metadata for "{selectedDocument?.name}". Changes will be saved to the document record.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="supplier">Supplier</TabsTrigger>
              <TabsTrigger value="ingredient">Ingredient</TabsTrigger>
              <TabsTrigger value="compliance">Compliance</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Input
                    id="category"
                    value={metadataForm.metadata?.category || ''}
                    onChange={(e) => setMetadataForm(prev => ({
                      ...prev,
                      metadata: { ...prev.metadata, category: e.target.value }
                    }))}
                    placeholder="Document category"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="language">Language</Label>
                  <Input
                    id="language"
                    value={metadataForm.language || ''}
                    onChange={(e) => setMetadataForm(prev => ({ ...prev, language: e.target.value }))}
                    placeholder="en, th, zh"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="docType">Document Type</Label>
                  <Input
                    id="docType"
                    value={metadataForm.ragDocumentType || ''}
                    onChange={(e) => setMetadataForm(prev => ({ ...prev, ragDocumentType: e.target.value }))}
                    placeholder="COA, TDS, MSDS, Spec"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="docSubtype">Document Subtype</Label>
                  <Input
                    id="docSubtype"
                    value={metadataForm.documentSubtype || ''}
                    onChange={(e) => setMetadataForm(prev => ({ ...prev, documentSubtype: e.target.value }))}
                    placeholder="Halal, Kosher, ISO9001"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qualityScore">Quality Score</Label>
                  <Input
                    id="qualityScore"
                    type="number"
                    min="0"
                    max="100"
                    value={metadataForm.qualityScore || ''}
                    onChange={(e) => setMetadataForm(prev => ({ ...prev, qualityScore: parseInt(e.target.value) }))}
                    placeholder="0-100"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="validationStatus">Validation Status</Label>
                  <Input
                    id="validationStatus"
                    value={metadataForm.validationStatus || ''}
                    onChange={(e) => setMetadataForm(prev => ({ ...prev, validationStatus: e.target.value }))}
                    placeholder="verified, pending, failed"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="keywords">Keywords (comma-separated)</Label>
                <Textarea
                  id="keywords"
                  value={metadataForm.keywords?.join(', ') || ''}
                  onChange={(e) => setMetadataForm(prev => ({
                    ...prev,
                    keywords: e.target.value.split(',').map(k => k.trim()).filter(k => k.length > 0)
                  }))}
                  placeholder="natural, cooling, mint, cosmetic"
                  rows={2}
                />
              </div>
            </TabsContent>

            <TabsContent value="supplier" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="supplierName">Supplier Name</Label>
                  <Input
                    id="supplierName"
                    value={metadataForm.supplierName || ''}
                    onChange={(e) => setMetadataForm(prev => ({ ...prev, supplierName: e.target.value }))}
                    placeholder="BASF, Anhui Great"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supplierCountry">Supplier Country</Label>
                  <Input
                    id="supplierCountry"
                    value={metadataForm.supplierCountry || ''}
                    onChange={(e) => setMetadataForm(prev => ({ ...prev, supplierCountry: e.target.value }))}
                    placeholder="Germany, China, Thailand"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="ingredient" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ingredientName">Ingredient Name</Label>
                  <Input
                    id="ingredientName"
                    value={metadataForm.ingredientName || ''}
                    onChange={(e) => setMetadataForm(prev => ({ ...prev, ingredientName: e.target.value }))}
                    placeholder="Menthol Crystal (Natural)"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ingredientInciName">INCI Name</Label>
                  <Input
                    id="ingredientInciName"
                    value={metadataForm.ingredientInciName || ''}
                    onChange={(e) => setMetadataForm(prev => ({ ...prev, ingredientInciName: e.target.value }))}
                    placeholder="MENTHOL"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ingredientCasNumber">CAS Number</Label>
                  <Input
                    id="ingredientCasNumber"
                    value={metadataForm.ingredientCasNumber || ''}
                    onChange={(e) => setMetadataForm(prev => ({ ...prev, ingredientCasNumber: e.target.value }))}
                    placeholder="89-78-1"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="casNumbers">All CAS Numbers (comma-separated)</Label>
                <Input
                  id="casNumbers"
                  value={metadataForm.casNumbers?.join(', ') || ''}
                  onChange={(e) => setMetadataForm(prev => ({
                    ...prev,
                    casNumbers: e.target.value.split(',').map(c => c.trim()).filter(c => c.length > 0)
                  }))}
                  placeholder="89-78-1, 1490-04-6"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inciNames">All INCI Names (comma-separated)</Label>
                <Input
                  id="inciNames"
                  value={metadataForm.inciNames?.join(', ') || ''}
                  onChange={(e) => setMetadataForm(prev => ({
                    ...prev,
                    inciNames: e.target.value.split(',').map(i => i.trim()).filter(i => i.length > 0)
                  }))}
                  placeholder="MENTHOL, MENTHYL LACTATE"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="allergens">Allergens (comma-separated)</Label>
                <Input
                  id="allergens"
                  value={metadataForm.allergens?.join(', ') || ''}
                  onChange={(e) => setMetadataForm(prev => ({
                    ...prev,
                    allergens: e.target.value.split(',').map(a => a.trim()).filter(a => a.length > 0)
                  }))}
                  placeholder="tree nuts, none"
                />
              </div>
            </TabsContent>

            <TabsContent value="compliance" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="complianceTypes">Compliance Types (comma-separated)</Label>
                <Input
                  id="complianceTypes"
                  value={metadataForm.complianceTypes?.join(', ') || ''}
                  onChange={(e) => setMetadataForm(prev => ({
                    ...prev,
                    complianceTypes: e.target.value.split(',').map(c => c.trim()).filter(c => c.length > 0)
                  }))}
                  placeholder="REACH, Halal, Vegan, GMO-Free, Kosher"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="certificationBodies">Certification Bodies (comma-separated)</Label>
                <Input
                  id="certificationBodies"
                  value={metadataForm.certificationBodies?.join(', ') || ''}
                  onChange={(e) => setMetadataForm(prev => ({
                    ...prev,
                    certificationBodies: e.target.value.split(',').map(c => c.trim()).filter(c => c.length > 0)
                  }))}
                  placeholder="ISO, FSSC22000, BPJPH, MUI, HACCP"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="regulatoryRegions">Regulatory Regions (comma-separated)</Label>
                <Input
                  id="regulatoryRegions"
                  value={metadataForm.regulatoryRegions?.join(', ') || ''}
                  onChange={(e) => setMetadataForm(prev => ({
                    ...prev,
                    regulatoryRegions: e.target.value.split(',').map(r => r.trim()).filter(r => r.length > 0)
                  }))}
                  placeholder="EU, US, ASEAN, Global, Thailand"
                />
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowMetadataDialog(false);
                setSelectedDocument(null);
                setMetadataForm({});
              }}
              disabled={metadataSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveMetadata}
              disabled={metadataSaving}
            >
              {metadataSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}