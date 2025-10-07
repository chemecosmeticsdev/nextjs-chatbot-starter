import { db } from '@/lib/db';
import { chatbotWidgetConfigs, chatbotInstances } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

export interface WidgetThemeConfig {
  primary_color: string;
  secondary_color: string;
  background_color: string;
  text_color: string;
  border_radius: number;
  font_family: string;
  font_size: number;
}

export interface WidgetLayoutConfig {
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  width: number;
  height: number;
  margin: number;
  bubble_style: 'circle' | 'rounded' | 'square';
}

export interface WidgetBehaviorConfig {
  greeting_message: string;
  placeholder_text: string;
  auto_open: boolean;
  auto_open_delay: number;
  show_typing_indicator: boolean;
  sound_enabled: boolean;
  persistent: boolean;
}

export interface WidgetSecurityConfig {
  allowed_domains: string[];
  rate_limit_enabled: boolean;
  rate_limit_per_minute: number;
  csrf_protection: boolean;
}

export interface WidgetBrandingConfig {
  show_powered_by: boolean;
  custom_avatar_url?: string;
  bot_name: string;
  company_name?: string;
}

export interface WidgetAnalyticsConfig {
  track_events: boolean;
  track_user_behavior: boolean;
  session_recording: boolean;
}

export interface WidgetConfig {
  id?: string;
  chatbotId: string;
  name: string;
  apiKey: string;
  themeConfig: WidgetThemeConfig;
  layoutConfig: WidgetLayoutConfig;
  behaviorConfig: WidgetBehaviorConfig;
  securityConfig: WidgetSecurityConfig;
  brandingConfig: WidgetBrandingConfig;
  analyticsConfig: WidgetAnalyticsConfig;
  status: 'active' | 'inactive' | 'draft';
  version: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class WidgetService {
  /**
   * Get widget configuration by chatbot ID
   */
  static async getWidgetConfig(chatbotId: string, userId: string): Promise<WidgetConfig | null> {
    // Verify chatbot ownership
    const chatbot = await db.select()
      .from(chatbotInstances)
      .where(and(
        eq(chatbotInstances.id, chatbotId),
        eq(chatbotInstances.createdBy, userId)
      ))
      .limit(1);

    if (chatbot.length === 0) {
      throw new Error('Chatbot not found or access denied');
    }

    // Get widget configuration
    const widgetConfig = await db.select()
      .from(chatbotWidgetConfigs)
      .where(eq(chatbotWidgetConfigs.chatbotId, chatbotId))
      .limit(1);

    return widgetConfig.length > 0 ? widgetConfig[0] as WidgetConfig : null;
  }

  /**
   * Create or update widget configuration
   */
  static async saveWidgetConfig(config: Omit<WidgetConfig, 'id' | 'createdAt' | 'updatedAt'>, userId: string): Promise<WidgetConfig> {
    // Verify chatbot ownership
    const chatbot = await db.select()
      .from(chatbotInstances)
      .where(and(
        eq(chatbotInstances.id, config.chatbotId),
        eq(chatbotInstances.createdBy, userId)
      ))
      .limit(1);

    if (chatbot.length === 0) {
      throw new Error('Chatbot not found or access denied');
    }

    // Check if widget configuration already exists
    const existingConfig = await db.select()
      .from(chatbotWidgetConfigs)
      .where(eq(chatbotWidgetConfigs.chatbotId, config.chatbotId))
      .limit(1);

    const configData = {
      chatbotId: config.chatbotId,
      name: config.name,
      apiKey: config.apiKey,
      themeConfig: config.themeConfig,
      layoutConfig: config.layoutConfig,
      behaviorConfig: config.behaviorConfig,
      securityConfig: config.securityConfig,
      brandingConfig: config.brandingConfig,
      analyticsConfig: config.analyticsConfig,
      status: config.status,
      version: existingConfig.length > 0 ? (existingConfig[0].version || 1) + 1 : 1,
      updatedAt: new Date()
    };

    let result;
    if (existingConfig.length > 0) {
      // Update existing configuration
      result = await db.update(chatbotWidgetConfigs)
        .set(configData)
        .where(eq(chatbotWidgetConfigs.chatbotId, config.chatbotId))
        .returning();
    } else {
      // Create new configuration
      result = await db.insert(chatbotWidgetConfigs)
        .values({
          ...configData,
          id: crypto.randomUUID(),
          createdAt: new Date()
        })
        .returning();
    }

    return result[0] as WidgetConfig;
  }

  /**
   * Generate new API key for widget
   */
  static async generateApiKey(chatbotId: string, userId: string): Promise<string> {
    // Verify chatbot ownership
    const chatbot = await db.select()
      .from(chatbotInstances)
      .where(and(
        eq(chatbotInstances.id, chatbotId),
        eq(chatbotInstances.createdBy, userId)
      ))
      .limit(1);

    if (chatbot.length === 0) {
      throw new Error('Chatbot not found or access denied');
    }

    // Generate new API key
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(16).toString('hex');
    const newApiKey = `cb_widget_${chatbotId.substring(0, 8)}_${timestamp}_${randomBytes}`;

    // Update widget configuration with new API key
    const existingConfig = await db.select()
      .from(chatbotWidgetConfigs)
      .where(eq(chatbotWidgetConfigs.chatbotId, chatbotId))
      .limit(1);

    if (existingConfig.length === 0) {
      // Create default widget configuration with new API key
      await this.createDefaultWidgetConfig(chatbotId, newApiKey);
    } else {
      // Update existing configuration with new API key
      await db.update(chatbotWidgetConfigs)
        .set({
          apiKey: newApiKey,
          version: (existingConfig[0].version || 1) + 1,
          updatedAt: new Date()
        })
        .where(eq(chatbotWidgetConfigs.chatbotId, chatbotId));
    }

    return newApiKey;
  }

  /**
   * Delete widget configuration
   */
  static async deleteWidgetConfig(chatbotId: string, userId: string): Promise<boolean> {
    // Verify chatbot ownership
    const chatbot = await db.select()
      .from(chatbotInstances)
      .where(and(
        eq(chatbotInstances.id, chatbotId),
        eq(chatbotInstances.createdBy, userId)
      ))
      .limit(1);

    if (chatbot.length === 0) {
      throw new Error('Chatbot not found or access denied');
    }

    // Delete widget configuration
    const result = await db.delete(chatbotWidgetConfigs)
      .where(eq(chatbotWidgetConfigs.chatbotId, chatbotId))
      .returning();

    return result.length > 0;
  }

  /**
   * Get widget configuration by API key (for public widget access)
   */
  static async getWidgetConfigByApiKey(apiKey: string): Promise<WidgetConfig | null> {
    const widgetConfig = await db.select()
      .from(chatbotWidgetConfigs)
      .where(eq(chatbotWidgetConfigs.apiKey, apiKey))
      .limit(1);

    return widgetConfig.length > 0 ? widgetConfig[0] as WidgetConfig : null;
  }

  /**
   * Validate domain access for widget
   */
  static async validateDomainAccess(apiKey: string, domain: string): Promise<boolean> {
    const config = await this.getWidgetConfigByApiKey(apiKey);

    if (!config) {
      return false;
    }

    // If no domain restrictions, allow all
    if (!config.securityConfig.allowed_domains || config.securityConfig.allowed_domains.length === 0) {
      return true;
    }

    // Check if domain is in allowed list
    return config.securityConfig.allowed_domains.some(allowedDomain => {
      // Support wildcard subdomains (e.g., *.example.com)
      if (allowedDomain.startsWith('*.')) {
        const baseDomain = allowedDomain.substring(2);
        return domain === baseDomain || domain.endsWith('.' + baseDomain);
      }
      return domain === allowedDomain;
    });
  }

  /**
   * Generate widget embed code
   */
  static generateEmbedCode(apiKey: string, config: WidgetConfig): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-domain.com';

    return `<!-- Chatbot Widget -->
<script>
  (function() {
    var chatbotConfig = {
      apiKey: '${apiKey}',
      chatbotId: '${config.chatbotId}',
      theme: ${JSON.stringify(config.themeConfig, null, 6)},
      layout: ${JSON.stringify(config.layoutConfig, null, 6)},
      behavior: ${JSON.stringify(config.behaviorConfig, null, 6)},
      branding: ${JSON.stringify(config.brandingConfig, null, 6)}
    };

    var script = document.createElement('script');
    script.src = '${baseUrl}/api/integrations/widget/' + chatbotConfig.chatbotId + '/loader.js';
    script.async = true;
    script.onload = function() {
      window.ChatbotWidget.init(chatbotConfig);
    };
    document.head.appendChild(script);
  })();
</script>
<!-- End Chatbot Widget -->`;
  }

  /**
   * Create default widget configuration
   */
  private static async createDefaultWidgetConfig(chatbotId: string, apiKey: string): Promise<WidgetConfig> {
    const defaultConfig = {
      id: crypto.randomUUID(),
      chatbotId,
      name: 'Website Chat Widget',
      apiKey,
      themeConfig: {
        primary_color: '#3b82f6',
        secondary_color: '#f3f4f6',
        background_color: '#ffffff',
        text_color: '#374151',
        border_radius: 12,
        font_family: 'Inter, sans-serif',
        font_size: 14
      },
      layoutConfig: {
        position: 'bottom-right' as const,
        width: 380,
        height: 500,
        margin: 20,
        bubble_style: 'circle' as const
      },
      behaviorConfig: {
        greeting_message: 'Hi! How can I help you today?',
        placeholder_text: 'Type your message...',
        auto_open: false,
        auto_open_delay: 3000,
        show_typing_indicator: true,
        sound_enabled: true,
        persistent: true
      },
      securityConfig: {
        allowed_domains: [],
        rate_limit_enabled: true,
        rate_limit_per_minute: 30,
        csrf_protection: true
      },
      brandingConfig: {
        show_powered_by: true,
        bot_name: 'Assistant',
        company_name: ''
      },
      analyticsConfig: {
        track_events: true,
        track_user_behavior: false,
        session_recording: false
      },
      status: 'draft' as const,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.insert(chatbotWidgetConfigs)
      .values(defaultConfig)
      .returning();

    return result[0] as WidgetConfig;
  }

  /**
   * Get widget statistics (mock data for now)
   */
  static generateWidgetStats(): any {
    return {
      total_conversations: Math.floor(Math.random() * 1000) + 100,
      unique_visitors: Math.floor(Math.random() * 500) + 50,
      conversion_rate: Math.round((Math.random() * 20 + 5) * 100) / 100,
      average_session_duration: Math.floor(Math.random() * 300) + 60,
      most_active_domain: 'example.com',
      bounce_rate: Math.round((Math.random() * 30 + 20) * 100) / 100
    };
  }
}