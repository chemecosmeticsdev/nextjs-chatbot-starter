"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Menu, X } from 'lucide-react';

export interface ResponsiveLayoutProps {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  header?: React.ReactNode;
  className?: string;
  sidebarClassName?: string;
  contentClassName?: string;
  mobileBreakpoint?: number;
  tabletBreakpoint?: number;
}

export const ResponsiveLayout: React.FC<ResponsiveLayoutProps> = ({
  children,
  sidebar,
  header,
  className,
  sidebarClassName,
  contentClassName,
  mobileBreakpoint = 768,
  tabletBreakpoint = 1024,
}) => {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setIsMobile(width < mobileBreakpoint);
      setIsTablet(width >= mobileBreakpoint && width < tabletBreakpoint);

      // Auto-close sidebar on mobile when resizing
      if (width < mobileBreakpoint) {
        setSidebarOpen(false);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [mobileBreakpoint, tabletBreakpoint]);

  const sidebarVariants = {
    open: {
      x: 0,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 30,
      },
    },
    closed: {
      x: '-100%',
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 30,
      },
    },
  };

  const overlayVariants = {
    open: {
      opacity: 1,
      transition: { duration: 0.2 },
    },
    closed: {
      opacity: 0,
      transition: { duration: 0.2 },
    },
  };

  return (
    <div className={cn('flex h-screen overflow-hidden', className)}>
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobile && sidebarOpen && (
          <motion.div
            initial="closed"
            animate="open"
            exit="closed"
            variants={overlayVariants}
            className="fixed inset-0 z-50 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <div className={cn(
        'relative',
        isMobile
          ? 'fixed inset-y-0 left-0 z-50 w-72 lg:relative lg:block'
          : isTablet
          ? 'w-64'
          : 'w-80',
        sidebarClassName
      )}>
        <AnimatePresence>
          {(!isMobile || sidebarOpen) && (
            <motion.div
              initial={isMobile ? 'closed' : false}
              animate="open"
              exit="closed"
              variants={isMobile ? sidebarVariants : undefined}
              className="h-full w-full"
            >
              {sidebar}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header with Mobile Menu Button */}
        {(header || isMobile) && (
          <div className="flex items-center justify-between border-b bg-background px-4 py-3">
            {isMobile && (
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="flex items-center justify-center w-10 h-10 rounded-md hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                aria-label="Toggle sidebar"
              >
                {sidebarOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </button>
            )}
            {header}
          </div>
        )}

        {/* Content Area */}
        <main className={cn(
          'flex-1 overflow-auto',
          'p-4 md:p-6',
          contentClassName
        )}>
          {children}
        </main>
      </div>
    </div>
  );
};

// Responsive breakpoint hook
export const useBreakpoint = () => {
  const [breakpoint, setBreakpoint] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setBreakpoint('mobile');
      } else if (width < 1024) {
        setBreakpoint('tablet');
      } else {
        setBreakpoint('desktop');
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    breakpoint,
    isMobile: breakpoint === 'mobile',
    isTablet: breakpoint === 'tablet',
    isDesktop: breakpoint === 'desktop',
  };
};

// Responsive grid component
interface ResponsiveGridProps {
  children: React.ReactNode;
  className?: string;
  cols?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
  };
  gap?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
  };
}

export const ResponsiveGrid: React.FC<ResponsiveGridProps> = ({
  children,
  className,
  cols = { mobile: 1, tablet: 2, desktop: 3 },
  gap = { mobile: 4, tablet: 6, desktop: 6 },
}) => {
  return (
    <div
      className={cn(
        'grid',
        // Grid columns
        `grid-cols-${cols.mobile}`,
        `md:grid-cols-${cols.tablet}`,
        `lg:grid-cols-${cols.desktop}`,
        // Grid gap
        `gap-${gap.mobile}`,
        `md:gap-${gap.tablet}`,
        `lg:gap-${gap.desktop}`,
        className
      )}
    >
      {children}
    </div>
  );
};

// Responsive container component
interface ResponsiveContainerProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  padding?: {
    mobile?: string;
    tablet?: string;
    desktop?: string;
  };
}

export const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  children,
  className,
  maxWidth = 'full',
  padding = { mobile: 'px-4', tablet: 'px-6', desktop: 'px-8' },
}) => {
  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    full: 'max-w-full',
  };

  return (
    <div
      className={cn(
        'mx-auto w-full',
        maxWidthClasses[maxWidth],
        padding.mobile,
        `md:${padding.tablet}`,
        `lg:${padding.desktop}`,
        className
      )}
    >
      {children}
    </div>
  );
};

// Responsive text component
interface ResponsiveTextProps {
  children: React.ReactNode;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span';
  className?: string;
  size?: {
    mobile?: string;
    tablet?: string;
    desktop?: string;
  };
}

export const ResponsiveText: React.FC<ResponsiveTextProps> = ({
  children,
  as: Component = 'p',
  className,
  size = { mobile: 'text-sm', tablet: 'text-base', desktop: 'text-lg' },
}) => {
  return (
    <Component
      className={cn(
        size.mobile,
        `md:${size.tablet}`,
        `lg:${size.desktop}`,
        className
      )}
    >
      {children}
    </Component>
  );
};

// Touch-friendly button component
interface TouchButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  variant?: 'default' | 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

export const TouchButton: React.FC<TouchButtonProps> = ({
  children,
  onClick,
  className,
  variant = 'default',
  size = 'md',
  disabled = false,
}) => {
  const baseClasses = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';

  const variantClasses = {
    default: 'bg-background hover:bg-accent hover:text-accent-foreground',
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };

  // Larger touch targets on mobile
  const sizeClasses = {
    sm: 'h-9 px-3 text-sm min-h-[44px] md:h-9 md:min-h-0',
    md: 'h-10 px-4 py-2 min-h-[44px] md:h-10 md:min-h-0',
    lg: 'h-11 px-8 min-h-[44px] md:h-11 md:min-h-0',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        'touch-manipulation', // Improve touch responsiveness
        className
      )}
    >
      {children}
    </button>
  );
};

export default ResponsiveLayout;