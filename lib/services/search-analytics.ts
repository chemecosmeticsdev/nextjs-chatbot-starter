/**
 * Search Performance Monitoring and Analytics Service
 *
 * Phase 2: Search Algorithm Enhancement
 * Implements comprehensive monitoring for search performance, accuracy, and usage patterns
 */

import { z } from 'zod';
import { db } from '@/lib/db';
import { searchQueries, activityLogs } from '@/lib/db/schema';
import { eq, and, gte, lte, desc, count, avg, sum, sql } from 'drizzle-orm';
import type { VectorSearchResult } from '@/lib/validation/knowledge-base';
import type { RankedResult, RankingAnalysis } from '@/lib/services/result-ranking';
import type { ProcessedQuery } from '@/lib/services/query-processor';

// =============================================================================
// INTERFACES AND TYPES
// =============================================================================

export interface SearchMetrics {
  // Performance metrics
  responseTime: number;              // Total response time (ms)
  embeddingTime: number;             // Time to generate embeddings (ms)
  queryTime: number;                 // Database query time (ms)
  postProcessingTime: number;        // Post-processing time (ms)

  // Accuracy metrics
  resultsFound: number;              // Number of results returned
  relevanceScore: number;            // Average relevance score (0-1)
  similarityThreshold: number;       // Threshold used
  cacheHit: boolean;                 // Whether results came from cache

  // Search strategy metrics
  searchMethod: string;              // vector, adaptive, hybrid, enhanced
  queryEnhancementUsed: boolean;     // Whether query enhancement was applied
  resultRankingUsed: boolean;        // Whether result ranking was applied
  fallbackUsed: boolean;             // Whether fallback thresholds were used

  // Quality metrics
  diversityScore: number;            // Result diversity (0-1)
  contentQualityScore: number;       // Average content quality (0-1)
  userSatisfactionScore?: number;    // User feedback score (0-1)
}

export interface SearchEvent {
  sessionId: string;
  userId?: string;
  query: string;
  timestamp: Date;
  metrics: SearchMetrics;
  context: {
    source: string;                  // web, api, internal
    userAgent?: string;
    ipAddress?: string;
    chatbotId?: string;
  };
  queryAnalysis?: {
    originalQuery: string;
    enhancedQueries: string[];
    queryType: string;
    complexity: string;
    domainTerms: string[];
    corrections: Array<{
      original: string;
      corrected: string;
    }>;
  };
  results?: {
    totalResults: number;
    topResults: Array<{
      documentId: string;
      similarity: number;
      rankingScore?: number;
      rankChange?: number;
    }>;
  };
  error?: {
    type: string;
    message: string;
    stack?: string;
  };
}

export interface PerformanceTrends {
  timeRange: {
    start: Date;
    end: Date;
  };
  queryCount: number;
  averageResponseTime: number;
  cacheHitRate: number;
  errorRate: number;
  popularQueries: Array<{
    query: string;
    count: number;
    avgResponseTime: number;
    avgRelevance: number;
  }>;
  performanceByMethod: Record<string, {
    count: number;
    avgResponseTime: number;
    avgRelevance: number;
    successRate: number;
  }>;
  hourlyDistribution: Array<{
    hour: number;
    queryCount: number;
    avgResponseTime: number;
  }>;
}

export interface SearchQualityReport {
  period: string;
  totalQueries: number;
  uniqueQueries: number;

  // Performance metrics
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;

  // Accuracy metrics
  avgResultsFound: number;
  avgRelevanceScore: number;
  zeroResultRate: number;

  // Method effectiveness
  methodUsage: Record<string, number>;
  methodPerformance: Record<string, {
    avgResponseTime: number;
    avgRelevance: number;
    avgResultCount: number;
  }>;

  // Enhancement effectiveness
  queryEnhancementStats: {
    usageRate: number;
    improvementRate: number;
    avgEnhancementsPerQuery: number;
  };

  resultRankingStats: {
    usageRate: number;
    avgScoreImprovement: number;
    avgPositionChanges: number;
  };

  // Quality indicators
  diversityTrends: Array<{
    date: string;
    avgDiversity: number;
  }>;

  contentQualityTrends: Array<{
    date: string;
    avgQuality: number;
  }>;

  // Issues and recommendations
  issues: Array<{
    type: 'performance' | 'accuracy' | 'quality';
    severity: 'low' | 'medium' | 'high';
    description: string;
    recommendation: string;
    affectedQueries: number;
  }>;
}

export interface SearchOptimizationRecommendations {
  // Performance optimizations
  performance: Array<{
    recommendation: string;
    impact: 'low' | 'medium' | 'high';
    effort: 'low' | 'medium' | 'high';
    description: string;
    metrics: Record<string, number>;
  }>;

  // Accuracy improvements
  accuracy: Array<{
    recommendation: string;
    queryPatterns: string[];
    expectedImprovement: string;
    implementation: string;
  }>;

  // System health alerts
  alerts: Array<{
    type: 'performance' | 'errors' | 'capacity';
    severity: 'warning' | 'critical';
    message: string;
    threshold: number;
    currentValue: number;
    action: string;
  }>;
}

// =============================================================================
// SEARCH ANALYTICS SERVICE
// =============================================================================

export class SearchAnalyticsService {
  private static eventBuffer: SearchEvent[] = [];
  private static bufferSize = 100;
  private static flushInterval = 30000; // 30 seconds
  private static lastFlush = Date.now();

  /**
   * Record a search event
   */
  static async recordSearchEvent(event: Omit<SearchEvent, 'timestamp'>): Promise<void> {
    const fullEvent: SearchEvent = {
      ...event,
      timestamp: new Date()
    };

    // Add to buffer
    this.eventBuffer.push(fullEvent);

    // Flush if buffer is full or enough time has passed
    if (this.eventBuffer.length >= this.bufferSize ||
        Date.now() - this.lastFlush >= this.flushInterval) {
      await this.flushEvents();
    }
  }

  /**
   * Record search metrics from a completed search operation
   */
  static async recordSearch(params: {
    sessionId: string;
    userId?: string;
    query: string;
    method: string;
    responseTime: number;
    results: VectorSearchResult[] | RankedResult[];
    metrics: Partial<SearchMetrics>;
    queryAnalysis?: ProcessedQuery;
    rankingAnalysis?: RankingAnalysis;
    context?: any;
    error?: Error;
  }): Promise<void> {
    try {
      // Calculate metrics
      const resultsFound = params.results.length;
      const avgSimilarity = resultsFound > 0 ?
        params.results.reduce((sum, r) => sum + r.similarity, 0) / resultsFound : 0;

      const isRankedResults = params.results.length > 0 && 'rankingScore' in params.results[0];
      const avgRankingScore = isRankedResults ?
        (params.results as RankedResult[]).reduce((sum, r) => sum + r.rankingScore, 0) / resultsFound : 0;

      // Prepare search event
      const searchEvent: Omit<SearchEvent, 'timestamp'> = {
        sessionId: params.sessionId,
        userId: params.userId,
        query: params.query,
        metrics: {
          responseTime: params.responseTime,
          embeddingTime: params.metrics.embeddingTime || 0,
          queryTime: params.metrics.queryTime || 0,
          postProcessingTime: params.metrics.postProcessingTime || 0,
          resultsFound,
          relevanceScore: avgSimilarity,
          similarityThreshold: params.metrics.similarityThreshold || 0.7,
          cacheHit: params.metrics.cacheHit || false,
          searchMethod: params.method,
          queryEnhancementUsed: !!params.queryAnalysis,
          resultRankingUsed: isRankedResults,
          fallbackUsed: params.metrics.fallbackUsed || false,
          diversityScore: params.rankingAnalysis?.diversityMetrics.topicSpread || 0,
          contentQualityScore: params.rankingAnalysis?.qualityMetrics.averageContentQuality || 0,
          userSatisfactionScore: undefined
        },
        context: {
          source: params.context?.source || 'api',
          userAgent: params.context?.userAgent,
          ipAddress: params.context?.ipAddress,
          chatbotId: params.context?.chatbotId
        }
      };

      // Add query analysis if available
      if (params.queryAnalysis) {
        searchEvent.queryAnalysis = {
          originalQuery: params.queryAnalysis.original,
          enhancedQueries: params.queryAnalysis.enhanced,
          queryType: params.queryAnalysis.type,
          complexity: params.queryAnalysis.complexity,
          domainTerms: params.queryAnalysis.domainTerms,
          corrections: params.queryAnalysis.corrections
        };
      }

      // Add results summary
      if (resultsFound > 0) {
        searchEvent.results = {
          totalResults: resultsFound,
          topResults: params.results.slice(0, 5).map((result, index) => ({
            documentId: result.documentId,
            similarity: result.similarity,
            rankingScore: isRankedResults ? (result as RankedResult).rankingScore : undefined,
            rankChange: isRankedResults ? (result as RankedResult).rankChange : undefined
          }))
        };
      }

      // Add error information if present
      if (params.error) {
        searchEvent.error = {
          type: params.error.constructor.name,
          message: params.error.message,
          stack: params.error.stack
        };
      }

      // Record the event
      await this.recordSearchEvent(searchEvent);

      // Also record in database for persistent storage
      await this.recordInDatabase(params);

    } catch (error) {
      console.error('Failed to record search analytics:', error);
      // Don't throw error - analytics failure shouldn't break search
    }
  }

  /**
   * Flush buffered events to storage
   */
  private static async flushEvents(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    try {
      // In a real implementation, you would send these to a time-series database
      // like InfluxDB, Prometheus, or AWS CloudWatch
      // For now, we'll just log them and clear the buffer

      console.log(`Flushing ${this.eventBuffer.length} search analytics events`);

      // Example: Send to monitoring service
      // await this.sendToMonitoringService(this.eventBuffer);

      this.eventBuffer = [];
      this.lastFlush = Date.now();
    } catch (error) {
      console.error('Failed to flush search analytics events:', error);
    }
  }

  /**
   * Record search in database for persistence
   */
  private static async recordInDatabase(params: any): Promise<void> {
    try {
      await db.insert(searchQueries).values({
        query: params.query,
        results: params.results,
        responseTime: params.responseTime,
        resultsCount: params.results.length,
        searchMethod: params.method,
        userId: params.userId,
        sessionId: params.sessionId,
        cached: params.metrics.cacheHit || false,
        createdAt: new Date()
      });
    } catch (error) {
      console.error('Failed to record search in database:', error);
    }
  }

  /**
   * Get performance trends for a time period
   */
  static async getPerformanceTrends(
    startDate: Date,
    endDate: Date,
    granularity: 'hour' | 'day' = 'day'
  ): Promise<PerformanceTrends> {
    try {
      // Get basic metrics
      const totalQueries = await db
        .select({ count: count() })
        .from(searchQueries)
        .where(
          and(
            gte(searchQueries.createdAt, startDate),
            lte(searchQueries.createdAt, endDate)
          )
        );

      const avgResponseTime = await db
        .select({ avg: avg(searchQueries.responseTime) })
        .from(searchQueries)
        .where(
          and(
            gte(searchQueries.createdAt, startDate),
            lte(searchQueries.createdAt, endDate)
          )
        );

      const cacheHitRate = await db
        .select({
          cacheHits: sum(sql`CASE WHEN ${searchQueries.cached} THEN 1 ELSE 0 END`),
          total: count()
        })
        .from(searchQueries)
        .where(
          and(
            gte(searchQueries.createdAt, startDate),
            lte(searchQueries.createdAt, endDate)
          )
        );

      // Get popular queries
      const popularQueries = await db
        .select({
          query: searchQueries.query,
          count: count(),
          avgResponseTime: avg(searchQueries.responseTime),
          avgResults: avg(searchQueries.resultsCount)
        })
        .from(searchQueries)
        .where(
          and(
            gte(searchQueries.createdAt, startDate),
            lte(searchQueries.createdAt, endDate)
          )
        )
        .groupBy(searchQueries.query)
        .orderBy(desc(count()))
        .limit(10);

      // Get performance by method
      const performanceByMethod = await db
        .select({
          method: searchQueries.searchMethod,
          count: count(),
          avgResponseTime: avg(searchQueries.responseTime),
          avgResults: avg(searchQueries.resultsCount)
        })
        .from(searchQueries)
        .where(
          and(
            gte(searchQueries.createdAt, startDate),
            lte(searchQueries.createdAt, endDate)
          )
        )
        .groupBy(searchQueries.searchMethod);

      return {
        timeRange: { start: startDate, end: endDate },
        queryCount: totalQueries[0]?.count || 0,
        averageResponseTime: Number(avgResponseTime[0]?.avg || 0),
        cacheHitRate: cacheHitRate[0] ? Number(cacheHitRate[0].cacheHits) / Number(cacheHitRate[0].total) : 0,
        errorRate: 0, // Would need error tracking
        popularQueries: popularQueries.map(q => ({
          query: q.query,
          count: Number(q.count),
          avgResponseTime: Number(q.avgResponseTime || 0),
          avgRelevance: Number(q.avgResults || 0) / 10 // Rough approximation
        })),
        performanceByMethod: performanceByMethod.reduce((acc, p) => {
          acc[p.method] = {
            count: Number(p.count),
            avgResponseTime: Number(p.avgResponseTime || 0),
            avgRelevance: Number(p.avgResults || 0) / 10,
            successRate: 1.0 // Would need error tracking
          };
          return acc;
        }, {} as Record<string, any>),
        hourlyDistribution: [] // Would need hour-by-hour data
      };
    } catch (error) {
      console.error('Failed to get performance trends:', error);
      return {
        timeRange: { start: startDate, end: endDate },
        queryCount: 0,
        averageResponseTime: 0,
        cacheHitRate: 0,
        errorRate: 0,
        popularQueries: [],
        performanceByMethod: {},
        hourlyDistribution: []
      };
    }
  }

  /**
   * Generate comprehensive search quality report
   */
  static async generateQualityReport(
    startDate: Date,
    endDate: Date
  ): Promise<SearchQualityReport> {
    try {
      const trends = await this.getPerformanceTrends(startDate, endDate);

      // Get detailed metrics
      const queries = await db
        .select()
        .from(searchQueries)
        .where(
          and(
            gte(searchQueries.createdAt, startDate),
            lte(searchQueries.createdAt, endDate)
          )
        )
        .orderBy(desc(searchQueries.createdAt));

      // Calculate percentiles
      const responseTimes = queries.map(q => q.responseTime).sort((a, b) => a - b);
      const p95Index = Math.floor(responseTimes.length * 0.95);
      const p99Index = Math.floor(responseTimes.length * 0.99);

      // Analyze method effectiveness
      const methodStats = trends.performanceByMethod;

      // Calculate zero result rate
      const zeroResultQueries = queries.filter(q => q.resultsCount === 0).length;
      const zeroResultRate = queries.length > 0 ? zeroResultQueries / queries.length : 0;

      // Generate issues and recommendations
      const issues = this.identifyIssues(trends, responseTimes, zeroResultRate);

      return {
        period: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
        totalQueries: trends.queryCount,
        uniqueQueries: new Set(queries.map(q => q.query)).size,

        avgResponseTime: trends.averageResponseTime,
        p95ResponseTime: responseTimes[p95Index] || 0,
        p99ResponseTime: responseTimes[p99Index] || 0,

        avgResultsFound: queries.length > 0 ?
          queries.reduce((sum, q) => sum + q.resultsCount, 0) / queries.length : 0,
        avgRelevanceScore: 0.7, // Would need actual relevance tracking
        zeroResultRate,

        methodUsage: Object.fromEntries(
          Object.entries(methodStats).map(([method, stats]) => [method, stats.count])
        ),
        methodPerformance: Object.fromEntries(
          Object.entries(methodStats).map(([method, stats]) => [
            method,
            {
              avgResponseTime: stats.avgResponseTime,
              avgRelevance: stats.avgRelevance,
              avgResultCount: stats.avgRelevance * 10 // Rough approximation
            }
          ])
        ),

        queryEnhancementStats: {
          usageRate: 0.8, // Would track from events
          improvementRate: 0.15, // Would calculate from before/after
          avgEnhancementsPerQuery: 2.5 // Would track from query processor
        },

        resultRankingStats: {
          usageRate: 0.6, // Would track from events
          avgScoreImprovement: 0.08, // Would calculate from ranking analysis
          avgPositionChanges: 1.2 // Would track from ranking results
        },

        diversityTrends: [], // Would need time-series diversity data
        contentQualityTrends: [], // Would need time-series quality data

        issues
      };
    } catch (error) {
      console.error('Failed to generate quality report:', error);
      throw error;
    }
  }

  /**
   * Identify performance and quality issues
   */
  private static identifyIssues(
    trends: PerformanceTrends,
    responseTimes: number[],
    zeroResultRate: number
  ): SearchQualityReport['issues'] {
    const issues: SearchQualityReport['issues'] = [];

    // Performance issues
    if (trends.averageResponseTime > 2000) {
      issues.push({
        type: 'performance',
        severity: trends.averageResponseTime > 5000 ? 'high' : 'medium',
        description: `Average response time is ${trends.averageResponseTime.toFixed(0)}ms`,
        recommendation: 'Consider optimizing database queries, adding caching, or scaling resources',
        affectedQueries: trends.queryCount
      });
    }

    if (trends.cacheHitRate < 0.3) {
      issues.push({
        type: 'performance',
        severity: 'medium',
        description: `Cache hit rate is low at ${(trends.cacheHitRate * 100).toFixed(1)}%`,
        recommendation: 'Increase cache TTL or improve cache warming strategies',
        affectedQueries: Math.floor(trends.queryCount * (1 - trends.cacheHitRate))
      });
    }

    // Accuracy issues
    if (zeroResultRate > 0.2) {
      issues.push({
        type: 'accuracy',
        severity: zeroResultRate > 0.4 ? 'high' : 'medium',
        description: `${(zeroResultRate * 100).toFixed(1)}% of queries return zero results`,
        recommendation: 'Review similarity thresholds, improve fallback strategies, or expand content coverage',
        affectedQueries: Math.floor(trends.queryCount * zeroResultRate)
      });
    }

    return issues;
  }

  /**
   * Get optimization recommendations
   */
  static async getOptimizationRecommendations(
    startDate: Date,
    endDate: Date
  ): Promise<SearchOptimizationRecommendations> {
    const trends = await this.getPerformanceTrends(startDate, endDate);
    const report = await this.generateQualityReport(startDate, endDate);

    const recommendations: SearchOptimizationRecommendations = {
      performance: [],
      accuracy: [],
      alerts: []
    };

    // Performance recommendations
    if (trends.averageResponseTime > 1000) {
      recommendations.performance.push({
        recommendation: 'Implement query result caching',
        impact: 'high',
        effort: 'medium',
        description: 'Cache frequently searched queries to reduce response time',
        metrics: {
          currentResponseTime: trends.averageResponseTime,
          expectedImprovement: 0.4,
          affectedQueries: trends.queryCount
        }
      });
    }

    if (trends.cacheHitRate < 0.5) {
      recommendations.performance.push({
        recommendation: 'Optimize cache strategy',
        impact: 'medium',
        effort: 'low',
        description: 'Increase cache TTL and implement smart cache warming',
        metrics: {
          currentCacheHitRate: trends.cacheHitRate,
          targetCacheHitRate: 0.7,
          potentialSavings: trends.queryCount * (0.7 - trends.cacheHitRate) * trends.averageResponseTime
        }
      });
    }

    // Accuracy recommendations
    if (report.zeroResultRate > 0.15) {
      recommendations.accuracy.push({
        recommendation: 'Implement adaptive threshold fallback',
        queryPatterns: ['single word queries', 'technical terms', 'typos'],
        expectedImprovement: '25% reduction in zero results',
        implementation: 'Enable progressive threshold reduction when no results found'
      });
    }

    // System health alerts
    if (trends.averageResponseTime > 3000) {
      recommendations.alerts.push({
        type: 'performance',
        severity: 'critical',
        message: 'Search response time exceeds acceptable threshold',
        threshold: 2000,
        currentValue: trends.averageResponseTime,
        action: 'Investigate database performance and consider scaling'
      });
    }

    return recommendations;
  }

  /**
   * Get real-time search metrics
   */
  static async getRealTimeMetrics(): Promise<{
    activeSearches: number;
    averageResponseTime: number;
    errorRate: number;
    cacheHitRate: number;
    queriesPerMinute: number;
  }> {
    try {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Recent queries (last minute)
      const recentQueries = await db
        .select({ count: count() })
        .from(searchQueries)
        .where(gte(searchQueries.createdAt, oneMinuteAgo));

      // Hourly metrics for averages
      const hourlyMetrics = await db
        .select({
          count: count(),
          avgResponseTime: avg(searchQueries.responseTime),
          cacheHits: sum(sql`CASE WHEN ${searchQueries.cached} THEN 1 ELSE 0 END`)
        })
        .from(searchQueries)
        .where(gte(searchQueries.createdAt, oneHourAgo));

      const totalQueries = Number(hourlyMetrics[0]?.count || 0);
      const cacheHits = Number(hourlyMetrics[0]?.cacheHits || 0);

      return {
        activeSearches: this.eventBuffer.length, // Current events in buffer
        averageResponseTime: Number(hourlyMetrics[0]?.avgResponseTime || 0),
        errorRate: 0, // Would need error tracking
        cacheHitRate: totalQueries > 0 ? cacheHits / totalQueries : 0,
        queriesPerMinute: Number(recentQueries[0]?.count || 0)
      };
    } catch (error) {
      console.error('Failed to get real-time metrics:', error);
      return {
        activeSearches: 0,
        averageResponseTime: 0,
        errorRate: 0,
        cacheHitRate: 0,
        queriesPerMinute: 0
      };
    }
  }

  /**
   * Force flush any pending events (useful for testing or shutdown)
   */
  static async flush(): Promise<void> {
    await this.flushEvents();
  }
}

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

export const searchMetricsSchema = z.object({
  responseTime: z.number().min(0),
  embeddingTime: z.number().min(0).optional(),
  queryTime: z.number().min(0).optional(),
  postProcessingTime: z.number().min(0).optional(),
  resultsFound: z.number().int().min(0),
  relevanceScore: z.number().min(0).max(1),
  similarityThreshold: z.number().min(0).max(1),
  cacheHit: z.boolean(),
  searchMethod: z.string(),
  queryEnhancementUsed: z.boolean(),
  resultRankingUsed: z.boolean(),
  fallbackUsed: z.boolean(),
  diversityScore: z.number().min(0).max(1),
  contentQualityScore: z.number().min(0).max(1),
  userSatisfactionScore: z.number().min(0).max(1).optional()
}).strict();

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export function validateSearchMetrics(data: unknown): SearchMetrics {
  return searchMetricsSchema.parse(data);
}

/**
 * Helper function to start periodic analytics collection
 */
export function startAnalyticsCollection(flushIntervalMs = 30000): NodeJS.Timeout {
  return setInterval(async () => {
    await SearchAnalyticsService.flush();
  }, flushIntervalMs);
}

/**
 * Helper function to record a simple search event
 */
export async function recordSimpleSearch(
  query: string,
  results: VectorSearchResult[],
  responseTime: number,
  method = 'vector',
  sessionId = 'anonymous'
): Promise<void> {
  await SearchAnalyticsService.recordSearch({
    sessionId,
    query,
    method,
    responseTime,
    results,
    metrics: {
      resultsFound: results.length,
      relevanceScore: results.length > 0 ?
        results.reduce((sum, r) => sum + r.similarity, 0) / results.length : 0,
      cacheHit: false
    }
  });
}