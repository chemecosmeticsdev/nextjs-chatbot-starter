"use client";

import React from 'react';
import Link from 'next/link';
import { ChevronRight, Home, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBreadcrumbsReadOnly } from '@/lib/hooks/use-breadcrumbs';
import { BreadcrumbItem } from '@/lib/context/breadcrumb-context';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem as ShadcnBreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface DynamicBreadcrumbsProps {
  className?: string;
  maxVisibleItems?: number;
  showHomeIcon?: boolean;
  showIcons?: boolean;
  separator?: React.ReactNode;
  ellipsisThreshold?: number;
  onItemClick?: (item: BreadcrumbItem) => void;
  customItems?: BreadcrumbItem[];
  loading?: boolean;
}

/**
 * Dynamic breadcrumb component that automatically displays navigation based on current route
 */
export const DynamicBreadcrumbs: React.FC<DynamicBreadcrumbsProps> = ({
  className,
  maxVisibleItems = 4,
  showHomeIcon = true,
  showIcons = true,
  separator,
  ellipsisThreshold = 5,
  onItemClick,
  customItems,
  loading = false,
}) => {
  const { items: contextItems, isReady } = useBreadcrumbsReadOnly();

  // Use custom items if provided, otherwise use context items
  const items = customItems || contextItems;

  // Don't render if not ready or no items
  if (!isReady || items.length === 0) {
    if (loading) {
      return <BreadcrumbSkeleton className={className} />;
    }
    return null;
  }

  // Determine if we need to show ellipsis
  const shouldShowEllipsis = items.length > ellipsisThreshold;
  const shouldTruncate = maxVisibleItems > 0 && items.length > maxVisibleItems;

  let displayItems = items;
  let hiddenItems: BreadcrumbItem[] = [];

  if (shouldTruncate) {
    // Always show first item (home) and last few items
    const firstItem = items[0];
    const lastItems = items.slice(-Math.max(1, maxVisibleItems - 2));

    // Items that will be hidden in ellipsis
    hiddenItems = items.slice(1, items.length - lastItems.length);

    if (hiddenItems.length > 0) {
      displayItems = [firstItem, ...lastItems];
    } else {
      displayItems = items;
    }
  }

  const handleItemClick = (item: BreadcrumbItem, event: React.MouseEvent) => {
    if (onItemClick) {
      event.preventDefault();
      onItemClick(item);
    }
  };

  const renderIcon = (item: BreadcrumbItem) => {
    if (!showIcons) return null;

    const IconComponent = item.icon;
    if (!IconComponent) {
      // Show home icon for home item if no specific icon
      if (item.metadata?.isHome && showHomeIcon) {
        return <Home className="h-4 w-4" />;
      }
      return null;
    }

    return <IconComponent className="h-4 w-4" />;
  };

  const renderBreadcrumbItem = (item: BreadcrumbItem, index: number, isLast: boolean) => {
    const icon = renderIcon(item);
    const isEllipsis = item.metadata?.isEllipsis;

    if (isEllipsis) {
      return (
        <ShadcnBreadcrumbItem key={item.id}>
          <BreadcrumbEllipsis className="h-4 w-4" />
        </ShadcnBreadcrumbItem>
      );
    }

    const content = (
      <div className="flex items-center gap-2">
        {icon}
        <span className={cn(
          "truncate",
          isLast ? "font-medium text-foreground" : "text-muted-foreground"
        )}>
          {item.title}
        </span>
      </div>
    );

    return (
      <ShadcnBreadcrumbItem key={item.id}>
        {isLast || item.isCurrentPage ? (
          <BreadcrumbPage className="flex items-center gap-2">
            {content}
          </BreadcrumbPage>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <BreadcrumbLink asChild>
                <Link
                  href={item.href}
                  onClick={(e) => handleItemClick(item, e)}
                  className="flex items-center gap-2 hover:text-foreground transition-colors"
                >
                  {content}
                </Link>
              </BreadcrumbLink>
            </TooltipTrigger>
            <TooltipContent>
              <p>Navigate to {item.title}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </ShadcnBreadcrumbItem>
    );
  };

  const renderEllipsisDropdown = () => {
    if (hiddenItems.length === 0) return null;

    return (
      <ShadcnBreadcrumbItem>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-9 w-9 items-center justify-center">
            <BreadcrumbEllipsis className="h-4 w-4" />
            <span className="sr-only">Toggle menu</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[200px]">
            {hiddenItems.map((item) => (
              <DropdownMenuItem key={item.id} asChild>
                <Link
                  href={item.href}
                  onClick={(e) => handleItemClick(item, e)}
                  className="flex items-center gap-2"
                >
                  {renderIcon(item)}
                  <span className="truncate">{item.title}</span>
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </ShadcnBreadcrumbItem>
    );
  };

  const customSeparator = separator || <ChevronRight className="h-4 w-4" />;

  return (
    <Breadcrumb className={cn("flex items-center", className)}>
      <BreadcrumbList>
        {displayItems.map((item, index) => {
          const isLast = index === displayItems.length - 1;
          const showEllipsisAfterFirst = index === 0 && hiddenItems.length > 0;

          return (
            <React.Fragment key={item.id}>
              {renderBreadcrumbItem(item, index, isLast)}

              {/* Show ellipsis after first item if we have hidden items */}
              {showEllipsisAfterFirst && (
                <>
                  <BreadcrumbSeparator>
                    {customSeparator}
                  </BreadcrumbSeparator>
                  {renderEllipsisDropdown()}
                </>
              )}

              {/* Regular separator */}
              {!isLast && !showEllipsisAfterFirst && (
                <BreadcrumbSeparator>
                  {customSeparator}
                </BreadcrumbSeparator>
              )}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

/**
 * Loading skeleton for breadcrumbs
 */
const BreadcrumbSkeleton: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <div className="h-4 w-16 bg-muted rounded animate-pulse" />
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
      <div className="h-4 w-20 bg-muted rounded animate-pulse" />
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
      <div className="h-4 w-24 bg-muted rounded animate-pulse" />
    </div>
  );
};

/**
 * Simple breadcrumb component for manual usage
 */
export interface SimpleBreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
  showIcons?: boolean;
  onItemClick?: (item: BreadcrumbItem) => void;
}

export const SimpleBreadcrumbs: React.FC<SimpleBreadcrumbsProps> = ({
  items,
  className,
  showIcons = true,
  onItemClick,
}) => {
  if (items.length === 0) return null;

  const handleItemClick = (item: BreadcrumbItem, event: React.MouseEvent) => {
    if (onItemClick) {
      event.preventDefault();
      onItemClick(item);
    }
  };

  return (
    <Breadcrumb className={cn("flex items-center", className)}>
      <BreadcrumbList>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const IconComponent = item.icon;

          return (
            <React.Fragment key={item.id}>
              <ShadcnBreadcrumbItem>
                {isLast || item.isCurrentPage ? (
                  <BreadcrumbPage className="flex items-center gap-2">
                    {showIcons && IconComponent && (
                      <IconComponent className="h-4 w-4" />
                    )}
                    {item.title}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link
                      href={item.href}
                      onClick={(e) => handleItemClick(item, e)}
                      className="flex items-center gap-2"
                    >
                      {showIcons && IconComponent && (
                        <IconComponent className="h-4 w-4" />
                      )}
                      {item.title}
                    </Link>
                  </BreadcrumbLink>
                )}
              </ShadcnBreadcrumbItem>
              {!isLast && (
                <BreadcrumbSeparator>
                  <ChevronRight className="h-4 w-4" />
                </BreadcrumbSeparator>
              )}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

/**
 * Compact breadcrumb for mobile/small spaces
 */
export const CompactBreadcrumbs: React.FC<DynamicBreadcrumbsProps> = (props) => {
  const { items } = useBreadcrumbsReadOnly();

  if (items.length === 0) return null;

  const currentPage = items.find(item => item.isCurrentPage);
  const parentPage = items.length > 1 ? items[items.length - 2] : null;

  return (
    <div className={cn("flex items-center gap-2", props.className)}>
      {parentPage && (
        <>
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
          >
            <Link href={parentPage.href}>
              <ChevronRight className="h-4 w-4 rotate-180" />
              <span className="sr-only">Back to {parentPage.title}</span>
            </Link>
          </Button>
          <div className="text-muted-foreground">/</div>
        </>
      )}
      <span className="font-medium text-foreground">
        {currentPage?.title || 'Current Page'}
      </span>
    </div>
  );
};

export default DynamicBreadcrumbs;