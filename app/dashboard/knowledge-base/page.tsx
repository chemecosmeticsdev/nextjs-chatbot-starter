'use client';

import { useState, useEffect } from 'react';
import { useBreadcrumbs } from '@/lib/hooks/use-breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search,
  Upload,
  FileText,
  Database,
  BarChart3,
  RefreshCw,
  Filter,
  Download,
  Trash2,
  Settings,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Eye,
  MoreHorizontal
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Document {
  id: string;
  title: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  metadata: {
    category?: string;
    supplier?: string;
    tags?: string[];
  };
  chunkCount: number;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

interface KnowledgeBaseStats {
  totalDocuments: number;
  totalChunks: number;
  avgChunksPerDocument: number;
  documentsByCategory: Record<string, number>;
  documentsBySupplier: Record<string, number>;
  processingStats: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  storageStats: {
    totalSizeBytes: number;
    avgDocumentSize: number;
  };
}

interface SearchResult {
  documentId: string;
  chunkId: string;
  content: string;
  similarity: number;
  metadata: {
    documentName?: string;
    category?: string;
    supplier?: string;
    tags?: string[];
    chunkIndex?: number;
  };
}

export default function KnowledgeBasePage() {
  // Set up breadcrumbs for Knowledge Base page
  useBreadcrumbs({
    autoGenerate: true,
    trackAnalytics: false,
    customTitles: {
      'knowledge-base': 'Knowledge Base'
    }
  });

  const [activeTab, setActiveTab] = useState('search');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [stats, setStats] = useState<KnowledgeBaseStats | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchFilters, setSearchFilters] = useState({
    categories: [] as string[],
    documentTypes: [] as string[],
    threshold: 0.7
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(20);

  useEffect(() => {
    fetchDocuments();
    fetchStats();
  }, [currentPage, statusFilter, categoryFilter]);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: limit.toString()
      });

      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      if (categoryFilter !== 'all') {
        params.append('category', categoryFilter);
      }

      const response = await fetch(`/api/v1/knowledge-base/documents?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      if (!response.ok) {
        // Enhanced error handling for server errors
        if (response.status === 500) {
          throw new Error(`Internal Server Error: The knowledge base service is temporarily unavailable. Please try again.`);
        } else if (response.status === 404) {
          throw new Error(`Knowledge base endpoint not found. Please check the API configuration.`);
        } else {
          throw new Error(`Failed to fetch documents: ${response.statusText} (${response.status})`);
        }
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to load documents');
      }

      // Add defensive programming for documents array
      const documents = Array.isArray(data.data?.documents) ? data.data.documents : [];
      const pagination = data.data?.pagination || { totalPages: 1 };

      setDocuments(documents);
      setTotalPages(pagination.totalPages || 1);
    } catch (err: any) {
      console.error('Error fetching documents:', err);
      setError(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/v1/knowledge-base/stats?type=general', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStats(data.data.stats);
        }
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const performSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      setSearchLoading(true);
      setError(null);

      const response = await fetch('/api/v1/knowledge-base/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          query: searchQuery,
          limit: 20,
          threshold: searchFilters.threshold,
          filters: {
            categories: searchFilters.categories.length > 0 ? searchFilters.categories : undefined,
            documentTypes: searchFilters.documentTypes.length > 0 ? searchFilters.documentTypes : undefined
          },
          includeContent: true,
          cacheResults: true
        })
      });

      if (!response.ok) {
        // Enhanced error handling for search failures
        if (response.status === 500) {
          throw new Error(`Search service temporarily unavailable. Please try again.`);
        } else if (response.status === 404) {
          throw new Error(`Search endpoint not found. Please check the API configuration.`);
        } else {
          throw new Error(`Search failed: ${response.statusText} (${response.status})`);
        }
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Search failed');
      }

      // Add defensive programming for search results
      const results = Array.isArray(data.data?.results) ? data.data.results : [];
      setSearchResults(results);
    } catch (err: any) {
      console.error('Error performing search:', err);
      setError(err.message || 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'processing':
        return <Clock className="h-4 w-4 text-blue-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case 'processing':
        return <Badge className="bg-blue-100 text-blue-800">Processing</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      default:
        return <Badge>Unknown</Badge>;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Knowledge Base</h1>
          <p className="text-muted-foreground">
            Manage documents and perform vector similarity searches
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchDocuments}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button>
            <Upload className="mr-2 h-4 w-4" />
            Upload Document
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error}
            <Button
              variant="outline"
              size="sm"
              className="ml-2"
              onClick={() => {
                setError(null);
                // Enhanced retry logic with specific tab handling
                if (activeTab === 'documents') {
                  fetchDocuments();
                } else if (activeTab === 'search') {
                  // Retry search if there was a search query
                  if (searchQuery.trim()) {
                    performSearch();
                  }
                } else {
                  fetchStats();
                }
              }}
            >
              Try Again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Statistics Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalDocuments}</div>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(stats.storageStats.totalSizeBytes)} total
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Chunks</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalChunks}</div>
              <p className="text-xs text-muted-foreground">
                {stats.avgChunksPerDocument} avg per document
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Processing Status</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {stats.processingStats.completed}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.processingStats.processing} processing, {stats.processingStats.failed} failed
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Size</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatFileSize(stats.storageStats.avgDocumentSize)}
              </div>
              <p className="text-xs text-muted-foreground">
                Per document
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="search">Vector Search</TabsTrigger>
          <TabsTrigger value="documents">Document Management</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Vector Similarity Search</CardTitle>
              <CardDescription>
                Search through document chunks using semantic similarity
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter your search query..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && performSearch()}
                  className="flex-1"
                />
                <Button onClick={performSearch} disabled={searchLoading}>
                  <Search className="mr-2 h-4 w-4" />
                  {searchLoading ? 'Searching...' : 'Search'}
                </Button>
              </div>

              <div className="flex gap-2">
                <Select value={searchFilters.threshold.toString()} onValueChange={(value) =>
                  setSearchFilters(prev => ({ ...prev, threshold: parseFloat(value) }))
                }>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.5">50% Match</SelectItem>
                    <SelectItem value="0.6">60% Match</SelectItem>
                    <SelectItem value="0.7">70% Match</SelectItem>
                    <SelectItem value="0.8">80% Match</SelectItem>
                    <SelectItem value="0.9">90% Match</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm">
                  <Filter className="mr-2 h-4 w-4" />
                  Filters
                </Button>
              </div>

              {/* Search Results */}
              <div className="space-y-3">
                {searchResults.map((result, index) => (
                  <Card key={`${result.chunkId}-${index}`} className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-medium">{result.metadata.documentName}</h4>
                        <div className="flex gap-2 text-sm text-muted-foreground">
                          <span>Similarity: {(result.similarity * 100).toFixed(1)}%</span>
                          {result.metadata.category && (
                            <Badge variant="outline">{result.metadata.category}</Badge>
                          )}
                          {result.metadata.supplier && (
                            <Badge variant="outline">{result.metadata.supplier}</Badge>
                          )}
                        </div>
                      </div>
                      <Badge variant="secondary">
                        Chunk {result.metadata.chunkIndex || 0}
                      </Badge>
                    </div>
                    <p className="text-sm leading-relaxed">{result.content}</p>
                  </Card>
                ))}

                {searchResults.length === 0 && searchQuery && !searchLoading && (
                  <div className="text-center py-8 text-muted-foreground">
                    No results found for "{searchQuery}"
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Document Management</CardTitle>
                  <CardDescription>
                    View and manage documents in your knowledge base
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {stats && Object.keys(stats.documentsByCategory).map(category => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-16 bg-gray-200 rounded"></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {documents.map((doc) => (
                    <Card key={doc.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(doc.processingStatus)}
                          <div>
                            <h4 className="font-medium">{doc.title}</h4>
                            <div className="flex gap-2 text-sm text-muted-foreground">
                              <span>{doc.filename}</span>
                              <span>•</span>
                              <span>{formatFileSize(doc.fileSize)}</span>
                              <span>•</span>
                              <span>{doc.chunkCount} chunks</span>
                              <span>•</span>
                              <span>Uploaded {formatDate(doc.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(doc.processingStatus)}
                          {doc.metadata?.category && (
                            <Badge variant="outline">{doc.metadata.category}</Badge>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Reprocess
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Download className="mr-2 h-4 w-4" />
                                Download
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Settings className="mr-2 h-4 w-4" />
                                Edit Metadata
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </Card>
                  ))}

                  {documents.length === 0 && !loading && (
                    <div className="text-center py-8 text-muted-foreground">
                      No documents found
                    </div>
                  )}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage <= 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage >= totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Knowledge Base Analytics</CardTitle>
              <CardDescription>
                Performance metrics and usage statistics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                Analytics dashboard coming soon...
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}