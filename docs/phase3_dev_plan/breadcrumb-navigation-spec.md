# Breadcrumb Navigation Specification - Phase 3

## Overview

This document provides detailed specifications for implementing dynamic breadcrumb navigation throughout the chatbot management system. The breadcrumb system will replace static navigation with context-aware breadcrumbs that update based on the current route and provide clear navigation hierarchy.

## Current Implementation Issues

### Problems with Existing Breadcrumbs

**Static Implementation in Layout** (`app/dashboard/layout.tsx` lines 82-94):
```tsx
<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem className="hidden md:block">
      <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator className="hidden md:block" />
    <BreadcrumbItem>
      <BreadcrumbPage>Overview</BreadcrumbPage>
    </BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>
```

**Issues Identified**:
1. **Hardcoded Breadcrumbs**: Always shows "Dashboard > Overview" regardless of actual page
2. **No Context Awareness**: Doesn't reflect actual navigation state
3. **Missing Dynamic Updates**: No mechanism to update breadcrumbs based on route changes
4. **Limited Functionality**: No support for deep navigation or complex route structures

## Technical Requirements

### Breadcrumb Context Architecture

**Core Context Interface**:
```tsx
interface BreadcrumbItem {
  id: string;
  title: string;
  href: string;
  isCurrentPage: boolean;
  icon?: LucideIcon;
  metadata?: Record<string, any>;
}

interface BreadcrumbContextValue {
  items: BreadcrumbItem[];
  maxItems: number;
  setItems: (items: BreadcrumbItem[]) => void;
  addItem: (item: BreadcrumbItem) => void;
  updateItem: (id: string, updates: Partial<BreadcrumbItem>) => void;
  removeItem: (id: string) => void;
  clearItems: () => void;
  setMaxItems: (max: number) => void;
}
```

**Context Provider Implementation**:
```tsx
interface BreadcrumbProviderProps {
  children: React.ReactNode;
  defaultMaxItems?: number;
  routeConfig?: RouteConfig;
}

const BreadcrumbProvider: React.FC<BreadcrumbProviderProps> = ({
  children,
  defaultMaxItems = 4,
  routeConfig
}) => {
  // Implementation details
};
```

### Route Configuration System

**Route Mapping Interface**:
```tsx
interface RouteConfigItem {
  path: string;
  title: string;
  icon?: LucideIcon;
  parent?: string;
  dynamic?: boolean;
  titleResolver?: (params: Record<string, string>) => string;
  children?: RouteConfigItem[];
}

interface RouteConfig {
  routes: RouteConfigItem[];
  defaultTitle: string;
  homeRoute: string;
}
```

**Route Configuration Example**:
```tsx
const routeConfig: RouteConfig = {
  homeRoute: '/dashboard',
  defaultTitle: 'Dashboard',
  routes: [
    {
      path: '/dashboard',
      title: 'Dashboard',
      icon: Home,
    },
    {
      path: '/dashboard/chatbots',
      title: 'Chatbots',
      icon: Bot,
      parent: '/dashboard',
      children: [
        {
          path: '/dashboard/chatbots/[id]',
          title: 'Chatbot Details',
          dynamic: true,
          titleResolver: (params) => `Chatbot ${params.id.slice(0, 8)}`,
          children: [
            {
              path: '/dashboard/chatbots/[id]/configure',
              title: 'Configuration',
              parent: '/dashboard/chatbots/[id]',
            },
            {
              path: '/dashboard/chatbots/[id]/playground',
              title: 'Playground',
              parent: '/dashboard/chatbots/[id]',
            },
          ],
        },
        {
          path: '/dashboard/chatbots/create',
          title: 'Create Chatbot',
          parent: '/dashboard/chatbots',
        },
      ],
    },
    {
      path: '/dashboard/analytics',
      title: 'Analytics',
      icon: BarChart3,
      parent: '/dashboard',
    },
    {
      path: '/dashboard/monitoring',
      title: 'Live Monitoring',
      icon: Activity,
      parent: '/dashboard',
    },
    {
      path: '/chat',
      title: 'Chat',
      icon: MessageSquare,
    },
  ],
};
```

### Dynamic Breadcrumb Generation

**Automatic Route Parsing**:
```tsx
interface RouteBreadcrumbGenerator {
  generateFromPath: (path: string, params?: Record<string, string>) => BreadcrumbItem[];
  generateFromRoute: (route: RouteConfigItem, params?: Record<string, string>) => BreadcrumbItem[];
  resolveTitle: (route: RouteConfigItem, params?: Record<string, string>) => string;
  buildHierarchy: (currentRoute: RouteConfigItem) => BreadcrumbItem[];
}
```

**Implementation Strategy**:
1. **Path Analysis**: Parse current pathname into segments
2. **Route Matching**: Match segments against route configuration
3. **Hierarchy Building**: Build breadcrumb chain from root to current page
4. **Dynamic Resolution**: Resolve dynamic titles using route parameters
5. **Context Updates**: Update breadcrumb context with generated items

### Custom Breadcrumb Hooks

**Primary Hook Interface**:
```tsx
interface UseBreadcrumbsOptions {
  items?: BreadcrumbItem[];
  autoGenerate?: boolean;
  maxItems?: number;
  clearOnUnmount?: boolean;
}

interface UseBreadcrumbsReturn {
  items: BreadcrumbItem[];
  setItems: (items: BreadcrumbItem[]) => void;
  addItem: (item: BreadcrumbItem) => void;
  updateCurrentPage: (title: string, metadata?: Record<string, any>) => void;
  clearItems: () => void;
  isReady: boolean;
}

const useBreadcrumbs = (options?: UseBreadcrumbsOptions): UseBreadcrumbsReturn => {
  // Implementation
};
```

**Page-Specific Hook**:
```tsx
interface UsePageBreadcrumbsOptions {
  title?: string;
  customItems?: BreadcrumbItem[];
  includeAutoGenerated?: boolean;
}

const usePageBreadcrumbs = (options?: UsePageBreadcrumbsOptions) => {
  // Automatically generates breadcrumbs for current page
  // Provides easy API for page-level breadcrumb customization
};
```

## Component Specifications

### Dynamic Breadcrumbs Component

**Primary Component Interface**:
```tsx
interface DynamicBreadcrumbsProps {
  className?: string;
  maxItems?: number;
  separator?: React.ReactNode;
  showHome?: boolean;
  homeIcon?: LucideIcon;
  mobileCollapse?: boolean;
  showIcons?: boolean;
  analytics?: boolean;
}

const DynamicBreadcrumbs: React.FC<DynamicBreadcrumbsProps> = ({
  className,
  maxItems,
  separator = <ChevronRight className="h-4 w-4" />,
  showHome = true,
  homeIcon = Home,
  mobileCollapse = true,
  showIcons = false,
  analytics = true,
}) => {
  // Implementation
};
```

**Responsive Behavior**:
```tsx
// Desktop: Full breadcrumb chain
<Breadcrumb className="hidden md:flex">
  <BreadcrumbList>
    {items.map((item, index) => (
      <BreadcrumbItem key={item.id}>
        {/* Full breadcrumb item */}
      </BreadcrumbItem>
    ))}
  </BreadcrumbList>
</Breadcrumb>

// Mobile: Collapsed with back button
<Breadcrumb className="md:hidden">
  <BreadcrumbList>
    <BreadcrumbItem>
      <Button variant="ghost" size="sm" onClick={goBack}>
        <ChevronLeft className="h-4 w-4" />
        Back
      </Button>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbPage>{currentPage.title}</BreadcrumbPage>
    </BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>
```

### Breadcrumb Item Component

**Enhanced Item Component**:
```tsx
interface BreadcrumbItemEnhancedProps {
  item: BreadcrumbItem;
  isLast: boolean;
  showIcon?: boolean;
  onClick?: (item: BreadcrumbItem) => void;
  className?: string;
}

const BreadcrumbItemEnhanced: React.FC<BreadcrumbItemEnhancedProps> = ({
  item,
  isLast,
  showIcon = false,
  onClick,
  className,
}) => {
  return (
    <BreadcrumbItem className={className}>
      {isLast ? (
        <BreadcrumbPage className="flex items-center gap-2">
          {showIcon && item.icon && <item.icon className="h-4 w-4" />}
          {item.title}
        </BreadcrumbPage>
      ) : (
        <BreadcrumbLink
          href={item.href}
          className="flex items-center gap-2"
          onClick={(e) => {
            if (onClick) {
              e.preventDefault();
              onClick(item);
            }
          }}
        >
          {showIcon && item.icon && <item.icon className="h-4 w-4" />}
          {item.title}
        </BreadcrumbLink>
      )}
    </BreadcrumbItem>
  );
};
```

### Overflow Handling Component

**Breadcrumb Overflow Menu**:
```tsx
interface BreadcrumbOverflowProps {
  items: BreadcrumbItem[];
  maxVisible: number;
  onItemClick?: (item: BreadcrumbItem) => void;
}

const BreadcrumbOverflow: React.FC<BreadcrumbOverflowProps> = ({
  items,
  maxVisible,
  onItemClick,
}) => {
  const visibleItems = items.slice(-maxVisible);
  const overflowItems = items.slice(0, -maxVisible);

  return (
    <BreadcrumbList>
      {overflowItems.length > 0 && (
        <>
          <BreadcrumbItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Show more breadcrumbs</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {overflowItems.map((item) => (
                  <DropdownMenuItem key={item.id} asChild>
                    <Link href={item.href} onClick={() => onItemClick?.(item)}>
                      {item.icon && <item.icon className="h-4 w-4 mr-2" />}
                      {item.title}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
        </>
      )}
      {/* Render visible items */}
    </BreadcrumbList>
  );
};
```

## Integration Specifications

### Layout Integration

**Updated Layout Component** (`app/dashboard/layout.tsx`):
```tsx
import { BreadcrumbProvider } from '@/lib/context/breadcrumb-context';
import { DynamicBreadcrumbs } from '@/components/navigation/dynamic-breadcrumbs';
import { routeConfig } from '@/lib/config/breadcrumb-routes';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <BreadcrumbProvider routeConfig={routeConfig}>
        <SidebarProvider>
          <AppSidebar user={user} />
          <SidebarInset>
            <header className="flex h-16 shrink-0 items-center gap-2">
              <div className="flex items-center gap-2 px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 h-4" />
                <DynamicBreadcrumbs
                  maxItems={4}
                  showIcons={false}
                  mobileCollapse={true}
                />
              </div>
              {/* Rest of header */}
            </header>
            <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </BreadcrumbProvider>
    </TooltipProvider>
  );
}
```

### Page-Level Integration

**Dashboard Page Integration**:
```tsx
// app/dashboard/page.tsx
import { usePageBreadcrumbs } from '@/lib/hooks/use-breadcrumbs';

export default function DashboardPage() {
  usePageBreadcrumbs({
    title: 'Overview',
    // Auto-generated: Dashboard > Overview
  });

  return (
    <div className="flex flex-col min-h-screen">
      {/* Remove duplicate header - breadcrumbs now in layout */}
      <main className="flex-1 p-6">
        {/* Dashboard content */}
      </main>
    </div>
  );
}
```

**Chatbot Detail Page Integration**:
```tsx
// app/dashboard/chatbots/[id]/page.tsx
import { useBreadcrumbs } from '@/lib/hooks/use-breadcrumbs';

export default function ChatbotDetailPage({ params }: { params: { id: string } }) {
  const { data: chatbot } = useChatbot(params.id);

  useBreadcrumbs({
    items: [
      { id: 'dashboard', title: 'Dashboard', href: '/dashboard', isCurrentPage: false },
      { id: 'chatbots', title: 'Chatbots', href: '/dashboard/chatbots', isCurrentPage: false },
      {
        id: 'chatbot-detail',
        title: chatbot?.name || `Chatbot ${params.id.slice(0, 8)}`,
        href: `/dashboard/chatbots/${params.id}`,
        isCurrentPage: true
      },
    ],
  });

  return <div>{/* Page content */}</div>;
}
```

### Chat Page Integration

**Chat Interface Breadcrumbs**:
```tsx
// app/chat/page.tsx
import { usePageBreadcrumbs } from '@/lib/hooks/use-breadcrumbs';

export default function ChatPage() {
  usePageBreadcrumbs({
    title: 'Chat',
    customItems: [
      { id: 'chat', title: 'Chat', href: '/chat', isCurrentPage: true, icon: MessageSquare },
    ],
  });

  return <div>{/* Chat interface */}</div>;
}
```

## Technical Implementation

### File Structure

```
lib/
├── context/
│   └── breadcrumb-context.tsx        # Context provider and state management
├── hooks/
│   ├── use-breadcrumbs.ts            # Primary breadcrumb hook
│   └── use-page-breadcrumbs.ts       # Page-specific breadcrumb hook
├── config/
│   └── breadcrumb-routes.ts          # Route configuration mapping
└── utils/
    ├── breadcrumb-generator.ts       # Automatic breadcrumb generation
    └── route-matcher.ts              # Route matching utilities

components/
├── navigation/
│   ├── dynamic-breadcrumbs.tsx       # Main breadcrumb component
│   ├── breadcrumb-item-enhanced.tsx  # Enhanced breadcrumb item
│   ├── breadcrumb-overflow.tsx       # Overflow handling component
│   └── mobile-breadcrumbs.tsx        # Mobile-specific breadcrumb component
└── ui/
    └── breadcrumb.tsx                # Base breadcrumb components (existing)
```

### Context Implementation

**Breadcrumb Context Provider**:
```tsx
// lib/context/breadcrumb-context.tsx
import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { generateBreadcrumbsFromPath } from '@/lib/utils/breadcrumb-generator';

const BreadcrumbContext = createContext<BreadcrumbContextValue | undefined>(undefined);

export const BreadcrumbProvider: React.FC<BreadcrumbProviderProps> = ({
  children,
  defaultMaxItems = 4,
  routeConfig,
}) => {
  const [items, setItems] = useState<BreadcrumbItem[]>([]);
  const [maxItems, setMaxItems] = useState(defaultMaxItems);
  const router = useRouter();

  // Auto-generate breadcrumbs on route change
  useEffect(() => {
    if (routeConfig && typeof window !== 'undefined') {
      const path = window.location.pathname;
      const autoGeneratedItems = generateBreadcrumbsFromPath(path, routeConfig);
      setItems(autoGeneratedItems);
    }
  }, [router.pathname, routeConfig]);

  const contextValue: BreadcrumbContextValue = {
    items,
    maxItems,
    setItems,
    addItem: (item) => setItems(prev => [...prev, item]),
    updateItem: (id, updates) => setItems(prev =>
      prev.map(item => item.id === id ? { ...item, ...updates } : item)
    ),
    removeItem: (id) => setItems(prev => prev.filter(item => item.id !== id)),
    clearItems: () => setItems([]),
    setMaxItems,
  };

  return (
    <BreadcrumbContext.Provider value={contextValue}>
      {children}
    </BreadcrumbContext.Provider>
  );
};

export const useBreadcrumbContext = () => {
  const context = useContext(BreadcrumbContext);
  if (!context) {
    throw new Error('useBreadcrumbContext must be used within BreadcrumbProvider');
  }
  return context;
};
```

### Hook Implementation

**Primary Breadcrumb Hook**:
```tsx
// lib/hooks/use-breadcrumbs.ts
export const useBreadcrumbs = (options: UseBreadcrumbsOptions = {}): UseBreadcrumbsReturn => {
  const context = useBreadcrumbContext();
  const [isReady, setIsReady] = useState(false);

  const {
    items: providedItems,
    autoGenerate = true,
    maxItems,
    clearOnUnmount = true,
  } = options;

  useEffect(() => {
    if (providedItems) {
      context.setItems(providedItems);
    }

    if (maxItems) {
      context.setMaxItems(maxItems);
    }

    setIsReady(true);

    return () => {
      if (clearOnUnmount) {
        context.clearItems();
      }
    };
  }, [providedItems, maxItems, clearOnUnmount, context]);

  const updateCurrentPage = useCallback((title: string, metadata?: Record<string, any>) => {
    context.updateItem(
      context.items[context.items.length - 1]?.id,
      { title, metadata }
    );
  }, [context]);

  return {
    items: context.items,
    setItems: context.setItems,
    addItem: context.addItem,
    updateCurrentPage,
    clearItems: context.clearItems,
    isReady,
  };
};
```

**Page-Specific Hook**:
```tsx
// lib/hooks/use-page-breadcrumbs.ts
export const usePageBreadcrumbs = (options: UsePageBreadcrumbsOptions = {}) => {
  const router = useRouter();
  const { setItems } = useBreadcrumbContext();

  const {
    title,
    customItems,
    includeAutoGenerated = true,
  } = options;

  useEffect(() => {
    if (customItems) {
      setItems(customItems);
    } else if (includeAutoGenerated) {
      // Generate breadcrumbs automatically from current route
      const autoItems = generateFromCurrentRoute(router.pathname);

      if (title && autoItems.length > 0) {
        autoItems[autoItems.length - 1].title = title;
      }

      setItems(autoItems);
    }
  }, [title, customItems, includeAutoGenerated, router.pathname, setItems]);
};
```

### Route Generation Utilities

**Breadcrumb Generator**:
```tsx
// lib/utils/breadcrumb-generator.ts
export const generateBreadcrumbsFromPath = (
  path: string,
  routeConfig: RouteConfig
): BreadcrumbItem[] => {
  const segments = path.split('/').filter(Boolean);
  const breadcrumbs: BreadcrumbItem[] = [];

  // Always start with home/dashboard
  breadcrumbs.push({
    id: 'home',
    title: routeConfig.defaultTitle,
    href: routeConfig.homeRoute,
    isCurrentPage: false,
  });

  let currentPath = '';

  for (let i = 0; i < segments.length; i++) {
    currentPath += `/${segments[i]}`;
    const route = findRouteByPath(currentPath, routeConfig.routes);

    if (route) {
      const isLast = i === segments.length - 1;

      breadcrumbs.push({
        id: route.path,
        title: route.title,
        href: route.path,
        isCurrentPage: isLast,
        icon: route.icon,
      });
    }
  }

  return breadcrumbs;
};

const findRouteByPath = (path: string, routes: RouteConfigItem[]): RouteConfigItem | null => {
  for (const route of routes) {
    if (route.path === path || matchDynamicRoute(route.path, path)) {
      return route;
    }

    if (route.children) {
      const childRoute = findRouteByPath(path, route.children);
      if (childRoute) return childRoute;
    }
  }

  return null;
};

const matchDynamicRoute = (routePath: string, actualPath: string): boolean => {
  const routeSegments = routePath.split('/');
  const actualSegments = actualPath.split('/');

  if (routeSegments.length !== actualSegments.length) return false;

  return routeSegments.every((segment, index) => {
    if (segment.startsWith('[') && segment.endsWith(']')) {
      return true; // Dynamic segment matches anything
    }
    return segment === actualSegments[index];
  });
};
```

## Accessibility Specifications

### ARIA Implementation

**Breadcrumb Navigation ARIA**:
```tsx
<nav aria-label="Breadcrumb navigation">
  <ol role="list" className="breadcrumb-list">
    {items.map((item, index) => (
      <li key={item.id} role="listitem">
        {item.isCurrentPage ? (
          <span aria-current="page" className="current-page">
            {item.title}
          </span>
        ) : (
          <a href={item.href} aria-label={`Go to ${item.title}`}>
            {item.title}
          </a>
        )}
        {index < items.length - 1 && (
          <span aria-hidden="true" className="separator">
            /
          </span>
        )}
      </li>
    ))}
  </ol>
</nav>
```

**Screen Reader Announcements**:
```tsx
const BreadcrumbAnnouncer: React.FC<{ items: BreadcrumbItem[] }> = ({ items }) => {
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (items.length > 0) {
      const currentPage = items[items.length - 1];
      const breadcrumbPath = items.map(item => item.title).join(' > ');
      setAnnouncement(`Navigated to ${currentPage.title}. Breadcrumb: ${breadcrumbPath}`);
    }
  }, [items]);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {announcement}
    </div>
  );
};
```

### Keyboard Navigation

**Keyboard Support**:
- **Tab**: Navigate through breadcrumb links
- **Enter/Space**: Activate breadcrumb link
- **Escape**: Close overflow dropdown if open
- **Arrow Keys**: Navigate within overflow dropdown

**Focus Management**:
```tsx
const BreadcrumbWithFocus: React.FC<BreadcrumbProps> = (props) => {
  const breadcrumbRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Manage focus when breadcrumbs change
    const currentPageElement = breadcrumbRef.current?.querySelector('[aria-current="page"]');
    if (currentPageElement && document.activeElement === document.body) {
      // Only focus if no other element has focus
      (currentPageElement as HTMLElement).focus();
    }
  }, [props.items]);

  return (
    <nav ref={breadcrumbRef} aria-label="Breadcrumb navigation">
      {/* Breadcrumb content */}
    </nav>
  );
};
```

## Performance Considerations

### Optimization Strategies

**Memoization**:
```tsx
const DynamicBreadcrumbs = memo<DynamicBreadcrumbsProps>(({
  maxItems,
  separator,
  className,
  ...props
}) => {
  const { items } = useBreadcrumbContext();

  const visibleItems = useMemo(() => {
    return items.slice(-maxItems);
  }, [items, maxItems]);

  const memoizedSeparator = useMemo(() => {
    return separator || <ChevronRight className="h-4 w-4" />;
  }, [separator]);

  return (
    <Breadcrumb className={className}>
      {/* Render breadcrumb items */}
    </Breadcrumb>
  );
});
```

**Debounced Updates**:
```tsx
const useDebouncedBreadcrumbs = (items: BreadcrumbItem[], delay = 100) => {
  const [debouncedItems, setDebouncedItems] = useState(items);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedItems(items);
    }, delay);

    return () => clearTimeout(timer);
  }, [items, delay]);

  return debouncedItems;
};
```

### Memory Management

**Context Cleanup**:
```tsx
export const BreadcrumbProvider: React.FC<BreadcrumbProviderProps> = ({
  children,
  ...props
}) => {
  const [items, setItems] = useState<BreadcrumbItem[]>([]);

  // Cleanup function to prevent memory leaks
  useEffect(() => {
    return () => {
      setItems([]);
    };
  }, []);

  // Context implementation
};
```

## Testing Specifications

### Unit Testing

**Context Testing**:
```tsx
// __tests__/breadcrumb-context.test.tsx
describe('BreadcrumbContext', () => {
  it('provides breadcrumb state management', () => {
    const { result } = renderHook(() => useBreadcrumbContext(), {
      wrapper: ({ children }) => (
        <BreadcrumbProvider>{children}</BreadcrumbProvider>
      ),
    });

    expect(result.current.items).toEqual([]);

    act(() => {
      result.current.addItem({
        id: 'test',
        title: 'Test',
        href: '/test',
        isCurrentPage: true,
      });
    });

    expect(result.current.items).toHaveLength(1);
  });
});
```

**Component Testing**:
```tsx
// __tests__/dynamic-breadcrumbs.test.tsx
describe('DynamicBreadcrumbs', () => {
  it('renders breadcrumb items correctly', () => {
    const mockItems = [
      { id: '1', title: 'Home', href: '/', isCurrentPage: false },
      { id: '2', title: 'Dashboard', href: '/dashboard', isCurrentPage: true },
    ];

    render(
      <BreadcrumbProvider>
        <BreadcrumbContextSetter items={mockItems} />
        <DynamicBreadcrumbs />
      </BreadcrumbProvider>
    );

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toHaveAttribute('aria-current', 'page');
  });

  it('handles overflow correctly', () => {
    const manyItems = Array.from({ length: 6 }, (_, i) => ({
      id: String(i),
      title: `Item ${i}`,
      href: `/item-${i}`,
      isCurrentPage: i === 5,
    }));

    render(
      <BreadcrumbProvider>
        <BreadcrumbContextSetter items={manyItems} />
        <DynamicBreadcrumbs maxItems={3} />
      </BreadcrumbProvider>
    );

    expect(screen.getByRole('button', { name: /show more/i })).toBeInTheDocument();
  });
});
```

### Integration Testing

**Route Integration Testing**:
```tsx
// __tests__/breadcrumb-integration.test.tsx
describe('Breadcrumb Route Integration', () => {
  it('updates breadcrumbs on route change', async () => {
    const { push } = useRouter();

    render(
      <BreadcrumbProvider routeConfig={testRouteConfig}>
        <DynamicBreadcrumbs />
      </BreadcrumbProvider>
    );

    act(() => {
      push('/dashboard/chatbots');
    });

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Chatbots')).toBeInTheDocument();
    });
  });
});
```

### E2E Testing

**Breadcrumb Navigation E2E**:
```typescript
// e2e/breadcrumb-navigation.spec.ts
test('breadcrumb navigation works correctly', async ({ page }) => {
  await page.goto('/dashboard');

  // Verify initial breadcrumb
  await expect(page.locator('[aria-label="Breadcrumb navigation"]')).toContainText('Dashboard');

  // Navigate to chatbots
  await page.click('text=Chatbots');
  await expect(page.locator('[aria-label="Breadcrumb navigation"]')).toContainText('Dashboard > Chatbots');

  // Test breadcrumb back navigation
  await page.click('text=Dashboard');
  await expect(page).toHaveURL('/dashboard');
});

test('mobile breadcrumb behavior', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/dashboard/chatbots/123');

  // Mobile should show back button instead of full breadcrumb
  await expect(page.locator('button:has-text("Back")')).toBeVisible();

  // Test back navigation
  await page.click('button:has-text("Back")');
  await expect(page).toHaveURL('/dashboard/chatbots');
});
```

## Migration Strategy

### Phase 1: Context Setup (Day 1)
1. Create breadcrumb context and provider
2. Implement basic hooks (`useBreadcrumbs`, `usePageBreadcrumbs`)
3. Create route configuration system
4. Add provider to dashboard layout

### Phase 2: Component Implementation (Day 1-2)
1. Build `DynamicBreadcrumbs` component
2. Implement overflow handling
3. Add mobile-specific breadcrumb behavior
4. Create accessibility features

### Phase 3: Layout Integration (Day 2)
1. Update `app/dashboard/layout.tsx` to use dynamic breadcrumbs
2. Remove hardcoded breadcrumb implementation
3. Test breadcrumb updates with route changes

### Phase 4: Page Integration (Day 2-3)
1. Update existing pages to use breadcrumb hooks
2. Remove duplicate headers from pages
3. Add page-specific breadcrumb customization
4. Test all navigation scenarios

### Phase 5: Testing & Polish (Day 3)
1. Comprehensive unit and integration testing
2. E2E testing for breadcrumb navigation
3. Accessibility testing and improvements
4. Performance optimization and cleanup

This specification provides a complete blueprint for implementing dynamic breadcrumb navigation that will significantly improve the user experience and eliminate the current static breadcrumb limitations.