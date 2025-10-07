import { db } from '@/lib/db';
import {
  contentModerationRules,
  contentModerationViolations,
  contentModerationReviews,
  contentModerationAppeals,
  contentModerationAnalytics,
  chatbotMessages,
  users
} from '@/lib/db/schema';
import type {
  ModerationContext,
  ModerationResult,
  ModerationRuleConfiguration,
  ContentModerationRule,
  NewContentModerationViolation,
  NewContentModerationReview
} from '@/lib/db/schema';
import { eq, and, desc, gte, lte, count, sql, inArray } from 'drizzle-orm';
import { AuditLogger, SecurityEventType } from '@/lib/security/audit-logger';

/**
 * Comprehensive Content Moderation Service
 * Handles automated content filtering, rule management, and violation tracking
 */
export class ContentModerationService {

  /**
   * Check content against all active moderation rules
   */
  static async moderateContent(context: ModerationContext): Promise<ModerationResult> {
    try {
      // Get all active moderation rules
      const activeRules = await db
        .select()
        .from(contentModerationRules)
        .where(eq(contentModerationRules.isActive, true))
        .orderBy(contentModerationRules.severityLevel);

      const violations: string[] = [];
      let highestSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low';
      let maxConfidence = 0;
      let flaggedContent = '';
      const reasons: string[] = [];

      // Check against each rule
      for (const rule of activeRules) {
        const ruleResult = await this.checkAgainstRule(context.messageContent, rule);

        if (ruleResult.isViolation) {
          violations.push(rule.id);
          reasons.push(ruleResult.reason || `Violated ${rule.name}`);

          // Update highest severity
          if (this.getSeverityPriority(rule.severityLevel) > this.getSeverityPriority(highestSeverity)) {
            highestSeverity = rule.severityLevel;
          }

          // Update max confidence
          if (ruleResult.confidence > maxConfidence) {
            maxConfidence = ruleResult.confidence;
            flaggedContent = ruleResult.flaggedContent || '';
          }

          // Log the violation in database
          await this.createViolation(context, rule, ruleResult);
        }
      }

      // Determine action based on severity and violations
      const action = this.determineAction(highestSeverity, violations.length);

      const result: ModerationResult = {
        isViolation: violations.length > 0,
        violatedRules: violations,
        severity: highestSeverity,
        confidenceScore: maxConfidence,
        action,
        flaggedContent,
        reasoning: reasons.join('; ')
      };

      // Log moderation check
      await AuditLogger.logSecurityEvent({
        userId: context.userId,
        eventType: SecurityEventType.MALICIOUS_REQUEST,
        severity: result.isViolation ? 'warning' : 'info',
        ipAddress: context.metadata?.ipAddress,
        userAgent: context.metadata?.userAgent,
        details: {
          chatbotId: context.chatbotId,
          conversationId: context.conversationId,
          contentLength: context.messageContent.length,
          violationsCount: violations.length,
          action: result.action,
          confidence: maxConfidence
        },
        blocked: result.action === 'block'
      });

      return result;

    } catch (error) {
      console.error('Content moderation error:', error);

      // Fail safe - allow content if moderation system fails
      return {
        isViolation: false,
        violatedRules: [],
        severity: 'low',
        confidenceScore: 0,
        action: 'allow',
        reasoning: 'Moderation system unavailable'
      };
    }
  }

  /**
   * Check content against a specific rule
   */
  private static async checkAgainstRule(
    content: string,
    rule: ContentModerationRule
  ): Promise<{ isViolation: boolean; confidence: number; flaggedContent?: string; reason?: string }> {
    const config = rule.configuration as ModerationRuleConfiguration;

    switch (rule.ruleType) {
      case 'profanity':
        return this.checkProfanity(content, config);

      case 'spam':
        return this.checkSpam(content, config);

      case 'toxicity':
        return await this.checkToxicity(content, config);

      case 'custom_pattern':
        return this.checkCustomPattern(content, config);

      case 'ai_detection':
        return await this.checkAIDetection(content, config);

      default:
        return { isViolation: false, confidence: 0 };
    }
  }

  /**
   * Check for profanity using keyword matching
   */
  private static checkProfanity(
    content: string,
    config: ModerationRuleConfiguration
  ): { isViolation: boolean; confidence: number; flaggedContent?: string; reason?: string } {
    const keywords = config.keywords || [];
    const whitelist = config.whitelist || [];
    const lowerContent = content.toLowerCase();

    // Check whitelist first
    for (const whitelistedWord of whitelist) {
      if (lowerContent.includes(whitelistedWord.toLowerCase())) {
        return { isViolation: false, confidence: 0 };
      }
    }

    let violations = 0;
    let flaggedWords: string[] = [];

    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword.toLowerCase()}\\b`, 'gi');
      const matches = content.match(regex);
      if (matches) {
        violations += matches.length;
        flaggedWords.push(...matches);
      }
    }

    if (violations > 0) {
      const confidence = Math.min(violations * 30, 100); // 30% per violation, max 100%
      return {
        isViolation: true,
        confidence,
        flaggedContent: flaggedWords.join(', '),
        reason: `Contains ${violations} profanity violation(s)`
      };
    }

    return { isViolation: false, confidence: 0 };
  }

  /**
   * Check for spam patterns
   */
  private static checkSpam(
    content: string,
    config: ModerationRuleConfiguration
  ): { isViolation: boolean; confidence: number; flaggedContent?: string; reason?: string } {
    const patterns = config.patterns || [];
    let spamScore = 0;
    let flaggedPatterns: string[] = [];

    // Check for excessive repetition
    const words = content.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    const repetitionRatio = (words.length - uniqueWords.size) / words.length;

    if (repetitionRatio > 0.5) {
      spamScore += 40;
      flaggedPatterns.push('excessive repetition');
    }

    // Check for excessive caps
    const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
    if (capsRatio > 0.7 && content.length > 10) {
      spamScore += 30;
      flaggedPatterns.push('excessive caps');
    }

    // Check for URLs without permission
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const urls = content.match(urlRegex);
    if (urls && urls.length > 0) {
      spamScore += 50;
      flaggedPatterns.push(`${urls.length} URL(s)`);
    }

    // Check custom patterns
    for (const pattern of patterns) {
      const regex = new RegExp(pattern, 'gi');
      if (regex.test(content)) {
        spamScore += 60;
        flaggedPatterns.push(pattern);
      }
    }

    const confidence = Math.min(spamScore, 100);
    const threshold = config.thresholds?.spam || 50;

    if (confidence >= threshold) {
      return {
        isViolation: true,
        confidence,
        flaggedContent: flaggedPatterns.join(', '),
        reason: `Spam patterns detected (score: ${confidence})`
      };
    }

    return { isViolation: false, confidence };
  }

  /**
   * Check toxicity using AI sentiment analysis (placeholder for AWS Comprehend integration)
   */
  private static async checkToxicity(
    content: string,
    config: ModerationRuleConfiguration
  ): Promise<{ isViolation: boolean; confidence: number; flaggedContent?: string; reason?: string }> {
    // This would integrate with AWS Comprehend in production
    // For now, implement basic sentiment analysis

    const toxicWords = [
      'hate', 'kill', 'die', 'stupid', 'idiot', 'moron', 'trash', 'garbage',
      'worst', 'terrible', 'awful', 'disgusting', 'pathetic', 'useless'
    ];

    const lowerContent = content.toLowerCase();
    let toxicityScore = 0;
    let flaggedWords: string[] = [];

    for (const word of toxicWords) {
      if (lowerContent.includes(word)) {
        toxicityScore += 15;
        flaggedWords.push(word);
      }
    }

    // Check for aggressive punctuation
    const aggressivePunctuation = (content.match(/[!?]{2,}/g) || []).length;
    if (aggressivePunctuation > 0) {
      toxicityScore += aggressivePunctuation * 10;
    }

    const confidence = Math.min(toxicityScore, 100);
    const threshold = config.thresholds?.toxicity || 60;

    if (confidence >= threshold) {
      return {
        isViolation: true,
        confidence,
        flaggedContent: flaggedWords.join(', '),
        reason: `Toxic content detected (score: ${confidence})`
      };
    }

    return { isViolation: false, confidence };
  }

  /**
   * Check custom regex patterns
   */
  private static checkCustomPattern(
    content: string,
    config: ModerationRuleConfiguration
  ): { isViolation: boolean; confidence: number; flaggedContent?: string; reason?: string } {
    const patterns = config.patterns || [];

    for (const pattern of patterns) {
      try {
        const regex = new RegExp(pattern, 'gi');
        const matches = content.match(regex);

        if (matches) {
          return {
            isViolation: true,
            confidence: 90,
            flaggedContent: matches.join(', '),
            reason: `Matches custom pattern: ${pattern}`
          };
        }
      } catch (error) {
        console.error(`Invalid regex pattern: ${pattern}`, error);
      }
    }

    return { isViolation: false, confidence: 0 };
  }

  /**
   * AI-powered content detection (placeholder for advanced ML models)
   */
  private static async checkAIDetection(
    content: string,
    config: ModerationRuleConfiguration
  ): Promise<{ isViolation: boolean; confidence: number; flaggedContent?: string; reason?: string }> {
    // This would integrate with advanced AI models like OpenAI Moderation API
    // For now, implement a simple heuristic approach

    const suspiciousPatterns = [
      /personal\s+information/gi,
      /credit\s+card/gi,
      /ssn|social\s+security/gi,
      /password/gi,
      /login\s+credentials/gi
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(content)) {
        return {
          isViolation: true,
          confidence: 85,
          flaggedContent: content.match(pattern)?.[0] || '',
          reason: 'AI detected potentially sensitive information'
        };
      }
    }

    return { isViolation: false, confidence: 0 };
  }

  /**
   * Create a violation record in the database
   */
  private static async createViolation(
    context: ModerationContext,
    rule: ContentModerationRule,
    ruleResult: { confidence: number; flaggedContent?: string; reason?: string }
  ): Promise<void> {
    try {
      const violation: NewContentModerationViolation = {
        messageId: '', // This will be set by the caller when the message is created
        ruleId: rule.id,
        userId: context.userId || null,
        chatbotId: context.chatbotId,
        violationType: rule.ruleType,
        severity: rule.severityLevel,
        confidenceScore: ruleResult.confidence,
        originalContent: context.messageContent,
        flaggedContent: ruleResult.flaggedContent || null,
        userIdentifier: context.userIdentifier
      };

      const [createdViolation] = await db
        .insert(contentModerationViolations)
        .values(violation)
        .returning();

      // Create review if severity is high or critical
      if (rule.severityLevel === 'high' || rule.severityLevel === 'critical') {
        const review: NewContentModerationReview = {
          violationId: createdViolation.id,
          reviewStatus: 'pending'
        };

        await db.insert(contentModerationReviews).values(review);
      }

    } catch (error) {
      console.error('Error creating violation record:', error);
    }
  }

  /**
   * Determine action based on severity and violation count
   */
  private static determineAction(
    severity: 'low' | 'medium' | 'high' | 'critical',
    violationCount: number
  ): 'allow' | 'flag' | 'block' | 'escalate' {
    if (violationCount === 0) return 'allow';

    switch (severity) {
      case 'critical':
        return 'block';
      case 'high':
        return violationCount > 1 ? 'block' : 'escalate';
      case 'medium':
        return violationCount > 2 ? 'escalate' : 'flag';
      case 'low':
        return 'flag';
      default:
        return 'allow';
    }
  }

  /**
   * Get severity priority for comparison
   */
  private static getSeverityPriority(severity: string): number {
    switch (severity) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  }

  /**
   * Create a new moderation rule
   */
  static async createModerationRule(data: {
    name: string;
    description?: string;
    ruleType: 'profanity' | 'spam' | 'toxicity' | 'custom_pattern' | 'ai_detection';
    configuration: ModerationRuleConfiguration;
    severityLevel: 'low' | 'medium' | 'high' | 'critical';
    autoAction?: string;
    createdBy: string;
  }): Promise<ContentModerationRule> {
    const [rule] = await db
      .insert(contentModerationRules)
      .values({
        name: data.name,
        description: data.description || null,
        ruleType: data.ruleType,
        configuration: data.configuration,
        severityLevel: data.severityLevel,
        autoAction: data.autoAction || 'flag',
        createdBy: data.createdBy
      })
      .returning();

    return rule;
  }

  /**
   * Get all moderation rules
   */
  static async getModerationRules(filters?: {
    isActive?: boolean;
    ruleType?: string;
    severityLevel?: string;
  }): Promise<ContentModerationRule[]> {
    let query = db.select().from(contentModerationRules);

    if (filters?.isActive !== undefined) {
      query = query.where(eq(contentModerationRules.isActive, filters.isActive));
    }

    return await query.orderBy(contentModerationRules.createdAt);
  }

  /**
   * Update moderation rule
   */
  static async updateModerationRule(
    ruleId: string,
    updates: Partial<{
      name: string;
      description: string;
      configuration: ModerationRuleConfiguration;
      severityLevel: 'low' | 'medium' | 'high' | 'critical';
      isActive: boolean;
      autoAction: string;
    }>
  ): Promise<ContentModerationRule | null> {
    const [updatedRule] = await db
      .update(contentModerationRules)
      .set(updates)
      .where(eq(contentModerationRules.id, ruleId))
      .returning();

    return updatedRule || null;
  }

  /**
   * Get violations with optional filters
   */
  static async getViolations(filters?: {
    chatbotId?: string;
    userId?: string;
    status?: string;
    severity?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ violations: any[]; total: number }> {
    let query = db
      .select({
        id: contentModerationViolations.id,
        messageId: contentModerationViolations.messageId,
        ruleId: contentModerationViolations.ruleId,
        userId: contentModerationViolations.userId,
        chatbotId: contentModerationViolations.chatbotId,
        violationType: contentModerationViolations.violationType,
        severity: contentModerationViolations.severity,
        status: contentModerationViolations.status,
        confidenceScore: contentModerationViolations.confidenceScore,
        originalContent: contentModerationViolations.originalContent,
        flaggedContent: contentModerationViolations.flaggedContent,
        userIdentifier: contentModerationViolations.userIdentifier,
        adminNotes: contentModerationViolations.adminNotes,
        createdAt: contentModerationViolations.createdAt,
        ruleName: contentModerationRules.name,
        ruleType: contentModerationRules.ruleType
      })
      .from(contentModerationViolations)
      .leftJoin(
        contentModerationRules,
        eq(contentModerationViolations.ruleId, contentModerationRules.id)
      );

    // Apply filters
    const conditions = [];
    if (filters?.chatbotId) {
      conditions.push(eq(contentModerationViolations.chatbotId, filters.chatbotId));
    }
    if (filters?.userId) {
      conditions.push(eq(contentModerationViolations.userId, filters.userId));
    }
    if (filters?.status) {
      conditions.push(eq(contentModerationViolations.status, filters.status as any));
    }
    if (filters?.severity) {
      conditions.push(eq(contentModerationViolations.severity, filters.severity as any));
    }
    if (filters?.startDate) {
      conditions.push(gte(contentModerationViolations.createdAt, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(contentModerationViolations.createdAt, filters.endDate));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    // Get total count
    const [{ count: total }] = await db
      .select({ count: count() })
      .from(contentModerationViolations)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    // Apply pagination and get results
    const violations = await query
      .orderBy(desc(contentModerationViolations.createdAt))
      .limit(filters?.limit || 50)
      .offset(filters?.offset || 0);

    return { violations, total };
  }

  /**
   * Update violation status (for admin review)
   */
  static async updateViolationStatus(
    violationId: string,
    status: 'pending' | 'approved' | 'rejected' | 'escalated' | 'resolved',
    adminNotes?: string,
    resolvedBy?: string
  ): Promise<boolean> {
    try {
      await db
        .update(contentModerationViolations)
        .set({
          status,
          adminNotes: adminNotes || null,
          resolvedBy: resolvedBy || null,
          resolvedAt: status === 'resolved' ? new Date() : null
        })
        .where(eq(contentModerationViolations.id, violationId));

      return true;
    } catch (error) {
      console.error('Error updating violation status:', error);
      return false;
    }
  }

  /**
   * Generate content moderation analytics
   */
  static async generateAnalytics(
    date: string,
    chatbotId?: string
  ): Promise<void> {
    try {
      // Implementation for analytics generation
      // This would be called daily to update moderation statistics

      const analytics = {
        date,
        chatbotId: chatbotId || null,
        totalMessages: 0, // Would be calculated from actual message count
        flaggedMessages: 0,
        blockedMessages: 0,
        falsePositives: 0,
        approvedViolations: 0,
        appealSubmitted: 0,
        appealsApproved: 0,
        ruleBreakdown: {}
      };

      await db
        .insert(contentModerationAnalytics)
        .values(analytics)
        .onConflictDoUpdate({
          target: [contentModerationAnalytics.date, contentModerationAnalytics.chatbotId],
          set: analytics
        });

    } catch (error) {
      console.error('Error generating moderation analytics:', error);
    }
  }
}