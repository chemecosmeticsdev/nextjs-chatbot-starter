"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { loadingVariants, skeletonVariants } from '@/lib/animations';
import { Loader2, RefreshCw } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  variant?: 'default' | 'primary' | 'secondary';
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  className,
  variant = 'default'
}) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  };

  const variantClasses = {
    default: 'text-muted-foreground',
    primary: 'text-primary',
    secondary: 'text-secondary-foreground'
  };

  return (
    <motion.div
      variants={loadingVariants}
      initial="start"
      animate="end"
      className={cn('flex items-center justify-center', className)}
    >
      <Loader2 className={cn(
        'animate-spin',
        sizeClasses[size],
        variantClasses[variant]
      )} />
    </motion.div>
  );
};

interface LoadingDotsProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const LoadingDots: React.FC<LoadingDotsProps> = ({
  className,
  size = 'md'
}) => {
  const sizeClasses = {
    sm: 'h-1 w-1',
    md: 'h-2 w-2',
    lg: 'h-3 w-3'
  };

  const dotVariants = {
    start: { scale: 0.8, opacity: 0.5 },
    end: { scale: 1.2, opacity: 1 }
  };

  return (
    <div className={cn('flex space-x-1 items-center justify-center', className)}>
      {[0, 1, 2].map((index) => (
        <motion.div
          key={index}
          className={cn('bg-current rounded-full', sizeClasses[size])}
          variants={dotVariants}
          initial="start"
          animate="end"
          transition={{
            duration: 0.6,
            repeat: Infinity,
            repeatType: 'reverse',
            delay: index * 0.2
          }}
        />
      ))}
    </div>
  );
};

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rectangular' | 'circular';
  width?: string | number;
  height?: string | number;
  animated?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  variant = 'text',
  width,
  height,
  animated = true
}) => {
  const variantClasses = {
    text: 'rounded',
    rectangular: 'rounded-md',
    circular: 'rounded-full'
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <motion.div
      className={cn(
        'bg-muted animate-pulse',
        variantClasses[variant],
        animated && 'bg-gradient-to-r from-muted via-muted-foreground/10 to-muted bg-[length:200px_100%]',
        className
      )}
      style={style}
      variants={animated ? skeletonVariants : undefined}
      initial={animated ? "start" : undefined}
      animate={animated ? "end" : undefined}
    />
  );
};

interface LoadingCardProps {
  showAvatar?: boolean;
  showTitle?: boolean;
  showDescription?: boolean;
  showActions?: boolean;
  className?: string;
}

export const LoadingCard: React.FC<LoadingCardProps> = ({
  showAvatar = true,
  showTitle = true,
  showDescription = true,
  showActions = true,
  className
}) => {
  return (
    <div className={cn('p-6 border rounded-lg space-y-4 bg-card', className)}>
      <div className="flex items-center space-x-4">
        {showAvatar && (
          <Skeleton variant="circular" width={40} height={40} />
        )}
        <div className="space-y-2 flex-1">
          {showTitle && (
            <Skeleton className="h-4 w-[250px]" />
          )}
          {showDescription && (
            <Skeleton className="h-3 w-[200px]" />
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-[80%]" />
        <Skeleton className="h-3 w-[60%]" />
      </div>

      {showActions && (
        <div className="flex space-x-2 pt-4">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
      )}
    </div>
  );
};

interface LoadingTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export const LoadingTable: React.FC<LoadingTableProps> = ({
  rows = 5,
  columns = 4,
  className
}) => {
  return (
    <div className={cn('w-full', className)}>
      {/* Table header */}
      <div className="flex space-x-4 mb-4 pb-2 border-b">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={`header-${index}`} className="h-4 flex-1" />
        ))}
      </div>

      {/* Table rows */}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={`row-${rowIndex}`} className="flex space-x-4">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton
                key={`cell-${rowIndex}-${colIndex}`}
                className="h-4 flex-1"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

interface LoadingPageProps {
  title?: string;
  description?: string;
  showCards?: boolean;
  cardsCount?: number;
  className?: string;
}

export const LoadingPage: React.FC<LoadingPageProps> = ({
  title = "Loading...",
  description,
  showCards = true,
  cardsCount = 3,
  className
}) => {
  return (
    <div className={cn('space-y-6 p-6', className)}>
      {/* Page header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-[300px]" />
        {description && (
          <Skeleton className="h-4 w-[500px]" />
        )}
      </div>

      {/* Action buttons */}
      <div className="flex space-x-2">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-20" />
      </div>

      {/* Cards grid */}
      {showCards && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: cardsCount }).map((_, index) => (
            <LoadingCard key={`card-${index}`} />
          ))}
        </div>
      )}
    </div>
  );
};

interface ProgressBarProps {
  progress: number;
  className?: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
  showLabel?: boolean;
  animated?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  className,
  variant = 'default',
  showLabel = true,
  animated = true
}) => {
  const variantClasses = {
    default: 'bg-primary',
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500'
  };

  return (
    <div className={cn('space-y-2', className)}>
      {showLabel && (
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Progress</span>
          <span className="text-sm text-muted-foreground">{progress}%</span>
        </div>
      )}
      <div className="w-full bg-muted rounded-full h-2">
        <motion.div
          className={cn('h-2 rounded-full', variantClasses[variant])}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={animated ? { duration: 0.5, ease: 'easeInOut' } : { duration: 0 }}
        />
      </div>
    </div>
  );
};

interface LoadingButtonProps {
  children: React.ReactNode;
  loading?: boolean;
  className?: string;
  disabled?: boolean;
  loadingText?: string;
  variant?: 'default' | 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  children,
  loading = false,
  className,
  disabled,
  loadingText,
  variant = 'default',
  size = 'md'
}) => {
  const baseClasses = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';

  const variantClasses = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    outline: 'border border-input hover:bg-accent hover:text-accent-foreground'
  };

  const sizeClasses = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4 py-2',
    lg: 'h-12 px-6 text-lg'
  };

  return (
    <button
      className={cn(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      disabled={disabled || loading}
    >
      {loading && (
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
      )}
      {loading ? (loadingText || 'Loading...') : children}
    </button>
  );
};

// Compound export for easier use
export const LoadingStates = {
  Spinner: LoadingSpinner,
  Dots: LoadingDots,
  Skeleton,
  Card: LoadingCard,
  Table: LoadingTable,
  Page: LoadingPage,
  ProgressBar,
  Button: LoadingButton,
};