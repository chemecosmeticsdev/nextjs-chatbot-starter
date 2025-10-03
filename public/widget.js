/**
 * Chatbot Widget Runtime
 * Embeddable JavaScript widget for website integration
 */
(function() {
  'use strict';

  // Prevent multiple initialization
  if (window.ChatbotWidget) {
    return;
  }

  // Widget configuration defaults
  const DEFAULT_CONFIG = {
    theme: {
      primary_color: '#3b82f6',
      secondary_color: '#f3f4f6',
      background_color: '#ffffff',
      text_color: '#374151',
      border_radius: 12,
      font_family: 'Inter, system-ui, sans-serif',
      font_size: 14
    },
    layout: {
      position: 'bottom-right',
      width: 380,
      height: 500,
      margin: 20,
      bubble_style: 'circle'
    },
    behavior: {
      greeting_message: 'Hi! How can I help you today?',
      placeholder_text: 'Type your message...',
      auto_open: false,
      auto_open_delay: 3000,
      show_typing_indicator: true,
      sound_enabled: true,
      persistent: true
    },
    branding: {
      show_powered_by: true,
      bot_name: 'Assistant',
      company_name: ''
    }
  };

  class ChatbotWidget {
    constructor() {
      this.config = null;
      this.isOpen = false;
      this.isMinimized = true;
      this.sessionId = this.generateSessionId();
      this.container = null;
      this.iframe = null;
      this.bubble = null;
      this.unreadCount = 0;
      this.soundEnabled = true;
      this.baseUrl = '';
      this.websocket = null;
      this.isConnected = false;
    }

    /**
     * Initialize the widget with configuration
     */
    init(config) {
      this.config = this.mergeConfig(DEFAULT_CONFIG, config);
      this.baseUrl = this.extractBaseUrl();
      this.soundEnabled = this.config.behavior.sound_enabled;

      // Validate required configuration
      if (!this.config.apiKey || !this.config.chatbotId) {
        console.error('ChatbotWidget: apiKey and chatbotId are required');
        return;
      }

      // Check domain restrictions
      if (!this.validateDomain()) {
        console.warn('ChatbotWidget: Domain not allowed');
        return;
      }

      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.render());
      } else {
        this.render();
      }

      // Track widget load
      this.trackEvent('widget_load', {
        domain: window.location.hostname,
        page_url: window.location.href,
        user_agent: navigator.userAgent,
        referrer: document.referrer
      });

      // Auto-open if configured
      if (this.config.behavior.auto_open) {
        setTimeout(() => {
          this.open();
        }, this.config.behavior.auto_open_delay);
      }
    }

    /**
     * Render the widget UI
     */
    render() {
      // Create widget container
      this.container = document.createElement('div');
      this.container.id = 'chatbot-widget-container';
      this.container.style.cssText = this.getContainerStyles();

      // Create chat bubble
      this.createBubble();

      // Create chat iframe
      this.createIframe();

      // Append to body
      document.body.appendChild(this.container);

      // Setup event listeners
      this.setupEventListeners();

      // Load widget styles
      this.loadStyles();
    }

    /**
     * Create chat bubble button
     */
    createBubble() {
      this.bubble = document.createElement('div');
      this.bubble.id = 'chatbot-widget-bubble';
      this.bubble.style.cssText = this.getBubbleStyles();
      this.bubble.innerHTML = this.getBubbleHTML();

      this.bubble.addEventListener('click', () => {
        if (this.isOpen) {
          this.close();
        } else {
          this.open();
        }
      });

      this.container.appendChild(this.bubble);
    }

    /**
     * Create chat iframe
     */
    createIframe() {
      this.iframe = document.createElement('iframe');
      this.iframe.id = 'chatbot-widget-iframe';
      this.iframe.src = `${this.baseUrl}/integrations/widget/${this.config.chatbotId}/chat?sessionId=${this.sessionId}&apiKey=${this.config.apiKey}`;
      this.iframe.style.cssText = this.getIframeStyles();
      this.iframe.allow = 'microphone; camera; geolocation';
      this.iframe.sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups';

      // Handle iframe load
      this.iframe.addEventListener('load', () => {
        this.setupIframeMessaging();
      });

      this.container.appendChild(this.iframe);
    }

    /**
     * Setup postMessage communication with iframe
     */
    setupIframeMessaging() {
      window.addEventListener('message', (event) => {
        if (event.source !== this.iframe.contentWindow) {
          return;
        }

        const { type, data } = event.data;

        switch (type) {
          case 'CHAT_MESSAGE_SENT':
            this.trackEvent('message_sent', { message_length: data.length });
            break;
          case 'CHAT_MESSAGE_RECEIVED':
            this.trackEvent('message_received', { message_length: data.length });
            this.showNotification();
            break;
          case 'CHAT_OPENED':
            this.trackEvent('chat_open');
            break;
          case 'CHAT_CLOSED':
            this.trackEvent('chat_close');
            break;
          case 'RESIZE_REQUEST':
            this.resizeIframe(data.height);
            break;
          case 'MINIMIZE_REQUEST':
            this.close();
            break;
          case 'UNREAD_COUNT':
            this.updateUnreadCount(data.count);
            break;
        }
      });

      // Send configuration to iframe
      this.postMessageToIframe('WIDGET_CONFIG', {
        config: this.config,
        sessionId: this.sessionId
      });
    }

    /**
     * Send message to iframe
     */
    postMessageToIframe(type, data) {
      if (this.iframe && this.iframe.contentWindow) {
        this.iframe.contentWindow.postMessage({ type, data }, '*');
      }
    }

    /**
     * Open chat widget
     */
    open() {
      if (this.isOpen) return;

      this.isOpen = true;
      this.isMinimized = false;
      this.unreadCount = 0;

      // Show iframe
      this.iframe.style.display = 'block';
      this.iframe.style.opacity = '0';
      this.iframe.style.transform = 'translateY(20px) scale(0.95)';

      // Animate in
      setTimeout(() => {
        this.iframe.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        this.iframe.style.opacity = '1';
        this.iframe.style.transform = 'translateY(0) scale(1)';
      }, 10);

      // Update bubble
      this.updateBubbleState();

      // Track event
      this.trackEvent('session_start');
    }

    /**
     * Close chat widget
     */
    close() {
      if (!this.isOpen) return;

      this.isOpen = false;
      this.isMinimized = true;

      // Animate out
      this.iframe.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
      this.iframe.style.opacity = '0';
      this.iframe.style.transform = 'translateY(20px) scale(0.95)';

      setTimeout(() => {
        this.iframe.style.display = 'none';
      }, 300);

      // Update bubble
      this.updateBubbleState();

      // Track event
      this.trackEvent('session_end');
    }

    /**
     * Update bubble visual state
     */
    updateBubbleState() {
      const icon = this.bubble.querySelector('.chatbot-icon');
      if (this.isOpen) {
        icon.innerHTML = this.getCloseIcon();
        this.bubble.classList.add('chatbot-widget-open');
      } else {
        icon.innerHTML = this.getChatIcon();
        this.bubble.classList.remove('chatbot-widget-open');
      }

      // Update unread badge
      this.updateUnreadBadge();
    }

    /**
     * Update unread message count
     */
    updateUnreadCount(count) {
      this.unreadCount = count;
      this.updateUnreadBadge();
    }

    /**
     * Update unread badge display
     */
    updateUnreadBadge() {
      let badge = this.bubble.querySelector('.chatbot-unread-badge');

      if (this.unreadCount > 0 && !this.isOpen) {
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'chatbot-unread-badge';
          badge.style.cssText = this.getUnreadBadgeStyles();
          this.bubble.appendChild(badge);
        }
        badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
        badge.style.display = 'block';
      } else if (badge) {
        badge.style.display = 'none';
      }
    }

    /**
     * Show notification for new messages
     */
    showNotification() {
      if (this.isOpen) return;

      // Play sound if enabled
      if (this.soundEnabled) {
        this.playNotificationSound();
      }

      // Show visual notification
      this.bubble.style.animation = 'chatbot-pulse 0.6s ease-in-out';
      setTimeout(() => {
        this.bubble.style.animation = '';
      }, 600);
    }

    /**
     * Play notification sound
     */
    playNotificationSound() {
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQaAjiOVMcA');
        audio.volume = 0.3;
        audio.play().catch(() => {
          // Ignore audio play errors
        });
      } catch (e) {
        // Ignore audio errors
      }
    }

    /**
     * Resize iframe
     */
    resizeIframe(height) {
      if (height && this.iframe) {
        this.iframe.style.height = Math.min(height, this.config.layout.height) + 'px';
      }
    }

    /**
     * Track analytics event
     */
    trackEvent(eventType, eventData = {}) {
      try {
        const payload = {
          event_type: eventType,
          event_data: eventData,
          session_id: this.sessionId,
          domain: window.location.hostname,
          page_url: window.location.href,
          user_agent: navigator.userAgent,
          referrer: document.referrer
        };

        fetch(`${this.baseUrl}/api/v1/chatbots/${this.config.chatbotId}/integrations/widget/analytics`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }).catch(() => {
          // Ignore tracking errors
        });
      } catch (e) {
        // Ignore tracking errors
      }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
          e.preventDefault();
          if (this.isOpen) {
            this.close();
          } else {
            this.open();
          }
        }
      });

      // Close on outside click (optional)
      document.addEventListener('click', (e) => {
        if (this.isOpen && !this.container.contains(e.target)) {
          // Optional: close on outside click
          // this.close();
        }
      });

      // Handle window resize
      window.addEventListener('resize', () => {
        this.adjustPosition();
      });
    }

    /**
     * Adjust widget position on window resize
     */
    adjustPosition() {
      // Recalculate position if needed
      this.container.style.cssText = this.getContainerStyles();
    }

    /**
     * Validate domain restrictions
     */
    validateDomain() {
      // This would typically be validated server-side
      // For client-side, we'll assume it's valid
      return true;
    }

    /**
     * Extract base URL from current script
     */
    extractBaseUrl() {
      const scripts = document.querySelectorAll('script');
      for (let script of scripts) {
        if (script.src && script.src.includes('/api/integrations/widget/')) {
          const url = new URL(script.src);
          return `${url.protocol}//${url.host}`;
        }
      }
      return window.location.origin;
    }

    /**
     * Merge configuration objects
     */
    mergeConfig(defaultConfig, userConfig) {
      const merged = JSON.parse(JSON.stringify(defaultConfig));

      for (const key in userConfig) {
        if (typeof userConfig[key] === 'object' && !Array.isArray(userConfig[key])) {
          merged[key] = { ...merged[key], ...userConfig[key] };
        } else {
          merged[key] = userConfig[key];
        }
      }

      return merged;
    }

    /**
     * Generate unique session ID
     */
    generateSessionId() {
      return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Load widget styles
     */
    loadStyles() {
      if (document.getElementById('chatbot-widget-styles')) {
        return;
      }

      const style = document.createElement('style');
      style.id = 'chatbot-widget-styles';
      style.textContent = this.getWidgetCSS();
      document.head.appendChild(style);
    }

    /**
     * Get container styles
     */
    getContainerStyles() {
      const { position, margin } = this.config.layout;

      let positionStyles = '';
      switch (position) {
        case 'bottom-right':
          positionStyles = `bottom: ${margin}px; right: ${margin}px;`;
          break;
        case 'bottom-left':
          positionStyles = `bottom: ${margin}px; left: ${margin}px;`;
          break;
        case 'top-right':
          positionStyles = `top: ${margin}px; right: ${margin}px;`;
          break;
        case 'top-left':
          positionStyles = `top: ${margin}px; left: ${margin}px;`;
          break;
      }

      return `
        position: fixed;
        ${positionStyles}
        z-index: 999999;
        font-family: ${this.config.theme.font_family};
        direction: ltr;
      `;
    }

    /**
     * Get bubble styles
     */
    getBubbleStyles() {
      const { primary_color, border_radius } = this.config.theme;
      const { bubble_style } = this.config.layout;

      let bubbleRadius = border_radius;
      if (bubble_style === 'circle') {
        bubbleRadius = 50;
      } else if (bubble_style === 'square') {
        bubbleRadius = 4;
      }

      return `
        width: 60px;
        height: 60px;
        background: ${primary_color};
        border-radius: ${bubbleRadius}px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        position: relative;
        border: none;
        outline: none;
      `;
    }

    /**
     * Get iframe styles
     */
    getIframeStyles() {
      const { width, height, border_radius } = this.config.layout;
      const { background_color } = this.config.theme;

      return `
        display: none;
        position: absolute;
        bottom: 80px;
        right: 0;
        width: ${width}px;
        height: ${height}px;
        border: none;
        border-radius: ${border_radius}px;
        background: ${background_color};
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        z-index: 999998;
        opacity: 0;
        transform: translateY(20px) scale(0.95);
      `;
    }

    /**
     * Get unread badge styles
     */
    getUnreadBadgeStyles() {
      return `
        position: absolute;
        top: -5px;
        right: -5px;
        background: #ef4444;
        color: white;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 600;
        line-height: 1;
      `;
    }

    /**
     * Get bubble HTML
     */
    getBubbleHTML() {
      return `
        <div class="chatbot-icon" style="color: white; font-size: 24px;">
          ${this.getChatIcon()}
        </div>
      `;
    }

    /**
     * Get chat icon SVG
     */
    getChatIcon() {
      return `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H6L4 18V4H20V16Z"/>
        </svg>
      `;
    }

    /**
     * Get close icon SVG
     */
    getCloseIcon() {
      return `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41Z"/>
        </svg>
      `;
    }

    /**
     * Get widget CSS
     */
    getWidgetCSS() {
      return `
        @keyframes chatbot-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }

        #chatbot-widget-container * {
          box-sizing: border-box;
        }

        #chatbot-widget-bubble:hover {
          transform: scale(1.05);
          box-shadow: 0 6px 25px rgba(0, 0, 0, 0.2);
        }

        #chatbot-widget-bubble.chatbot-widget-open {
          transform: rotate(90deg);
        }

        #chatbot-widget-bubble.chatbot-widget-open:hover {
          transform: rotate(90deg) scale(1.05);
        }

        @media (max-width: 480px) {
          #chatbot-widget-iframe {
            width: calc(100vw - 20px) !important;
            height: calc(100vh - 100px) !important;
            right: 10px !important;
            bottom: 80px !important;
          }
        }
      `;
    }
  }

  // Create global instance
  window.ChatbotWidget = new ChatbotWidget();

  // Auto-initialize if config is provided
  if (window.chatbotConfig) {
    window.ChatbotWidget.init(window.chatbotConfig);
  }

})();