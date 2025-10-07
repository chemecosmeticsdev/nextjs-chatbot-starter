"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Plus,
  Upload,
  Link,
  Database,
  FileText,
  Globe,
  Trash2,
  RefreshCw,
  Search,
  Filter,
  MoreVertical,
  Download,
  Eye,
  Edit,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Brain,
  Zap,
  BarChart3
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface KnowledgeSource {
  id: string;
  name: string;
  type: "file" | "url" | "database" | "api";
  status: "active" | "inactive" | "processing" | "error";
  source: string;
  description?: string;
  lastSync: string;
  documentCount: number;
  chunks: number;
  size: string;
  embedding_model: string;
  sync_frequency: "manual" | "hourly" | "daily" | "weekly";
  auto_sync: boolean;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

interface ProcessingStats {
  totalDocuments: number;
  processedDocuments: number;
  totalChunks: number;
  embeddingProgress: number;
  indexingProgress: number;
  estimatedTimeRemaining: number;
}

const sourceTypeIcons = {
  file: FileText,
  url: Globe,
  database: Database,
  api: Link,
};

const statusColors = {
  active: "bg-green-500",
  inactive: "bg-gray-500",
  processing: "bg-blue-500",
  error: "bg-red-500",
};

const statusLabels = {
  active: "Active",
  inactive: "Inactive",
  processing: "Processing",
  error: "Error",
};

export default function KnowledgeSourcesPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const chatbotId = params.id as string;

  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [processingStats, setProcessingStats] = useState<ProcessingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newSourceType, setNewSourceType] = useState<string>("file");
  const [syncing, setSyncing] = useState<string[]>([]);

  useEffect(() => {
    fetchKnowledgeSources();
    fetchProcessingStats();
  }, [chatbotId]);

  const fetchKnowledgeSources = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/v1/chatbots/${chatbotId}/knowledge-sources`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      setSources(data.sources || []);
    } catch (error) {
      console.error("Failed to fetch knowledge sources:", error);
      toast({
        title: "Error",
        description: "Failed to load knowledge sources. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchProcessingStats = async () => {
    try {
      const response = await fetch(`/api/v1/chatbots/${chatbotId}/knowledge-sources/stats`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      setProcessingStats(data);
    } catch (error) {
      console.error("Failed to fetch processing stats:", error);
    }
  };

  const handleSyncSource = async (sourceId: string) => {
    try {
      setSyncing(prev => [...prev, sourceId]);
      const response = await fetch(`/api/v1/chatbots/${chatbotId}/knowledge-sources/${sourceId}/sync`, {
        method: "POST",
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      toast({
        title: "Success",
        description: "Knowledge source sync started successfully.",
      });

      // Update source status
      setSources(prev => prev.map(source =>
        source.id === sourceId
          ? { ...source, status: "processing" as const }
          : source
      ));

      // Refresh data after a delay
      setTimeout(() => {
        fetchKnowledgeSources();
        fetchProcessingStats();
      }, 2000);
    } catch (error) {
      console.error("Failed to sync source:", error);
      toast({
        title: "Error",
        description: "Failed to sync knowledge source. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSyncing(prev => prev.filter(id => id !== sourceId));
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    try {
      const response = await fetch(`/api/v1/chatbots/${chatbotId}/knowledge-sources/${sourceId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      setSources(prev => prev.filter(source => source.id !== sourceId));
      toast({
        title: "Success",
        description: "Knowledge source deleted successfully.",
      });
    } catch (error) {
      console.error("Failed to delete source:", error);
      toast({
        title: "Error",
        description: "Failed to delete knowledge source. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleBulkAction = async (action: string) => {
    if (selectedSources.length === 0) return;

    try {
      const response = await fetch(`/api/v1/chatbots/${chatbotId}/knowledge-sources/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          sourceIds: selectedSources,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      toast({
        title: "Success",
        description: `Bulk ${action} completed successfully.`,
      });

      setSelectedSources([]);
      fetchKnowledgeSources();
    } catch (error) {
      console.error(`Failed to perform bulk ${action}:`, error);
      toast({
        title: "Error",
        description: `Failed to perform bulk ${action}. Please try again.`,
        variant: "destructive",
      });
    }
  };

  const filteredSources = sources.filter(source => {
    const matchesSearch = source.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         source.source.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === "all" || source.type === typeFilter;
    const matchesStatus = statusFilter === "all" || source.status === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  const formatFileSize = (bytes: string) => {
    const size = parseInt(bytes);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const formatLastSync = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 1) return "Just now";
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="container max-w-7xl mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-5 w-96" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="container max-w-7xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Brain className="h-6 w-6" />
              Knowledge Sources
            </h1>
            <p className="text-muted-foreground">
              Manage documents, URLs, and data sources that train your chatbot
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedSources.length > 0 && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    Bulk Actions ({selectedSources.length})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => handleBulkAction("sync")}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Sync All
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBulkAction("activate")}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Activate All
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBulkAction("deactivate")}>
                    <XCircle className="h-4 w-4 mr-2" />
                    Deactivate All
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleBulkAction("delete")}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete All
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Separator orientation="vertical" className="h-6" />
            </>
          )}
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Source
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Knowledge Source</DialogTitle>
                <DialogDescription>
                  Add a new source of knowledge for your chatbot
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Source Type</Label>
                  <Select value={newSourceType} onValueChange={setNewSourceType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="file">File Upload</SelectItem>
                      <SelectItem value="url">Website/URL</SelectItem>
                      <SelectItem value="database">Database</SelectItem>
                      <SelectItem value="api">API Endpoint</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setShowAddDialog(false)}>
                  Continue
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Sources</p>
                <p className="text-2xl font-bold">{sources.length}</p>
              </div>
              <Database className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Sources</p>
                <p className="text-2xl font-bold">
                  {sources.filter(s => s.status === "active").length}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Documents</p>
                <p className="text-2xl font-bold">
                  {sources.reduce((acc, s) => acc + s.documentCount, 0).toLocaleString()}
                </p>
              </div>
              <FileText className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Chunks</p>
                <p className="text-2xl font-bold">
                  {sources.reduce((acc, s) => acc + s.chunks, 0).toLocaleString()}
                </p>
              </div>
              <Zap className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Processing Status */}
      {processingStats && (processingStats.embeddingProgress < 100 || processingStats.indexingProgress < 100) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Processing Status
            </CardTitle>
            <CardDescription>
              Current knowledge processing and indexing progress
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Embedding Progress</span>
                  <span>{processingStats.embeddingProgress}%</span>
                </div>
                <Progress value={processingStats.embeddingProgress} />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Indexing Progress</span>
                  <span>{processingStats.indexingProgress}%</span>
                </div>
                <Progress value={processingStats.indexingProgress} />
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>
                {processingStats.processedDocuments} / {processingStats.totalDocuments} documents processed
              </span>
              {processingStats.estimatedTimeRemaining > 0 && (
                <span>
                  • {Math.ceil(processingStats.estimatedTimeRemaining / 60)} minutes remaining
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters and Search */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search knowledge sources..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="file">Files</SelectItem>
                  <SelectItem value="url">URLs</SelectItem>
                  <SelectItem value="database">Database</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Knowledge Sources List */}
      <Card>
        <CardHeader>
          <CardTitle>Knowledge Sources</CardTitle>
          <CardDescription>
            {filteredSources.length} of {sources.length} sources
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredSources.length === 0 ? (
            <div className="text-center py-12">
              <Database className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No knowledge sources found</h3>
              <p className="text-muted-foreground mb-4">
                {sources.length === 0
                  ? "Get started by adding your first knowledge source."
                  : "Try adjusting your search or filter criteria."
                }
              </p>
              {sources.length === 0 && (
                <Button onClick={() => setShowAddDialog(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Knowledge Source
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSources.map((source) => {
                const IconComponent = sourceTypeIcons[source.type];
                const isSelected = selectedSources.includes(source.id);
                const isSyncing = syncing.includes(source.id);

                return (
                  <div
                    key={source.id}
                    className={`border rounded-lg p-4 transition-colors ${
                      isSelected ? "bg-muted/50 border-primary" : "hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSources(prev => [...prev, source.id]);
                              } else {
                                setSelectedSources(prev => prev.filter(id => id !== source.id));
                              }
                            }}
                            className="rounded"
                          />
                          <div className="relative">
                            <IconComponent className="h-8 w-8 text-muted-foreground" />
                            <div
                              className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-background ${
                                statusColors[source.status]
                              }`}
                            />
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold truncate">{source.name}</h3>
                            <Badge variant="outline" className="text-xs">
                              {source.type.toUpperCase()}
                            </Badge>
                            <Badge
                              variant={source.status === "active" ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {statusLabels[source.status]}
                            </Badge>
                          </div>

                          <p className="text-sm text-muted-foreground truncate mb-2">
                            {source.source}
                          </p>

                          {source.description && (
                            <p className="text-sm text-muted-foreground mb-2">
                              {source.description}
                            </p>
                          )}

                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>{source.documentCount.toLocaleString()} docs</span>
                            <span>{source.chunks.toLocaleString()} chunks</span>
                            <span>{formatFileSize(source.size)}</span>
                            <span>Last sync: {formatLastSync(source.lastSync)}</span>
                            {source.auto_sync && (
                              <Badge variant="outline" className="text-xs">
                                Auto-sync {source.sync_frequency}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {source.status === "processing" && (
                          <div className="flex items-center gap-2 text-sm text-blue-600">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            Processing
                          </div>
                        )}

                        {source.status === "error" && (
                          <div className="flex items-center gap-2 text-sm text-red-600">
                            <AlertTriangle className="h-4 w-4" />
                            Error
                          </div>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSyncSource(source.id)}
                          disabled={isSyncing || source.status === "processing"}
                          className="gap-2"
                        >
                          {isSyncing ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          Sync
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Settings
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Download className="h-4 w-4 mr-2" />
                              Export Data
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDeleteSource(source.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}