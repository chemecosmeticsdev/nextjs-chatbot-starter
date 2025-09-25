'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FileText, Upload, Search, Filter, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Document {
  id: string;
  name: string;
  type: string;
  size: string;
  uploadedAt: string;
  status: 'processing' | 'ready' | 'error';
  uploadedBy: string;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading documents
    setTimeout(() => {
      setDocuments([
        {
          id: '1',
          name: 'Product Catalog 2024.pdf',
          type: 'PDF',
          size: '2.4 MB',
          uploadedAt: '2024-01-15',
          status: 'ready',
          uploadedBy: 'admin@company.com'
        },
        {
          id: '2',
          name: 'User Manual v2.docx',
          type: 'DOCX',
          size: '1.8 MB',
          uploadedAt: '2024-01-14',
          status: 'processing',
          uploadedBy: 'user@company.com'
        },
        {
          id: '3',
          name: 'FAQ Database.txt',
          type: 'TXT',
          size: '156 KB',
          uploadedAt: '2024-01-13',
          status: 'ready',
          uploadedBy: 'admin@company.com'
        },
        {
          id: '4',
          name: 'Training Data.json',
          type: 'JSON',
          size: '892 KB',
          uploadedAt: '2024-01-12',
          status: 'error',
          uploadedBy: 'admin@company.com'
        }
      ]);
      setLoading(false);
    }, 1000);
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

  const filteredDocuments = documents.filter(doc =>
    doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Download</DropdownMenuItem>
                        <DropdownMenuItem>Reprocess</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
              {filteredDocuments.length === 0 && (
                <div className="text-center py-8">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-2 text-sm font-medium">No documents found</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {searchTerm ? 'No documents match your search.' : 'Upload your first document to get started.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}