'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Shield,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Flag,
  Eye,
  MessageSquare,
  Settings,
  BarChart3,
  Search,
  Filter,
  RefreshCw,
  Download,
  Plus,
  Edit,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';

interface ModerationViolation {
  id: string;
  messageId: string;
  ruleName: string;
  ruleType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'approved' | 'rejected' | 'escalated' | 'resolved';
  confidenceScore: number;
  originalContent: string;
  flaggedContent?: string;
  userIdentifier: string;
  chatbotId: string;
  createdAt: string;
  adminNotes?: string;
}

interface ModerationRule {
  id: string;
  name: string;
  description?: string;
  ruleType: 'profanity' | 'spam' | 'toxicity' | 'custom_pattern' | 'ai_detection';
  severityLevel: 'low' | 'medium' | 'high' | 'critical';
  isActive: boolean;
  autoAction: string;
  createdAt: string;
}

interface ModerationStats {
  totalViolations: number;
  pendingReviews: number;
  resolvedToday: number;
  criticalAlerts: number;
  autoBlocked: number;
  falsePositives: number;
  averageResponseTime: number;
  topViolationType: string;
}

export default function ModerationDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [violations, setViolations] = useState<ModerationViolation[]>([]);
  const [rules, setRules] = useState<ModerationRule[]>([]);
  const [stats, setStats] = useState<ModerationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedViolation, setSelectedViolation] = useState<ModerationViolation | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<ModerationRule | null>(null);

  // Filters
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Form states
  const [reviewAction, setReviewAction] = useState<string>('');
  const [reviewNotes, setReviewNotes] = useState('');

  useEffect(() => {
    loadModerationData();
  }, []);

  const loadModerationData = async () => {
    setLoading(true);
    try {
      // Load violations, rules, and stats
      await Promise.all([
        loadViolations(),
        loadRules(),
        loadStats()
      ]);
    } catch (error) {
      toast.error('Failed to load moderation data');
      console.error('Error loading moderation data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadViolations = async () => {
    // Simulate API call - in production, this would fetch from /api/v1/moderation/violations
    const mockViolations: ModerationViolation[] = [
      {
        id: '1',
        messageId: 'msg_001',
        ruleName: 'Profanity Filter',
        ruleType: 'profanity',
        severity: 'high',
        status: 'pending',
        confidenceScore: 95,
        originalContent: 'This is inappropriate content that was flagged',
        flaggedContent: 'inappropriate',
        userIdentifier: '192.168.1.1:user123',
        chatbotId: 'chatbot_001',
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        messageId: 'msg_002',
        ruleName: 'Spam Detection',
        ruleType: 'spam',
        severity: 'medium',
        status: 'approved',
        confidenceScore: 78,
        originalContent: 'Click here now! Limited time offer!!!',
        flaggedContent: 'Limited time offer!!!',
        userIdentifier: '192.168.1.2:user456',
        chatbotId: 'chatbot_002',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        adminNotes: 'Confirmed spam pattern'
      }
    ];
    setViolations(mockViolations);
  };

  const loadRules = async () => {
    // Simulate API call - in production, this would fetch from /api/v1/moderation/rules
    const mockRules: ModerationRule[] = [
      {
        id: '1',
        name: 'Profanity Filter',
        description: 'Blocks inappropriate language',
        ruleType: 'profanity',
        severityLevel: 'high',
        isActive: true,
        autoAction: 'block',
        createdAt: new Date().toISOString()
      },
      {
        id: '2',
        name: 'Spam Detection',
        description: 'Detects promotional and spam content',
        ruleType: 'spam',
        severityLevel: 'medium',
        isActive: true,
        autoAction: 'flag',
        createdAt: new Date().toISOString()
      }
    ];
    setRules(mockRules);
  };

  const loadStats = async () => {
    // Simulate API call - in production, this would fetch from /api/v1/moderation/stats
    const mockStats: ModerationStats = {
      totalViolations: 127,
      pendingReviews: 8,
      resolvedToday: 15,
      criticalAlerts: 2,
      autoBlocked: 45,
      falsePositives: 3,
      averageResponseTime: 24.5,
      topViolationType: 'profanity'
    };
    setStats(mockStats);
  };

  const handleReviewViolation = async () => {
    if (!selectedViolation || !reviewAction) return;

    try {
      // In production, this would call /api/v1/moderation/violations/{id}/review
      console.log('Reviewing violation:', {
        violationId: selectedViolation.id,
        action: reviewAction,
        notes: reviewNotes
      });

      toast.success(`Violation ${reviewAction} successfully`);
      setReviewDialogOpen(false);
      setSelectedViolation(null);
      setReviewAction('');
      setReviewNotes('');
      await loadViolations();
    } catch (error) {
      toast.error('Failed to review violation');
      console.error('Error reviewing violation:', error);
    }
  };

  const getSeverityBadge = (severity: string) => {
    const colors = {
      low: 'bg-blue-100 text-blue-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-orange-100 text-orange-800',
      critical: 'bg-red-100 text-red-800'
    };
    return (
      <Badge className={colors[severity as keyof typeof colors] || colors.low}>
        {severity}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      pending: 'bg-gray-100 text-gray-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      escalated: 'bg-purple-100 text-purple-800',
      resolved: 'bg-blue-100 text-blue-800'
    };
    return (
      <Badge className={colors[status as keyof typeof colors] || colors.pending}>
        {status}
      </Badge>
    );
  };

  const filteredViolations = violations.filter(violation => {
    const matchesSeverity = severityFilter === 'all' || violation.severity === severityFilter;
    const matchesStatus = statusFilter === 'all' || violation.status === statusFilter;
    const matchesSearch = !searchQuery ||
      violation.originalContent.toLowerCase().includes(searchQuery.toLowerCase()) ||
      violation.ruleName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      violation.userIdentifier.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSeverity && matchesStatus && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Content Moderation</h1>
          <p className="text-muted-foreground">
            Manage content violations and moderation rules
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadModerationData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button>
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingReviews}</div>
              <p className="text-xs text-muted-foreground">
                Awaiting admin review
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Critical Alerts</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.criticalAlerts}</div>
              <p className="text-xs text-muted-foreground">
                Require immediate attention
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Resolved Today</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.resolvedToday}</div>
              <p className="text-xs text-muted-foreground">
                +{Math.round((stats.resolvedToday / stats.totalViolations) * 100)}% of total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Response Time</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.averageResponseTime}h</div>
              <p className="text-xs text-muted-foreground">
                Average resolution time
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="violations">Violations</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Recent Violations */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Violations</CardTitle>
              <CardDescription>
                Latest content violations requiring attention
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {violations.slice(0, 5).map((violation) => (
                  <div key={violation.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{violation.ruleName}</p>
                          {getSeverityBadge(violation.severity)}
                          {getStatusBadge(violation.status)}
                        </div>
                        <p className="text-sm text-muted-foreground truncate max-w-md">
                          {violation.originalContent}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {violation.userIdentifier} • {new Date(violation.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedViolation(violation);
                        setReviewDialogOpen(true);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Review
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="violations" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filter Violations</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-4">
              <div className="flex-1">
                <Input
                  placeholder="Search violations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-sm"
                />
              </div>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="escalated">Escalated</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Violations Table */}
          <Card>
            <CardHeader>
              <CardTitle>All Violations ({filteredViolations.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredViolations.map((violation) => (
                    <TableRow key={violation.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{violation.ruleName}</p>
                          <p className="text-sm text-muted-foreground">{violation.ruleType}</p>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="truncate">{violation.originalContent}</p>
                        {violation.flaggedContent && (
                          <p className="text-sm text-red-600">
                            Flagged: {violation.flaggedContent}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{getSeverityBadge(violation.severity)}</TableCell>
                      <TableCell>{getStatusBadge(violation.status)}</TableCell>
                      <TableCell>{violation.confidenceScore}%</TableCell>
                      <TableCell>{new Date(violation.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedViolation(violation);
                            setReviewDialogOpen(true);
                          }}
                        >
                          Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          {/* Rules Management */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Moderation Rules</CardTitle>
                <CardDescription>
                  Configure content moderation rules and policies
                </CardDescription>
              </div>
              <Button onClick={() => setRuleDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Rule
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{rule.name}</p>
                          <p className="text-sm text-muted-foreground">{rule.description}</p>
                        </div>
                      </TableCell>
                      <TableCell>{rule.ruleType}</TableCell>
                      <TableCell>{getSeverityBadge(rule.severityLevel)}</TableCell>
                      <TableCell>{rule.autoAction}</TableCell>
                      <TableCell>
                        <Badge className={rule.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                          {rule.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedRule(rule);
                              setRuleDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Moderation Analytics</CardTitle>
              <CardDescription>
                Insights and trends in content moderation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Analytics dashboard would be implemented here with charts showing:
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>• Violation trends over time</li>
                <li>• Rule effectiveness metrics</li>
                <li>• Response time analytics</li>
                <li>• False positive rates</li>
                <li>• User behavior patterns</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Review Violation Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Violation</DialogTitle>
            <DialogDescription>
              Review and take action on this content violation
            </DialogDescription>
          </DialogHeader>

          {selectedViolation && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium">Rule:</span>
                  <span>{selectedViolation.ruleName}</span>
                  {getSeverityBadge(selectedViolation.severity)}
                </div>
                <div className="mb-2">
                  <span className="font-medium">Confidence:</span>
                  <span className="ml-2">{selectedViolation.confidenceScore}%</span>
                </div>
                <div>
                  <span className="font-medium">Original Content:</span>
                  <p className="mt-1 p-2 bg-background rounded border">
                    {selectedViolation.originalContent}
                  </p>
                </div>
                {selectedViolation.flaggedContent && (
                  <div>
                    <span className="font-medium text-red-600">Flagged Content:</span>
                    <p className="mt-1 p-2 bg-red-50 rounded border border-red-200">
                      {selectedViolation.flaggedContent}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="action">Review Action</Label>
                  <Select value={reviewAction} onValueChange={setReviewAction}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approve">Approve Violation</SelectItem>
                      <SelectItem value="reject">Reject (False Positive)</SelectItem>
                      <SelectItem value="escalate">Escalate to Senior Admin</SelectItem>
                      <SelectItem value="resolve">Mark as Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="notes">Admin Notes</Label>
                  <Textarea
                    id="notes"
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Add notes about your decision..."
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleReviewViolation} disabled={!reviewAction}>
              Submit Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}