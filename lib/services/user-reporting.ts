import { db } from '@/lib/db';
import {
  messageFeedback,
  contentModerationViolations,
  contentModerationReviews,
  contentModerationAppeals,
  chatbotMessages,
  users
} from '@/lib/db/schema';
import type {
  NewContentModerationViolation,
  NewContentModerationReview,
  NewContentModerationAppeal
} from '@/lib/db/schema';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { AuditLogger, SecurityEventType } from '@/lib/security/audit-logger';

export interface UserReportData {
  messageId: string;
  reportCategory: 'spam' | 'inappropriate' | 'harassment' | 'misinformation' | 'offensive_language' | 'privacy_violation' | 'copyright' | 'other';
  reportReason: string;
  additionalDetails?: string;
  userIdentifier: string;
  userId?: string;
  chatbotId: string;
  conversationId: string;
}

export interface AppealData {
  violationId: string;
  appealReason: string;
  additionalContext?: string;
  userId?: string;
  userIdentifier: string;
}

export interface ReportResponse {
  success: boolean;
  reportId: string;
  status: 'received' | 'under_review' | 'resolved';
  estimatedReviewTime?: string;
  message: string;
}

export interface AppealResponse {
  success: boolean;
  appealId: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected';
  message: string;
}

/**
 * Enhanced User Reporting and Feedback Service
 * Handles user reports, appeals, and feedback management
 */
export class UserReportingService {

  /**
   * Submit a user report for inappropriate content
   */
  static async submitReport(reportData: UserReportData): Promise<ReportResponse> {
    try {
      // Validate the message exists
      const message = await db
        .select()
        .from(chatbotMessages)
        .where(eq(chatbotMessages.id, reportData.messageId))
        .limit(1);

      if (message.length === 0) {
        throw new Error('Message not found');
      }

      // Check for duplicate reports from same user
      const existingReport = await db
        .select()
        .from(messageFeedback)
        .where(
          and(
            eq(messageFeedback.messageId, reportData.messageId),
            eq(messageFeedback.userIdentifier, reportData.userIdentifier),
            eq(messageFeedback.feedbackType, 'inappropriate')
          )
        )
        .limit(1);

      if (existingReport.length > 0) {
        return {
          success: false,
          reportId: existingReport[0].id,
          status: 'received',
          message: 'You have already reported this message'
        };
      }

      // Create feedback record
      const [feedback] = await db
        .insert(messageFeedback)
        .values({
          messageId: reportData.messageId,
          feedbackType: 'inappropriate',
          feedbackText: this.formatReportText(reportData),
          userIdentifier: reportData.userIdentifier
        })
        .returning();

      // Create a moderation violation for review
      const violation: NewContentModerationViolation = {
        messageId: reportData.messageId,
        ruleId: await this.getReportingRuleId(), // Special rule for user reports
        userId: reportData.userId || null,
        chatbotId: reportData.chatbotId,
        violationType: 'custom_pattern', // Use custom_pattern for user reports
        severity: this.categorizeReportSeverity(reportData.reportCategory),
        confidenceScore: 100, // User reports have 100% confidence
        originalContent: message[0].content,
        flaggedContent: reportData.reportReason,
        userIdentifier: reportData.userIdentifier,
        status: 'pending'
      };

      const [createdViolation] = await db
        .insert(contentModerationViolations)
        .values(violation)
        .returning();

      // Create review record for admin attention
      const review: NewContentModerationReview = {
        violationId: createdViolation.id,
        reviewStatus: 'pending'
      };

      await db.insert(contentModerationReviews).values(review);

      // Log the report
      await AuditLogger.logSecurityEvent({
        userId: reportData.userId,
        eventType: SecurityEventType.INVALID_INPUT,
        severity: 'info',
        details: {
          action: 'user_report_submitted',
          messageId: reportData.messageId,
          reportCategory: reportData.reportCategory,
          chatbotId: reportData.chatbotId,
          violationId: createdViolation.id
        }
      });

      // Determine estimated review time based on severity
      const estimatedReviewTime = this.getEstimatedReviewTime(violation.severity);

      return {
        success: true,
        reportId: feedback.id,
        status: 'under_review',
        estimatedReviewTime,
        message: 'Thank you for your report. Our moderation team will review it shortly.'
      };

    } catch (error) {
      console.error('Error submitting user report:', error);
      throw new Error('Failed to submit report');
    }
  }

  /**
   * Submit an appeal for a content moderation decision
   */
  static async submitAppeal(appealData: AppealData): Promise<AppealResponse> {
    try {
      // Validate violation exists
      const violation = await db
        .select()
        .from(contentModerationViolations)
        .where(eq(contentModerationViolations.id, appealData.violationId))
        .limit(1);

      if (violation.length === 0) {
        throw new Error('Violation not found');
      }

      // Check if violation is appealable
      if (violation[0].status === 'resolved' || violation[0].status === 'rejected') {
        throw new Error('This violation cannot be appealed');
      }

      // Check for existing appeal
      const existingAppeal = await db
        .select()
        .from(contentModerationAppeals)
        .where(eq(contentModerationAppeals.violationId, appealData.violationId))
        .limit(1);

      if (existingAppeal.length > 0) {
        return {
          success: false,
          appealId: existingAppeal[0].id,
          status: existingAppeal[0].status,
          message: 'An appeal has already been submitted for this violation'
        };
      }

      // Create appeal record
      const appeal: NewContentModerationAppeal = {
        violationId: appealData.violationId,
        userId: appealData.userId || null,
        userIdentifier: appealData.userIdentifier,
        appealReason: appealData.appealReason,
        additionalContext: appealData.additionalContext || null,
        status: 'pending'
      };

      const [createdAppeal] = await db
        .insert(contentModerationAppeals)
        .values(appeal)
        .returning();

      // Update violation status to indicate appeal
      await db
        .update(contentModerationViolations)
        .set({ status: 'escalated' })
        .where(eq(contentModerationViolations.id, appealData.violationId));

      // Log the appeal
      await AuditLogger.logSecurityEvent({
        userId: appealData.userId,
        eventType: SecurityEventType.INVALID_INPUT,
        severity: 'info',
        details: {
          action: 'appeal_submitted',
          violationId: appealData.violationId,
          appealId: createdAppeal.id
        }
      });

      return {
        success: true,
        appealId: createdAppeal.id,
        status: 'pending',
        message: 'Your appeal has been submitted and will be reviewed by our team'
      };

    } catch (error) {
      console.error('Error submitting appeal:', error);
      throw new Error('Failed to submit appeal');
    }
  }

  /**
   * Get user's report history
   */
  static async getUserReports(
    userIdentifier: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{
    reports: any[];
    total: number;
  }> {
    try {
      const limit = options?.limit || 20;
      const offset = options?.offset || 0;

      // Get reports (feedback records marked as inappropriate)
      const reports = await db
        .select({
          id: messageFeedback.id,
          messageId: messageFeedback.messageId,
          feedbackText: messageFeedback.feedbackText,
          createdAt: messageFeedback.createdAt,
          messageContent: chatbotMessages.content
        })
        .from(messageFeedback)
        .leftJoin(chatbotMessages, eq(messageFeedback.messageId, chatbotMessages.id))
        .where(
          and(
            eq(messageFeedback.userIdentifier, userIdentifier),
            eq(messageFeedback.feedbackType, 'inappropriate')
          )
        )
        .orderBy(desc(messageFeedback.createdAt))
        .limit(limit)
        .offset(offset);

      // Get total count
      const [{ count: total }] = await db
        .select({ count: count() })
        .from(messageFeedback)
        .where(
          and(
            eq(messageFeedback.userIdentifier, userIdentifier),
            eq(messageFeedback.feedbackType, 'inappropriate')
          )
        );

      return { reports, total };

    } catch (error) {
      console.error('Error getting user reports:', error);
      return { reports: [], total: 0 };
    }
  }

  /**
   * Get user's appeals history
   */
  static async getUserAppeals(
    userIdentifier: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{
    appeals: any[];
    total: number;
  }> {
    try {
      const limit = options?.limit || 20;
      const offset = options?.offset || 0;

      // Get appeals with violation details
      const appeals = await db
        .select({
          id: contentModerationAppeals.id,
          violationId: contentModerationAppeals.violationId,
          appealReason: contentModerationAppeals.appealReason,
          additionalContext: contentModerationAppeals.additionalContext,
          status: contentModerationAppeals.status,
          adminResponse: contentModerationAppeals.adminResponse,
          createdAt: contentModerationAppeals.createdAt,
          reviewedAt: contentModerationAppeals.reviewedAt,
          violationSeverity: contentModerationViolations.severity,
          originalContent: contentModerationViolations.originalContent
        })
        .from(contentModerationAppeals)
        .leftJoin(
          contentModerationViolations,
          eq(contentModerationAppeals.violationId, contentModerationViolations.id)
        )
        .where(eq(contentModerationAppeals.userIdentifier, userIdentifier))
        .orderBy(desc(contentModerationAppeals.createdAt))
        .limit(limit)
        .offset(offset);

      // Get total count
      const [{ count: total }] = await db
        .select({ count: count() })
        .from(contentModerationAppeals)
        .where(eq(contentModerationAppeals.userIdentifier, userIdentifier));

      return { appeals, total };

    } catch (error) {
      console.error('Error getting user appeals:', error);
      return { appeals: [], total: 0 };
    }
  }

  /**
   * Get reporting statistics for analytics
   */
  static async getReportingStats(
    timeframe?: { startDate: Date; endDate: Date }
  ): Promise<{
    totalReports: number;
    reportsByCategory: Record<string, number>;
    totalAppeals: number;
    appealSuccessRate: number;
    averageReviewTime: number;
    topReportedChatbots: Array<{ chatbotId: string; reportCount: number }>;
  }> {
    try {
      // This would implement comprehensive analytics
      // For now, return mock data structure

      return {
        totalReports: 0,
        reportsByCategory: {},
        totalAppeals: 0,
        appealSuccessRate: 0,
        averageReviewTime: 0,
        topReportedChatbots: []
      };

    } catch (error) {
      console.error('Error getting reporting stats:', error);
      throw error;
    }
  }

  /**
   * Format report text from report data
   */
  private static formatReportText(reportData: UserReportData): string {
    let text = `Category: ${reportData.reportCategory}\n`;
    text += `Reason: ${reportData.reportReason}`;

    if (reportData.additionalDetails) {
      text += `\nAdditional Details: ${reportData.additionalDetails}`;
    }

    return text;
  }

  /**
   * Categorize report severity based on category
   */
  private static categorizeReportSeverity(
    category: string
  ): 'low' | 'medium' | 'high' | 'critical' {
    const severityMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
      spam: 'low',
      inappropriate: 'medium',
      harassment: 'high',
      misinformation: 'medium',
      offensive_language: 'medium',
      privacy_violation: 'high',
      copyright: 'medium',
      other: 'low'
    };

    return severityMap[category] || 'low';
  }

  /**
   * Get estimated review time based on severity
   */
  private static getEstimatedReviewTime(severity: string): string {
    const timeMap: Record<string, string> = {
      low: '24-48 hours',
      medium: '12-24 hours',
      high: '4-12 hours',
      critical: '1-4 hours'
    };

    return timeMap[severity] || '24-48 hours';
  }

  /**
   * Get or create the user reporting rule ID
   */
  private static async getReportingRuleId(): Promise<string> {
    // This would get or create a special rule for user reports
    // For now, return a placeholder
    return 'user-report-rule-id';
  }

  /**
   * Mark a report as resolved
   */
  static async resolveReport(
    reportId: string,
    resolution: 'valid' | 'invalid' | 'no_action',
    adminNotes?: string
  ): Promise<boolean> {
    try {
      // Update the feedback record
      await db
        .update(messageFeedback)
        .set({
          feedbackText: sql`${messageFeedback.feedbackText} || ${`\n\nResolution: ${resolution}\nAdmin Notes: ${adminNotes || 'None'}`}`
        })
        .where(eq(messageFeedback.id, reportId));

      return true;
    } catch (error) {
      console.error('Error resolving report:', error);
      return false;
    }
  }

  /**
   * Process appeal decision
   */
  static async processAppeal(
    appealId: string,
    decision: 'approved' | 'rejected',
    adminResponse: string,
    reviewedBy: string
  ): Promise<boolean> {
    try {
      // Update appeal status
      await db
        .update(contentModerationAppeals)
        .set({
          status: decision,
          adminResponse,
          reviewedBy,
          reviewedAt: new Date()
        })
        .where(eq(contentModerationAppeals.id, appealId));

      // If approved, update the original violation
      if (decision === 'approved') {
        const appeal = await db
          .select()
          .from(contentModerationAppeals)
          .where(eq(contentModerationAppeals.id, appealId))
          .limit(1);

        if (appeal.length > 0) {
          await db
            .update(contentModerationViolations)
            .set({
              status: 'rejected', // Mark as false positive
              adminNotes: `Appeal approved: ${adminResponse}`,
              resolvedBy: reviewedBy,
              resolvedAt: new Date()
            })
            .where(eq(contentModerationViolations.id, appeal[0].violationId));
        }
      }

      return true;
    } catch (error) {
      console.error('Error processing appeal:', error);
      return false;
    }
  }
}