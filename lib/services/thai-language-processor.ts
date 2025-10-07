/**
 * Thai Language Processor
 * Handles language detection and processing for Thai-English mixed content
 * Specialized for cosmetic ingredients terminology
 */

import { franc, francAll } from 'franc';
import langs from 'langs';

export interface LanguageDetectionResult {
  primaryLanguage: 'th' | 'en' | 'unknown';
  confidence: number;
  hasThaiChars: boolean;
  hasEnglishChars: boolean;
  isMixed: boolean;
  suggestedResponseLanguage: 'th' | 'en';
}

export interface ProcessedMessage {
  original: string;
  normalized: string;
  detectedLanguage: LanguageDetectionResult;
  extractedTerms: {
    inciNames: string[];
    technicalTerms: string[];
    generalTerms: string[];
  };
  context: 'ingredient_inquiry' | 'formulation_request' | 'purchase_order' | 'general_question';
}

export class ThaiLanguageProcessor {
  private thaiCharPattern = /[\u0E00-\u0E7F]/g;
  private englishCharPattern = /[a-zA-Z]/g;

  // Common cosmetic ingredient patterns
  private inciNamePattern = /\b[A-Z][A-Z\s-]+[A-Z]\b/g;
  private technicalTerms = new Set([
    'moisturizing', 'anti-aging', 'antioxidant', 'emulsifier', 'preservative',
    'surfactant', 'humectant', 'occlusive', 'emollient', 'exfoliant',
    'UV filter', 'pigment', 'fragrance', 'essential oil', 'extract',
    'concentration', 'pH', 'stability', 'formulation', 'compatibility',
    'INCI', 'IECIC', 'CAS', 'EINECS', 'FDA', 'EU', 'ASEAN'
  ]);

  private cosmeticContextKeywords = {
    th: [
      'ส่วนผสม', 'วัตถุดิบ', 'เครื่องสำอาง', 'ครีม', 'โลชั่น', 'เซรั่ม',
      'แชมพู', 'ผลิตภัณฑ์', 'สูตร', 'การผสม', 'ความเข้มข้น',
      'คุณสมบัติ', 'ประสิทธิภาพ', 'ความปลอดภัย', 'อาการแพ้',
      'ใบสั่งซื้อ', 'ราคา', 'จำนวน', 'ผู้จำหน่าย', 'สต็อก'
    ],
    en: [
      'ingredient', 'formulation', 'cosmetic', 'skincare', 'haircare',
      'cream', 'lotion', 'serum', 'shampoo', 'product', 'formula',
      'concentration', 'efficacy', 'safety', 'allergy', 'sensitivity',
      'purchase order', 'quote', 'supplier', 'stock', 'price'
    ]
  };

  /**
   * Detect language characteristics of the input text
   */
  detectLanguage(text: string): LanguageDetectionResult {
    const thaiMatches = text.match(this.thaiCharPattern) || [];
    const englishMatches = text.match(this.englishCharPattern) || [];

    const hasThaiChars = thaiMatches.length > 0;
    const hasEnglishChars = englishMatches.length > 0;
    const isMixed = hasThaiChars && hasEnglishChars;

    // Use franc for more sophisticated detection
    let francResult: string;
    let confidence = 0;

    try {
      francResult = franc(text, { minLength: 3 });
      confidence = francResult === 'tha' ? 0.9 : (francResult === 'eng' ? 0.8 : 0.5);
    } catch (error) {
      francResult = 'und'; // undefined
    }

    // Determine primary language
    let primaryLanguage: 'th' | 'en' | 'unknown';

    if (francResult === 'tha' || (hasThaiChars && thaiMatches.length > englishMatches.length)) {
      primaryLanguage = 'th';
    } else if (francResult === 'eng' || (hasEnglishChars && englishMatches.length > thaiMatches.length)) {
      primaryLanguage = 'en';
    } else {
      primaryLanguage = 'unknown';
    }

    // Determine suggested response language
    // For cosmetic ingredients business, default to Thai unless specifically English-only
    const suggestedResponseLanguage: 'th' | 'en' =
      primaryLanguage === 'en' && !hasThaiChars ? 'en' : 'th';

    return {
      primaryLanguage,
      confidence,
      hasThaiChars,
      hasEnglishChars,
      isMixed,
      suggestedResponseLanguage
    };
  }

  /**
   * Process and analyze the message for cosmetic ingredients context
   */
  processMessage(text: string): ProcessedMessage {
    const detectedLanguage = this.detectLanguage(text);
    const normalized = this.normalizeText(text);
    const extractedTerms = this.extractTerms(text);
    const context = this.determineContext(text, extractedTerms);

    return {
      original: text,
      normalized,
      detectedLanguage,
      extractedTerms,
      context
    };
  }

  /**
   * Normalize text for better processing
   */
  private normalizeText(text: string): string {
    // Remove extra whitespaces
    let normalized = text.replace(/\s+/g, ' ').trim();

    // Normalize Thai text (basic)
    normalized = normalized.replace(/ำ/g, 'า'); // Example normalization

    return normalized;
  }

  /**
   * Extract relevant terms from the text
   */
  private extractTerms(text: string) {
    const inciNames: string[] = [];
    const technicalTerms: string[] = [];
    const generalTerms: string[] = [];

    // Extract INCI names (uppercase patterns)
    const inciMatches = text.match(this.inciNamePattern) || [];
    inciNames.push(...inciMatches);

    // Extract technical terms
    const textLower = text.toLowerCase();
    for (const term of this.technicalTerms) {
      if (textLower.includes(term.toLowerCase())) {
        technicalTerms.push(term);
      }
    }

    // Extract cosmetic-related terms
    for (const term of this.cosmeticContextKeywords.en) {
      if (textLower.includes(term)) {
        generalTerms.push(term);
      }
    }

    // Thai terms
    for (const term of this.cosmeticContextKeywords.th) {
      if (text.includes(term)) {
        generalTerms.push(term);
      }
    }

    return {
      inciNames: [...new Set(inciNames)], // Remove duplicates
      technicalTerms: [...new Set(technicalTerms)],
      generalTerms: [...new Set(generalTerms)]
    };
  }

  /**
   * Determine the context/intent of the message
   */
  private determineContext(text: string, extractedTerms: any): ProcessedMessage['context'] {
    const textLower = text.toLowerCase();

    // Purchase order indicators
    const orderKeywords = ['order', 'purchase', 'buy', 'quote', 'price', 'ใบสั่งซื้อ', 'ซื้อ', 'สั่ง', 'ราคา'];
    if (orderKeywords.some(keyword => textLower.includes(keyword))) {
      return 'purchase_order';
    }

    // Formulation indicators
    const formulationKeywords = ['formulation', 'formula', 'mix', 'blend', 'recipe', 'สูตร', 'ผสม', 'การผสม'];
    if (formulationKeywords.some(keyword => textLower.includes(keyword))) {
      return 'formulation_request';
    }

    // Ingredient inquiry indicators
    if (extractedTerms.inciNames.length > 0 || extractedTerms.technicalTerms.length > 0) {
      return 'ingredient_inquiry';
    }

    return 'general_question';
  }

  /**
   * Generate appropriate system prompt based on detected context and language
   */
  generateContextualPrompt(processed: ProcessedMessage, basePrompt: string): string {
    const { detectedLanguage, context, extractedTerms } = processed;

    let contextualAddition = '';

    // Add context-specific instructions
    switch (context) {
      case 'ingredient_inquiry':
        contextualAddition = detectedLanguage.suggestedResponseLanguage === 'th'
          ? '\n\nโปรดตอบคำถามเกี่ยวกับส่วนผสมโดยใช้ข้อมูลจากฐานข้อมูล vector search พร้อมระบุชื่อ INCI, คุณสมบัติ, และข้อมูลความปลอดภัย'
          : '\n\nPlease answer ingredient questions using vector search data, including INCI names, properties, and safety information.';
        break;

      case 'formulation_request':
        contextualAddition = detectedLanguage.suggestedResponseLanguage === 'th'
          ? '\n\nช่วยเหลือในการสร้างสูตร โดยพิจารณาความเข้ากันได้ของส่วนผสม ความเข้มข้น และคุณสมบัติที่ต้องการ'
          : '\n\nAssist with formulation by considering ingredient compatibility, concentrations, and desired properties.';
        break;

      case 'purchase_order':
        contextualAddition = detectedLanguage.suggestedResponseLanguage === 'th'
          ? '\n\nช่วยในการสร้างใบสั่งซื้อ ตรวจสอบสต็อก ราคา และข้อมูลผู้จำหน่าย'
          : '\n\nAssist with purchase order creation, checking stock, pricing, and supplier information.';
        break;
    }

    // Add extracted terms context
    if (extractedTerms.inciNames.length > 0) {
      contextualAddition += `\n\nDetected INCI ingredients: ${extractedTerms.inciNames.join(', ')}`;
    }

    return basePrompt + contextualAddition;
  }
}

// Export singleton instance
export const thaiLanguageProcessor = new ThaiLanguageProcessor();