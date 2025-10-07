# UI/UX Design Guidelines - Phase 3: Dashboard Redesign & Chat Implementation

## Design Philosophy

The Phase 3 design system focuses on **clarity, efficiency, and real-time responsiveness** while maintaining consistency with the existing shadcn/ui design language. Our approach emphasizes progressive disclosure, contextual navigation, and seamless real-time interactions.

### Core Design Principles

1. **Information Hierarchy**: Most critical information prominently displayed with clear visual priorities
2. **Real-time Feedback**: Live updates with subtle animations and status indicators
3. **Progressive Disclosure**: Overview first, with drill-down details accessible on interaction
4. **Action-Oriented Design**: Clear call-to-action buttons for common workflows
5. **Accessibility First**: WCAG 2.1 AA compliance with keyboard navigation and screen reader support

## Visual Design System

### Color Palette & Theming

**Primary Color Scheme** (Inheriting from existing system):
```css
/* Light Mode */
--primary: 220 14% 16%;          /* Dashboard headers, primary buttons */
--secondary: 210 40% 98%;        /* Card backgrounds, subtle highlights */
--accent: 210 40% 98%;           /* Interactive elements, hover states */
--muted: 210 40% 98%;            /* Disabled states, placeholders */

/* Status Colors */
--success: 142 76% 36%;          /* Active widgets, healthy systems */
--warning: 38 92% 50%;           /* Pending actions, moderate alerts */
--destructive: 0 84% 60%;        /* Errors, critical alerts */
--info: 221 83% 53%;             /* Information, chat messages */

/* Real-time Indicators */
--live-pulse: 142 76% 36%;       /* Live update indicators */
--connection-good: 142 76% 36%;   /* WebSocket connected */
--connection-poor: 38 92% 50%;    /* WebSocket reconnecting */
--connection-lost: 0 84% 60%;     /* WebSocket disconnected */
```

**Dark Mode Support**:
- Automatic theme switching based on system preference
- Consistent color relationships across light and dark modes
- Enhanced contrast for chat interface and real-time indicators

### Typography Scale

**Heading Hierarchy**:
```css
/* Dashboard Headers */
.dashboard-title { @apply text-3xl font-bold tracking-tight; }      /* Main dashboard title */
.card-title { @apply text-lg font-semibold; }                       /* Dashboard card titles */
.metric-value { @apply text-2xl font-bold; }                        /* Large metric numbers */
.metric-label { @apply text-sm font-medium text-muted-foreground; } /* Metric descriptions */

/* Chat Interface */
.chat-message { @apply text-sm leading-relaxed; }                   /* Chat message text */
.chat-timestamp { @apply text-xs text-muted-foreground; }           /* Message timestamps */
.chat-status { @apply text-xs font-medium; }                        /* Message status indicators */

/* Navigation */
.breadcrumb-item { @apply text-sm font-medium; }                    /* Breadcrumb navigation */
.nav-label { @apply text-sm font-medium; }                          /* Sidebar navigation */
```

### Spacing & Layout

**Dashboard Grid System**:
```css
/* Dashboard Card Layout */
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.5rem;
  padding: 1.5rem;
}

/* Chat Interface Layout */
.chat-container {
  display: grid;
  grid-template-columns: 280px 1fr;
  height: calc(100vh - 4rem);
  gap: 0;
}

@media (max-width: 768px) {
  .chat-container {
    grid-template-columns: 1fr;
  }
}
```

**Responsive Breakpoints**:
- **Mobile**: < 768px (Single column, collapsible navigation)
- **Tablet**: 768px - 1024px (Two columns, adaptive layout)
- **Desktop**: > 1024px (Full grid layout, expanded sidebar)

## Component Design Specifications

### Dashboard Cards

#### Widget Stats Card
```tsx
interface WidgetStatsCardProps {
  activeWidgets: number;
  totalDeployments: number;
  topDomains: string[];
  deploymentSuccess: number;
  loading?: boolean;
}
```

**Visual Design**:
- **Header**: Icon + "Widget Deployments" title + real-time indicator
- **Primary Metric**: Large number (active widgets) with trend indicator
- **Secondary Metrics**: Grid of deployment stats with color-coded status
- **Footer**: Top performing domains with usage percentages

**States**:
- **Loading**: Skeleton placeholder animation
- **Error**: Error message with retry action
- **Real-time**: Pulse animation on data updates

#### Live Metrics Card
```tsx
interface LiveMetricsCardProps {
  activeConversations: number;
  messagesPerMinute: number;
  averageResponseTime: number;
  onlineUsers: number;
  connectionStatus: 'connected' | 'reconnecting' | 'disconnected';
}
```

**Visual Design**:
- **Header**: Activity icon + "Live Metrics" + connection status indicator
- **Metrics Grid**: 2x2 grid with real-time values and mini trend charts
- **Status Bar**: WebSocket connection status with color-coded indicator
- **Updates**: Smooth number transitions and highlight animations

#### System Health Card
```tsx
interface SystemHealthCardProps {
  apiUptime: number;
  databaseLatency: number;
  cacheHitRate: number;
  errorRate: number;
  alerts: Alert[];
}
```

**Visual Design**:
- **Header**: Health icon + "System Health" + overall status badge
- **Health Indicators**: Progress bars for key metrics with thresholds
- **Alert Section**: Collapsible critical alerts with action buttons
- **Status Colors**: Green (healthy), Yellow (warning), Red (critical)

### Chat Interface

#### Chat Message Design
```tsx
interface ChatMessageProps {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'error';
  metadata?: MessageMetadata;
}
```

**Visual Design**:
- **User Messages**: Right-aligned, blue background, rounded corners
- **Assistant Messages**: Left-aligned, gray background, bot avatar
- **Status Indicators**: Small icons with tooltips (checkmarks, clock, error)
- **Timestamps**: Subtle, appears on hover or for important messages
- **Metadata**: Expandable section for response time, knowledge sources

#### Message Input Component
```tsx
interface MessageInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  characterLimit?: number;
  typingIndicator?: boolean;
}
```

**Visual Design**:
- **Input Field**: Multi-line with auto-resize, placeholder text
- **Send Button**: Icon button with loading state, disabled when empty
- **Character Counter**: Subtle indicator, warning when approaching limit
- **Typing Indicator**: Animated dots when other party is typing

#### Conversation Sidebar
```tsx
interface ConversationSidebarProps {
  conversations: Conversation[];
  activeConversationId: string;
  onSelectConversation: (id: string) => void;
  onStartNewConversation: () => void;
}
```

**Visual Design**:
- **Header**: "Conversations" title + new conversation button
- **Conversation List**: Scrollable list with search/filter
- **Conversation Item**: Preview text, timestamp, unread indicator
- **Active State**: Highlighted background, border accent

### Navigation Components

#### Dynamic Breadcrumbs
```tsx
interface BreadcrumbItem {
  title: string;
  href: string;
  isCurrentPage: boolean;
  icon?: LucideIcon;
}

interface DynamicBreadcrumbsProps {
  items: BreadcrumbItem[];
  maxItems?: number;
  separator?: ReactNode;
}
```

**Visual Design**:
- **Container**: Horizontal layout with separators
- **Separators**: Chevron right icons with muted color
- **Items**: Clickable links with hover states, current page emphasized
- **Overflow**: Ellipsis with dropdown for long breadcrumb chains
- **Mobile**: Collapsible to show only current page + back button

#### Enhanced Sidebar
```tsx
interface SidebarItem {
  title: string;
  href: string;
  icon: LucideIcon;
  isActive: boolean;
  badge?: string | number;
  children?: SidebarItem[];
}
```

**Visual Design**:
- **Section Headers**: Uppercase labels with subtle dividers
- **Navigation Items**: Icon + label with hover and active states
- **Active Indicator**: Left border or background highlight
- **Badges**: Small pills for counts (unread messages, alerts)
- **Collapsible**: Icon-only mode with tooltips

## Real-time UI Patterns

### Live Update Indicators

**Pulse Animation**:
```css
@keyframes live-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.live-indicator {
  animation: live-pulse 2s infinite;
  color: hsl(var(--live-pulse));
}
```

**Data Update Transitions**:
```css
.metric-value {
  transition: all 0.3s ease-in-out;
}

.metric-value.updating {
  transform: scale(1.05);
  color: hsl(var(--live-pulse));
}
```

### Connection Status Indicators

**WebSocket Status**:
- **Connected**: Green dot with "Connected" label
- **Reconnecting**: Pulsing yellow dot with "Reconnecting..." label
- **Disconnected**: Red dot with "Disconnected" label and retry button

**Visual Implementation**:
```tsx
<div className="flex items-center gap-2">
  <div className={`w-2 h-2 rounded-full ${connectionStatusColor}`} />
  <span className="text-sm font-medium">{connectionStatusText}</span>
  {status === 'disconnected' && (
    <Button size="sm" variant="outline" onClick={onReconnect}>
      Retry
    </Button>
  )}
</div>
```

### Loading States

**Skeleton Loading**:
```tsx
const DashboardCardSkeleton = () => (
  <Card>
    <CardHeader>
      <Skeleton className="h-5 w-32" />
    </CardHeader>
    <CardContent>
      <Skeleton className="h-8 w-20 mb-4" />
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-4 w-3/4" />
    </CardContent>
  </Card>
);
```

**Progressive Loading**:
- Dashboard cards load independently
- Chat messages appear with fade-in animation
- Real-time updates with smooth transitions

## Responsive Design Guidelines

### Mobile-First Approach

**Dashboard Mobile Layout**:
- Single column card layout
- Collapsible sidebar navigation
- Touch-friendly button sizes (minimum 44px)
- Swipe gestures for card navigation

**Chat Mobile Optimization**:
- Full-screen chat interface
- Slide-out conversation sidebar
- Fixed input at bottom with proper keyboard handling
- Touch-optimized message bubbles

### Tablet Adaptations

**Dashboard Tablet Layout**:
- Two-column card grid
- Hybrid sidebar (icons + labels)
- Larger touch targets for precise interaction
- Landscape/portrait orientation support

**Chat Tablet Interface**:
- Split-screen layout (conversations + chat)
- Optimized for both portrait and landscape
- Drag-to-resize conversation sidebar
- Multi-touch gesture support

### Desktop Enhancements

**Dashboard Desktop Features**:
- Three-column card grid with hover interactions
- Full sidebar with expanded navigation
- Keyboard shortcuts for quick actions
- Hover states for additional information

**Chat Desktop Interface**:
- Side-by-side conversation and chat panels
- Keyboard shortcuts for navigation
- Rich hover states and tooltips
- Multiple conversation tabs (future feature)

## Accessibility Standards

### WCAG 2.1 AA Compliance

**Color and Contrast**:
- Minimum 4.5:1 contrast ratio for normal text
- Minimum 3:1 contrast ratio for large text
- Color is not the only means of conveying information
- Status indicators include text labels and icons

**Keyboard Navigation**:
- All interactive elements accessible via keyboard
- Logical tab order throughout the interface
- Visible focus indicators on all focusable elements
- Escape key closes modals and dropdowns

**Screen Reader Support**:
- Semantic HTML structure with proper headings
- ARIA labels for interactive elements
- Live regions for dynamic content updates
- Descriptive alt text for all images and icons

### Implementation Examples

**Dashboard Card Accessibility**:
```tsx
<Card role="region" aria-labelledby="widget-stats-title">
  <CardHeader>
    <CardTitle id="widget-stats-title">
      Widget Deployments
      <span className="sr-only">
        , {activeWidgets} active widgets
      </span>
    </CardTitle>
  </CardHeader>
  <CardContent>
    <div
      aria-live="polite"
      aria-label="Live widget statistics"
    >
      {/* Real-time metrics */}
    </div>
  </CardContent>
</Card>
```

**Chat Message Accessibility**:
```tsx
<div
  role="log"
  aria-live="polite"
  aria-label="Chat conversation"
>
  {messages.map(message => (
    <div
      key={message.id}
      role="article"
      aria-label={`Message from ${message.sender} at ${message.timestamp}`}
    >
      {message.content}
    </div>
  ))}
</div>
```

## Animation & Interaction Design

### Micro-interactions

**Button Interactions**:
```css
.dashboard-button {
  transition: all 0.2s ease-in-out;
}

.dashboard-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.dashboard-button:active {
  transform: translateY(0);
}
```

**Card Hover Effects**:
```css
.dashboard-card {
  transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
}

.dashboard-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
}
```

### Real-time Animations

**Message Arrival Animation**:
```css
@keyframes message-slide-in {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.chat-message.new {
  animation: message-slide-in 0.3s ease-out;
}
```

**Typing Indicator Animation**:
```css
@keyframes typing-dots {
  0%, 20% { opacity: 0; }
  50% { opacity: 1; }
  80%, 100% { opacity: 0; }
}

.typing-dot {
  animation: typing-dots 1.4s infinite;
}

.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }
```

### Page Transitions

**Route Transition Effects**:
```tsx
// Using Framer Motion for smooth page transitions
const pageVariants = {
  initial: { opacity: 0, x: -20 },
  in: { opacity: 1, x: 0 },
  out: { opacity: 0, x: 20 }
};

const pageTransition = {
  type: "tween",
  ease: "anticipate",
  duration: 0.4
};
```

## Performance Considerations

### Optimization Strategies

**Lazy Loading**:
- Dashboard cards load data independently
- Chat conversation history loads on scroll
- Images and media lazy load with intersection observer

**Virtualization**:
- Chat message list virtualized for long conversations
- Conversation sidebar virtualized for many conversations
- Dashboard activity feed virtualized for performance

**Debouncing**:
- Search input debounced at 300ms
- Real-time updates throttled to prevent overwhelming UI
- Resize events debounced for responsive layout adjustments

### Memory Management

**Component Cleanup**:
```tsx
useEffect(() => {
  const subscription = websocket.subscribe(handleMessage);

  return () => {
    subscription.unsubscribe();
  };
}, []);
```

**State Optimization**:
- Memoized selectors for complex state calculations
- Proper dependency arrays for useEffect hooks
- Cleanup of event listeners and subscriptions

## Error Handling & Edge Cases

### Error State Design

**Dashboard Error States**:
- Network error: Retry button with last successful data timestamp
- API error: Error message with diagnostic information
- No data: Empty state with helpful guidance

**Chat Error Handling**:
- Message send failure: Retry option with error indication
- Connection loss: Offline indicator with reconnection status
- Rate limit: User-friendly message with wait time

### Edge Case Considerations

**Long Content Handling**:
- Dashboard metric values with number formatting (1.2K, 1.2M)
- Chat messages with text wrapping and overflow handling
- Breadcrumb overflow with ellipsis and dropdown

**Extreme Data Scenarios**:
- Dashboard with zero data (empty states)
- Chat with thousands of messages (virtualization)
- Very long conversation titles (truncation with tooltip)

## Implementation Guidelines

### Component Development Standards

**File Organization**:
```
components/
├── dashboard/
│   ├── index.ts                    # Barrel exports
│   ├── widget-stats-card.tsx      # Individual card components
│   └── __tests__/                 # Component tests
├── chat/
│   ├── index.ts
│   ├── chat-interface.tsx
│   └── __tests__/
└── navigation/
    ├── index.ts
    ├── dynamic-breadcrumbs.tsx
    └── __tests__/
```

**Component Props Pattern**:
```tsx
interface ComponentProps {
  // Required props first
  data: Data;
  onAction: (action: Action) => void;

  // Optional props with defaults
  loading?: boolean;
  error?: Error;
  className?: string;

  // Event handlers
  onRetry?: () => void;
  onConfigChange?: (config: Config) => void;
}
```

### Testing Strategy

**Component Testing**:
```tsx
describe('WidgetStatsCard', () => {
  it('displays loading state correctly', () => {
    render(<WidgetStatsCard loading={true} />);
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  });

  it('handles real-time updates', async () => {
    const { rerender } = render(<WidgetStatsCard data={initialData} />);
    rerender(<WidgetStatsCard data={updatedData} />);

    await waitFor(() => {
      expect(screen.getByText(updatedData.activeWidgets)).toBeInTheDocument();
    });
  });
});
```

**Visual Regression Testing**:
- Storybook stories for all components
- Chromatic for visual regression testing
- Screenshots for different viewport sizes

This comprehensive design guide ensures consistent, accessible, and performant user interfaces throughout Phase 3 implementation while maintaining harmony with the existing design system.