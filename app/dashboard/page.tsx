"use client";

import { WidgetStatsCard } from "@/components/dashboard/widget-stats-card";
import { LiveMetricsCard } from "@/components/dashboard/live-metrics-card";
import { ChatbotPerformanceCard } from "@/components/dashboard/chatbot-performance-card";
import { SystemHealthCard } from "@/components/dashboard/system-health-card";
import { QuickActionsCard } from "@/components/dashboard/quick-actions-card";
import { ActivityFeedCard } from "@/components/dashboard/activity-feed-card";

export default function DashboardPage() {
  return (
    <div className="flex flex-col space-y-6">
      {/* Welcome Section */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to your chatbot management dashboard. Monitor performance, manage chatbots, and track analytics.
        </p>
      </div>

      {/* Modern Dashboard Cards Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Top Row - Key Metrics */}
        <WidgetStatsCard className="col-span-1" />
        <LiveMetricsCard className="col-span-1" />
        <ChatbotPerformanceCard className="col-span-1" />

        {/* Second Row - System Status & Actions */}
        <SystemHealthCard className="col-span-1" />
        <QuickActionsCard className="col-span-1" />

        {/* Activity Feed - Full Width on smaller screens, spans remaining space */}
        <ActivityFeedCard className="col-span-1 lg:col-span-1" />
      </div>
    </div>
  );
}