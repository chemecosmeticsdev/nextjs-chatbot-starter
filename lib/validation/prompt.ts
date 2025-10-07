import { z } from 'zod';

/**
 * Validation schema for updating system prompt
 */
export const updatePromptSchema = z.object({
  prompt: z
    .string()
    .min(10, 'Prompt must be at least 10 characters long')
    .max(8000, 'Prompt cannot exceed 8000 characters')
    .trim(),
  description: z
    .string()
    .max(500, 'Description cannot exceed 500 characters')
    .trim()
    .optional()
}).strict();

/**
 * Validation schema for AI prompt generation
 */
export const generatePromptSchema = z.object({
  businessContext: z
    .string()
    .min(10, 'Business context must be at least 10 characters long')
    .max(2000, 'Business context cannot exceed 2000 characters')
    .trim(),
  targetAudience: z
    .string()
    .min(5, 'Target audience must be at least 5 characters long')
    .max(500, 'Target audience cannot exceed 500 characters')
    .trim()
    .optional(),
  communicationStyle: z
    .enum(['professional', 'friendly', 'casual', 'formal', 'conversational', 'authoritative'])
    .default('professional'),
  keyTopics: z
    .array(z.string().min(1).max(100))
    .min(1, 'At least one key topic is required')
    .max(20, 'Maximum 20 key topics allowed')
    .optional(),
  constraints: z
    .array(z.string().min(1).max(200))
    .max(10, 'Maximum 10 constraints allowed')
    .optional(),
  documentContext: z
    .array(z.string().min(1))
    .max(50, 'Maximum 50 document excerpts allowed')
    .optional()
}).strict();

/**
 * Validation schema for prompt rollback
 */
export const rollbackPromptSchema = z.object({
  version: z
    .number()
    .int()
    .min(1, 'Version must be a positive integer'),
  reason: z
    .string()
    .max(500, 'Reason cannot exceed 500 characters')
    .trim()
    .optional()
}).strict();

/**
 * Validation schema for prompt job status query
 */
export const promptJobQuerySchema = z.object({
  page: z
    .number()
    .int()
    .min(1, 'Page must be at least 1')
    .default(1),
  limit: z
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .default(10),
  status: z
    .enum(['pending', 'processing', 'completed', 'failed'])
    .optional()
}).strict();

/**
 * Validation schema for file upload context
 */
export const uploadContextSchema = z.object({
  files: z
    .array(z.object({
      name: z.string().min(1, 'File name is required'),
      type: z.string().min(1, 'File type is required'),
      size: z.number().min(1, 'File size must be greater than 0').max(10 * 1024 * 1024, 'File size cannot exceed 10MB'),
      content: z.string().min(1, 'File content is required')
    }))
    .min(1, 'At least one file is required')
    .max(10, 'Maximum 10 files allowed'),
  purpose: z
    .enum(['prompt_context', 'business_rules', 'product_info', 'faq_data', 'style_guide'])
    .default('prompt_context')
}).strict();

/**
 * Type definitions for prompt operations
 */
export type UpdatePromptRequest = z.infer<typeof updatePromptSchema>;
export type GeneratePromptRequest = z.infer<typeof generatePromptSchema>;
export type RollbackPromptRequest = z.infer<typeof rollbackPromptSchema>;
export type PromptJobQueryRequest = z.infer<typeof promptJobQuerySchema>;
export type UploadContextRequest = z.infer<typeof uploadContextSchema>;

/**
 * Response type definitions
 */
export interface PromptHistoryItem {
  id: string;
  version: number;
  prompt: string;
  description?: string;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  isActive: boolean;
  source: 'manual' | 'generated' | 'rollback';
  generationJobId?: string;
}

export interface PromptGenerationJob {
  id: string;
  chatbotId: string;
  requestedBy: string;
  requestedByName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  parameters: {
    businessContext: string;
    targetAudience?: string;
    communicationStyle: string;
    keyTopics?: string[];
    constraints?: string[];
    documentContext?: string[];
  };
  generatedPrompt?: string;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface PromptRollbackResult {
  newVersion: number;
  previousVersion: number;
  prompt: string;
  rolledBackAt: Date;
}

/**
 * Common prompt validation helpers
 */
export const validatePromptLength = (prompt: string): boolean => {
  return prompt.length >= 10 && prompt.length <= 8000;
};

export const sanitizePrompt = (prompt: string): string => {
  return prompt
    .trim()
    .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
    .replace(/\n{3,}/g, '\n\n');  // Replace multiple newlines with double newline
};

export const extractPromptKeywords = (prompt: string): string[] => {
  // Extract potential keywords from prompt for search/categorization
  const words = prompt
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3)
    .filter(word => !['this', 'that', 'with', 'have', 'will', 'your', 'from', 'they', 'been', 'were'].includes(word));

  // Return unique words
  return [...new Set(words)].slice(0, 20);
};

/**
 * Prompt quality metrics
 */
export const calculatePromptMetrics = (prompt: string) => {
  const words = prompt.split(/\s+/).length;
  const sentences = prompt.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  const avgWordsPerSentence = sentences > 0 ? words / sentences : 0;
  const hasSystemDirectives = /you are|you should|your role|act as/i.test(prompt);
  const hasConstraints = /don't|do not|never|always|must|should not/i.test(prompt);
  const hasPersonality = /friendly|professional|helpful|polite|casual/i.test(prompt);

  return {
    wordCount: words,
    sentenceCount: sentences,
    avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
    hasSystemDirectives,
    hasConstraints,
    hasPersonality,
    qualityScore: calculateQualityScore({
      words,
      sentences,
      avgWordsPerSentence,
      hasSystemDirectives,
      hasConstraints,
      hasPersonality
    })
  };
};

function calculateQualityScore(metrics: {
  words: number;
  sentences: number;
  avgWordsPerSentence: number;
  hasSystemDirectives: boolean;
  hasConstraints: boolean;
  hasPersonality: boolean;
}): number {
  let score = 0;

  // Word count scoring (0-30 points)
  if (metrics.words >= 50 && metrics.words <= 300) score += 30;
  else if (metrics.words >= 30 || metrics.words <= 500) score += 20;
  else score += 10;

  // Sentence structure scoring (0-20 points)
  if (metrics.avgWordsPerSentence >= 8 && metrics.avgWordsPerSentence <= 20) score += 20;
  else if (metrics.avgWordsPerSentence >= 5 && metrics.avgWordsPerSentence <= 25) score += 15;
  else score += 10;

  // Content quality scoring (0-50 points)
  if (metrics.hasSystemDirectives) score += 20;
  if (metrics.hasConstraints) score += 15;
  if (metrics.hasPersonality) score += 15;

  return Math.min(100, score);
}