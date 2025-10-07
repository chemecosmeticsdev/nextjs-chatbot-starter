"use client";

import { useCallback, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export interface NavigationEvent {
  event: 'navigation' | 'breadcrumb_click' | 'sidebar_click' | 'keyboard_shortcut';
  from: string;
  to: string;
  timestamp: number;
  method: 'click' | 'keyboard' | 'breadcrumb' | 'direct';
  sessionId: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface NavigationAnalytics {
  totalNavigations: number;
  uniquePages: Set<string>;
  mostVisitedPages: Record<string, number>;
  navigationMethods: Record<string, number>;
  averageTimeOnPage: Record<string, number>;
  bounceRate: number;
  keyboardShortcutUsage: Record<string, number>;
}

class NavigationTracker {
  private events: NavigationEvent[] = [];
  private sessionId: string;
  private startTime: number = Date.now();
  private lastPageTime: number = Date.now();
  private currentPage: string = '';

  constructor() {
    this.sessionId = `nav_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  track(event: Omit<NavigationEvent, 'timestamp' | 'sessionId'>) {
    const navigationEvent: NavigationEvent = {
      ...event,
      timestamp: Date.now(),
      sessionId: this.sessionId,
    };

    this.events.push(navigationEvent);

    // Store in localStorage for persistence
    try {
      const existingEvents = JSON.parse(localStorage.getItem('navigation_events') || '[]');
      existingEvents.push(navigationEvent);

      // Keep only last 1000 events to prevent storage issues
      const recentEvents = existingEvents.slice(-1000);
      localStorage.setItem('navigation_events', JSON.stringify(recentEvents));
    } catch (error) {
      console.warn('Failed to store navigation event:', error);
    }

    // Send to analytics service (if configured)
    this.sendToAnalytics(navigationEvent);
  }

  trackPageView(path: string, method: NavigationEvent['method'] = 'direct') {
    const now = Date.now();

    if (this.currentPage && this.currentPage !== path) {
      // Track time spent on previous page
      const timeOnPage = now - this.lastPageTime;
      this.track({
        event: 'navigation',
        from: this.currentPage,
        to: path,
        method,
        metadata: { timeOnPreviousPage: timeOnPage }
      });
    }

    this.currentPage = path;
    this.lastPageTime = now;
  }

  trackBreadcrumbClick(from: string, to: string, breadcrumbIndex: number) {
    this.track({
      event: 'breadcrumb_click',
      from,
      to,
      method: 'breadcrumb',
      metadata: { breadcrumbIndex }
    });
  }

  trackSidebarClick(from: string, to: string, itemLabel: string) {
    this.track({
      event: 'sidebar_click',
      from,
      to,
      method: 'click',
      metadata: { itemLabel }
    });
  }

  trackKeyboardShortcut(from: string, to: string, shortcut: string) {
    this.track({
      event: 'keyboard_shortcut',
      from,
      to,
      method: 'keyboard',
      metadata: { shortcut }
    });
  }

  getAnalytics(): NavigationAnalytics {
    const analytics: NavigationAnalytics = {
      totalNavigations: this.events.length,
      uniquePages: new Set(this.events.map(e => e.to)),
      mostVisitedPages: {},
      navigationMethods: {},
      averageTimeOnPage: {},
      bounceRate: 0,
      keyboardShortcutUsage: {}
    };

    // Calculate most visited pages
    this.events.forEach(event => {
      analytics.mostVisitedPages[event.to] = (analytics.mostVisitedPages[event.to] || 0) + 1;
    });

    // Calculate navigation methods
    this.events.forEach(event => {
      analytics.navigationMethods[event.method] = (analytics.navigationMethods[event.method] || 0) + 1;
    });

    // Calculate keyboard shortcut usage
    this.events
      .filter(event => event.event === 'keyboard_shortcut')
      .forEach(event => {
        const shortcut = event.metadata?.shortcut || 'unknown';
        analytics.keyboardShortcutUsage[shortcut] = (analytics.keyboardShortcutUsage[shortcut] || 0) + 1;
      });

    // Calculate average time on page
    const pageTimeMap: Record<string, number[]> = {};
    this.events.forEach(event => {
      if (event.metadata?.timeOnPreviousPage) {
        const page = event.from;
        if (!pageTimeMap[page]) pageTimeMap[page] = [];
        pageTimeMap[page].push(event.metadata.timeOnPreviousPage);
      }
    });

    Object.entries(pageTimeMap).forEach(([page, times]) => {
      analytics.averageTimeOnPage[page] = times.reduce((a, b) => a + b, 0) / times.length;
    });

    // Calculate bounce rate (single page sessions)
    const uniqueDestinations = new Set(this.events.map(e => e.to));
    analytics.bounceRate = uniqueDestinations.size === 1 ? 1 : 0;

    return analytics;
  }

  exportData() {
    return {
      events: this.events,
      analytics: this.getAnalytics(),
      sessionInfo: {
        sessionId: this.sessionId,
        startTime: this.startTime,
        duration: Date.now() - this.startTime
      }
    };
  }

  clearData() {
    this.events = [];
    try {
      localStorage.removeItem('navigation_events');
    } catch (error) {
      console.warn('Failed to clear navigation events:', error);
    }
  }

  private sendToAnalytics(event: NavigationEvent) {
    // This is where you would send to your analytics service
    // For now, just log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.debug('Navigation Event:', event);
    }

    // Example integration with Google Analytics 4
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'navigation', {
        event_category: 'navigation',
        event_label: event.event,
        custom_parameter_from: event.from,
        custom_parameter_to: event.to,
        custom_parameter_method: event.method,
      });
    }

    // Example integration with custom analytics endpoint
    // fetch('/api/analytics/navigation', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(event)
    // }).catch(console.error);
  }
}

// Global navigation tracker instance
const navigationTracker = new NavigationTracker();

// Hook for using navigation analytics
export const useNavigationAnalytics = () => {
  const pathname = usePathname();
  const router = useRouter();

  const trackPageView = useCallback((method: NavigationEvent['method'] = 'direct') => {
    navigationTracker.trackPageView(pathname, method);
  }, [pathname]);

  const trackBreadcrumbClick = useCallback((to: string, breadcrumbIndex: number) => {
    navigationTracker.trackBreadcrumbClick(pathname, to, breadcrumbIndex);
    router.push(to);
  }, [pathname, router]);

  const trackSidebarClick = useCallback((to: string, itemLabel: string) => {
    navigationTracker.trackSidebarClick(pathname, to, itemLabel);
    router.push(to);
  }, [pathname, router]);

  const trackKeyboardShortcut = useCallback((to: string, shortcut: string) => {
    navigationTracker.trackKeyboardShortcut(pathname, to, shortcut);
    router.push(to);
  }, [pathname, router]);

  const getAnalytics = useCallback(() => {
    return navigationTracker.getAnalytics();
  }, []);

  const exportData = useCallback(() => {
    return navigationTracker.exportData();
  }, []);

  const clearData = useCallback(() => {
    navigationTracker.clearData();
  }, []);

  // Auto-track page views (only when pathname changes)
  useEffect(() => {
    navigationTracker.trackPageView(pathname, 'direct');
  }, [pathname]);

  return {
    trackPageView,
    trackBreadcrumbClick,
    trackSidebarClick,
    trackKeyboardShortcut,
    getAnalytics,
    exportData,
    clearData,
  };
};

export default navigationTracker;