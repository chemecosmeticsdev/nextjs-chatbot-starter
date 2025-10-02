import { AnalyticsService } from './analytics';
import type { UserActivityEvent } from '@/lib/validation/analytics';

interface SessionData {
  sessionId: string;
  userId?: string;
  chatbotId: string;
  startTime: Date;
  lastActivity: Date;
  messageCount: number;
  events: Array<{
    type: string;
    timestamp: Date;
    data?: any;
  }>;
}

interface TrackingConfig {
  enableAutoTracking: boolean;
  trackPerformanceMetrics: boolean;
  sessionTimeoutMinutes: number;
  batchEvents: boolean;
  batchSize: number;
  flushIntervalMs: number;
}

export class ActivityTracker {
  private static sessions = new Map<string, SessionData>();
  private static eventQueue: UserActivityEvent[] = [];
  private static config: TrackingConfig = {
    enableAutoTracking: true,
    trackPerformanceMetrics: true,
    sessionTimeoutMinutes: 30,
    batchEvents: true,
    batchSize: 10,
    flushIntervalMs: 5000
  };
  private static flushTimer: NodeJS.Timeout | null = null;

  /**
   * Initialize the activity tracker with configuration
   */
  static initialize(config: Partial<TrackingConfig> = {}) {
    this.config = { ...this.config, ...config };

    if (this.config.batchEvents) {
      this.startBatchTimer();
    }

    // Clean up expired sessions periodically
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000); // Check every minute
  }

  /**
   * Start a new user session
   */
  static async startSession(sessionId: string, chatbotId: string, userId?: string): Promise<void> {
    const sessionData: SessionData = {
      sessionId,
      userId,
      chatbotId,
      startTime: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      events: []
    };

    this.sessions.set(sessionId, sessionData);

    await this.trackEvent({
      sessionId,
      chatbotId,
      userId,
      eventType: 'session_start',
      timestamp: new Date().toISOString(),
      eventData: {
        userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined
      }
    });
  }

  /**
   * End a user session
   */
  static async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`Session ${sessionId} not found for ending`);
      return;
    }

    const duration = Date.now() - session.startTime.getTime();

    await this.trackEvent({
      sessionId,
      chatbotId: session.chatbotId,
      userId: session.userId,
      eventType: 'session_end',
      timestamp: new Date().toISOString(),
      eventData: {
        duration,
        messageCount: session.messageCount,
        eventCount: session.events.length
      }
    });

    this.sessions.delete(sessionId);
  }

  /**
   * Track a message sent event
   */
  static async trackMessageSent(
    sessionId: string,
    messageContent: string,
    responseTime?: number
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`Session ${sessionId} not found for message tracking`);
      return;
    }

    session.messageCount++;
    session.lastActivity = new Date();
    session.events.push({
      type: 'message_sent',
      timestamp: new Date(),
      data: { length: messageContent.length, responseTime }
    });

    await this.trackEvent({
      sessionId,
      chatbotId: session.chatbotId,
      userId: session.userId,
      eventType: 'message_sent',
      timestamp: new Date().toISOString(),
      eventData: {
        messageLength: messageContent.length,
        messageCount: session.messageCount
      },
      responseTime
    });
  }

  /**
   * Track a message received event
   */
  static async trackMessageReceived(
    sessionId: string,
    responseContent: string,
    responseTime: number,
    knowledgeBaseUsed: boolean = false,
    sourceDocuments?: Array<{ documentId: string; similarity: number }>
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`Session ${sessionId} not found for response tracking`);
      return;
    }

    session.lastActivity = new Date();
    session.events.push({
      type: 'message_received',
      timestamp: new Date(),
      data: {
        length: responseContent.length,
        responseTime,
        knowledgeBaseUsed,
        sourceDocumentCount: sourceDocuments?.length || 0
      }
    });

    await this.trackEvent({
      sessionId,
      chatbotId: session.chatbotId,
      userId: session.userId,
      eventType: 'message_received',
      timestamp: new Date().toISOString(),
      eventData: {
        responseLength: responseContent.length,
        knowledgeBaseUsed,
        sourceDocumentCount: sourceDocuments?.length || 0,
        sourceDocuments
      },
      responseTime
    });
  }

  /**
   * Track knowledge base search event
   */
  static async trackKnowledgeSearch(
    sessionId: string,
    searchQuery: string,
    resultCount: number,
    searchTime: number
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`Session ${sessionId} not found for knowledge search tracking`);
      return;
    }

    session.lastActivity = new Date();
    session.events.push({
      type: 'knowledge_search',
      timestamp: new Date(),
      data: { query: searchQuery, resultCount, searchTime }
    });

    await this.trackEvent({
      sessionId,
      chatbotId: session.chatbotId,
      userId: session.userId,
      eventType: 'knowledge_search',
      timestamp: new Date().toISOString(),
      eventData: {
        searchQuery,
        resultCount,
        searchTime
      },
      responseTime: searchTime
    });
  }

  /**
   * Track document access event
   */
  static async trackDocumentAccess(
    sessionId: string,
    documentId: string,
    documentName: string,
    accessType: 'view' | 'download' = 'view'
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`Session ${sessionId} not found for document access tracking`);
      return;
    }

    session.lastActivity = new Date();
    session.events.push({
      type: 'document_accessed',
      timestamp: new Date(),
      data: { documentId, documentName, accessType }
    });

    await this.trackEvent({
      sessionId,
      chatbotId: session.chatbotId,
      userId: session.userId,
      eventType: 'document_accessed',
      timestamp: new Date().toISOString(),
      eventData: {
        documentId,
        documentName,
        accessType
      }
    });
  }

  /**
   * Track error occurrence
   */
  static async trackError(
    sessionId: string,
    errorType: string,
    errorMessage: string,
    errorStack?: string
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`Session ${sessionId} not found for error tracking`);
      return;
    }

    session.lastActivity = new Date();
    session.events.push({
      type: 'error_occurred',
      timestamp: new Date(),
      data: { errorType, errorMessage, errorStack }
    });

    await this.trackEvent({
      sessionId,
      chatbotId: session.chatbotId,
      userId: session.userId,
      eventType: 'error_occurred',
      timestamp: new Date().toISOString(),
      eventData: {
        errorType,
        errorMessage,
        errorStack: errorStack?.substring(0, 1000) // Limit stack trace length
      }
    });
  }

  /**
   * Track user feedback
   */
  static async trackFeedback(
    sessionId: string,
    feedbackType: 'positive' | 'negative' | 'rating',
    feedbackValue: string | number,
    feedbackComment?: string
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`Session ${sessionId} not found for feedback tracking`);
      return;
    }

    session.lastActivity = new Date();
    session.events.push({
      type: 'feedback_provided',
      timestamp: new Date(),
      data: { feedbackType, feedbackValue, feedbackComment }
    });

    await this.trackEvent({
      sessionId,
      chatbotId: session.chatbotId,
      userId: session.userId,
      eventType: 'feedback_provided',
      timestamp: new Date().toISOString(),
      eventData: {
        feedbackType,
        feedbackValue,
        feedbackComment
      }
    });
  }

  /**
   * Track custom event
   */
  static async trackCustomEvent(
    sessionId: string,
    eventType: string,
    eventData: Record<string, any>
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`Session ${sessionId} not found for custom event tracking`);
      return;
    }

    session.lastActivity = new Date();
    session.events.push({
      type: eventType,
      timestamp: new Date(),
      data: eventData
    });

    // For custom events, use the generic message_sent type in the analytics schema
    await this.trackEvent({
      sessionId,
      chatbotId: session.chatbotId,
      userId: session.userId,
      eventType: 'message_sent', // Map to a valid enum value
      timestamp: new Date().toISOString(),
      eventData: {
        customEventType: eventType,
        ...eventData
      }
    });
  }

  /**
   * Get session statistics
   */
  static getSessionStats(sessionId: string): {
    duration: number;
    messageCount: number;
    eventCount: number;
    lastActivity: Date;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      duration: Date.now() - session.startTime.getTime(),
      messageCount: session.messageCount,
      eventCount: session.events.length,
      lastActivity: session.lastActivity
    };
  }

  /**
   * Get all active sessions
   */
  static getActiveSessions(): Array<{
    sessionId: string;
    userId?: string;
    chatbotId: string;
    startTime: Date;
    messageCount: number;
    duration: number;
  }> {
    return Array.from(this.sessions.values()).map(session => ({
      sessionId: session.sessionId,
      userId: session.userId,
      chatbotId: session.chatbotId,
      startTime: session.startTime,
      messageCount: session.messageCount,
      duration: Date.now() - session.startTime.getTime()
    }));
  }

  /**
   * Update session activity (extends session timeout)
   */
  static updateSessionActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
  }

  /**
   * Flush all pending events
   */
  static async flushEvents(): Promise<void> {
    if (this.eventQueue.length === 0) {
      return;
    }

    const eventsToFlush = [...this.eventQueue];
    this.eventQueue = [];

    try {
      await Promise.all(
        eventsToFlush.map(event => AnalyticsService.trackUserActivity(event))
      );
      console.log(`Flushed ${eventsToFlush.length} analytics events`);
    } catch (error) {
      console.error('Error flushing analytics events:', error);
      // Re-queue failed events
      this.eventQueue.unshift(...eventsToFlush);
    }
  }

  // Private methods

  private static async trackEvent(event: UserActivityEvent): Promise<void> {
    if (!this.config.enableAutoTracking) {
      return;
    }

    if (this.config.batchEvents) {
      this.eventQueue.push(event);

      if (this.eventQueue.length >= this.config.batchSize) {
        await this.flushEvents();
      }
    } else {
      try {
        await AnalyticsService.trackUserActivity(event);
      } catch (error) {
        console.error('Error tracking event:', error);
      }
    }
  }

  private static startBatchTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(async () => {
      await this.flushEvents();
    }, this.config.flushIntervalMs);
  }

  private static cleanupExpiredSessions(): void {
    const now = Date.now();
    const timeoutMs = this.config.sessionTimeoutMinutes * 60 * 1000;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity.getTime() > timeoutMs) {
        console.log(`Cleaning up expired session: ${sessionId}`);
        this.endSession(sessionId).catch(error => {
          console.error(`Error ending expired session ${sessionId}:`, error);
        });
      }
    }
  }

  /**
   * Shutdown the activity tracker
   */
  static async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // End all active sessions
    const activeSessions = Array.from(this.sessions.keys());
    await Promise.all(
      activeSessions.map(sessionId => this.endSession(sessionId))
    );

    // Flush any remaining events
    await this.flushEvents();
  }
}