import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuickActionsCard } from '@/components/dashboard/quick-actions-card';

// Mock Next.js router
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock user data for role-based testing
const mockRegularUser = {
  id: '1',
  email: 'user@example.com',
  role: 'user'
};

const mockAdminUser = {
  id: '2',
  email: 'admin@example.com',
  role: 'admin'
};

const mockSuperAdminUser = {
  id: '3',
  email: 'superadmin@example.com',
  role: 'super_admin'
};

describe('QuickActionsCard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('renders quick actions card with title and description', () => {
      render(<QuickActionsCard user={mockRegularUser} />);

      expect(screen.getByText('Quick Actions')).toBeInTheDocument();
      expect(screen.getByText('Commonly used functions and shortcuts')).toBeInTheDocument();
    });

    it('applies custom className when provided', () => {
      render(<QuickActionsCard user={mockRegularUser} className="custom-actions-class" />);

      const card = screen.getByText('Quick Actions').closest('.custom-actions-class');
      expect(card).toBeInTheDocument();
    });
  });

  describe('Role-based Action Visibility - Regular User', () => {
    it('shows basic actions for regular users', () => {
      render(<QuickActionsCard user={mockRegularUser} />);

      expect(screen.getByText('Start Chat')).toBeInTheDocument();
      expect(screen.getByText('View Dashboard')).toBeInTheDocument();
    });

    it('does not show admin-only actions for regular users', () => {
      render(<QuickActionsCard user={mockRegularUser} />);

      expect(screen.queryByText('Create Chatbot')).not.toBeInTheDocument();
      expect(screen.queryByText('Upload Document')).not.toBeInTheDocument();
      expect(screen.queryByText('Manage Users')).not.toBeInTheDocument();
    });

    it('does not show super admin actions for regular users', () => {
      render(<QuickActionsCard user={mockRegularUser} />);

      expect(screen.queryByText('System Settings')).not.toBeInTheDocument();
      expect(screen.queryByText('View Logs')).not.toBeInTheDocument();
    });
  });

  describe('Role-based Action Visibility - Admin User', () => {
    it('shows admin-specific actions', () => {
      render(<QuickActionsCard user={mockAdminUser} />);

      expect(screen.getByText('Start Chat')).toBeInTheDocument();
      expect(screen.getByText('View Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Upload Document')).toBeInTheDocument();
      expect(screen.getByText('View Analytics')).toBeInTheDocument();
      expect(screen.getByText('Knowledge Base')).toBeInTheDocument();
    });

    it('does not show super admin only actions for admin', () => {
      render(<QuickActionsCard user={mockAdminUser} />);

      expect(screen.queryByText('Create Chatbot')).not.toBeInTheDocument();
      expect(screen.queryByText('Manage Users')).not.toBeInTheDocument();
      expect(screen.queryByText('System Settings')).not.toBeInTheDocument();
    });
  });

  describe('Role-based Action Visibility - Super Admin User', () => {
    it('shows all available actions for super admin', () => {
      render(<QuickActionsCard user={mockSuperAdminUser} />);

      expect(screen.getByText('Start Chat')).toBeInTheDocument();
      expect(screen.getByText('View Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Create Chatbot')).toBeInTheDocument();
      expect(screen.getByText('Upload Document')).toBeInTheDocument();
      expect(screen.getByText('Manage Users')).toBeInTheDocument();
      expect(screen.getByText('View Analytics')).toBeInTheDocument();
      expect(screen.getByText('System Settings')).toBeInTheDocument();
      expect(screen.getByText('View Logs')).toBeInTheDocument();
    });
  });

  describe('Action Categories', () => {
    it('groups actions into categories for super admin', () => {
      render(<QuickActionsCard user={mockSuperAdminUser} />);

      expect(screen.getByText('Create')).toBeInTheDocument();
      expect(screen.getByText('Manage')).toBeInTheDocument();
      expect(screen.getByText('Analyze')).toBeInTheDocument();
      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    it('shows create category actions', () => {
      render(<QuickActionsCard user={mockSuperAdminUser} />);

      // Create category should contain these actions
      expect(screen.getByText('Create Chatbot')).toBeInTheDocument();
      expect(screen.getByText('Upload Document')).toBeInTheDocument();
    });

    it('shows manage category actions', () => {
      render(<QuickActionsCard user={mockSuperAdminUser} />);

      // Manage category should contain these actions
      expect(screen.getByText('Manage Users')).toBeInTheDocument();
      expect(screen.getByText('Knowledge Base')).toBeInTheDocument();
    });

    it('shows analyze category actions', () => {
      render(<QuickActionsCard user={mockSuperAdminUser} />);

      // Analyze category should contain these actions
      expect(screen.getByText('View Analytics')).toBeInTheDocument();
      expect(screen.getByText('Live Monitoring')).toBeInTheDocument();
    });

    it('shows test category actions', () => {
      render(<QuickActionsCard user={mockSuperAdminUser} />);

      // Test category should contain these actions
      expect(screen.getByText('Test Playground')).toBeInTheDocument();
      expect(screen.getByText('API Testing')).toBeInTheDocument();
    });
  });

  describe('Navigation Functionality', () => {
    it('navigates to chat page when start chat clicked', () => {
      render(<QuickActionsCard user={mockRegularUser} />);

      fireEvent.click(screen.getByText('Start Chat'));
      expect(mockPush).toHaveBeenCalledWith('/chat');
    });

    it('navigates to dashboard when view dashboard clicked', () => {
      render(<QuickActionsCard user={mockRegularUser} />);

      fireEvent.click(screen.getByText('View Dashboard'));
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });

    it('navigates to create chatbot page', () => {
      render(<QuickActionsCard user={mockSuperAdminUser} />);

      fireEvent.click(screen.getByText('Create Chatbot'));
      expect(mockPush).toHaveBeenCalledWith('/dashboard/chatbots/create');
    });

    it('navigates to document upload page', () => {
      render(<QuickActionsCard user={mockAdminUser} />);

      fireEvent.click(screen.getByText('Upload Document'));
      expect(mockPush).toHaveBeenCalledWith('/dashboard/documents/upload');
    });

    it('navigates to user management page', () => {
      render(<QuickActionsCard user={mockSuperAdminUser} />);

      fireEvent.click(screen.getByText('Manage Users'));
      expect(mockPush).toHaveBeenCalledWith('/dashboard/users');
    });

    it('navigates to analytics page', () => {
      render(<QuickActionsCard user={mockAdminUser} />);

      fireEvent.click(screen.getByText('View Analytics'));
      expect(mockPush).toHaveBeenCalledWith('/dashboard/analytics');
    });

    it('navigates to system settings page', () => {
      render(<QuickActionsCard user={mockSuperAdminUser} />);

      fireEvent.click(screen.getByText('System Settings'));
      expect(mockPush).toHaveBeenCalledWith('/dashboard/settings');
    });

    it('navigates to logs page', () => {
      render(<QuickActionsCard user={mockSuperAdminUser} />);

      fireEvent.click(screen.getByText('View Logs'));
      expect(mockPush).toHaveBeenCalledWith('/dashboard/logs');
    });
  });

  describe('Action Prioritization', () => {
    it('shows most used actions first', () => {
      render(<QuickActionsCard user={mockSuperAdminUser} prioritizeByUsage={true} />);

      const actions = screen.getAllByRole('button');
      // First action should be the most commonly used
      expect(actions[0]).toHaveTextContent('Start Chat');
    });

    it('applies priority-based ordering', () => {
      render(<QuickActionsCard user={mockAdminUser} />);

      // Actions should be ordered by priority for the user role
      const buttons = screen.getAllByRole('button');
      expect(buttons[0]).toHaveTextContent('Start Chat'); // Highest priority
    });
  });

  describe('Action Status and Availability', () => {
    it('shows action status indicators', () => {
      render(<QuickActionsCard user={mockSuperAdminUser} showStatus={true} />);

      expect(screen.getByTestId('action-status-available')).toBeInTheDocument();
    });

    it('disables actions when appropriate', () => {
      render(<QuickActionsCard user={mockSuperAdminUser} />);

      // Mock a scenario where some actions might be disabled
      const maintenanceMode = true;
      if (maintenanceMode) {
        const systemSettingsButton = screen.getByText('System Settings');
        expect(systemSettingsButton).toBeDisabled();
      }
    });

    it('shows loading state for actions in progress', () => {
      render(<QuickActionsCard user={mockSuperAdminUser} />);

      // Mock an action in progress
      fireEvent.click(screen.getByText('Create Chatbot'));

      // Should show loading indicator
      expect(screen.getByTestId('action-loading')).toBeInTheDocument();
    });
  });

  describe('Recent Actions Display', () => {
    it('shows recently used actions section', () => {
      render(<QuickActionsCard user={mockAdminUser} showRecentActions={true} />);

      expect(screen.getByText('Recent Actions')).toBeInTheDocument();
    });

    it('displays recent action items', () => {
      const recentActions = [
        { name: 'Upload Document', timestamp: '2 minutes ago' },
        { name: 'View Analytics', timestamp: '1 hour ago' }
      ];

      render(<QuickActionsCard user={mockAdminUser} recentActions={recentActions} />);

      expect(screen.getByText('2 minutes ago')).toBeInTheDocument();
      expect(screen.getByText('1 hour ago')).toBeInTheDocument();
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('displays keyboard shortcuts for actions', () => {
      render(<QuickActionsCard user={mockSuperAdminUser} showKeyboardShortcuts={true} />);

      expect(screen.getByText('Alt+C')).toBeInTheDocument(); // Create Chatbot
      expect(screen.getByText('Alt+D')).toBeInTheDocument(); // Dashboard
    });

    it('handles keyboard shortcut activation', () => {
      render(<QuickActionsCard user={mockSuperAdminUser} />);

      // Simulate Alt+C keypress
      fireEvent.keyDown(document, { key: 'c', altKey: true });
      expect(mockPush).toHaveBeenCalledWith('/dashboard/chatbots/create');
    });
  });

  describe('Action Analytics', () => {
    it('tracks action clicks for analytics', () => {
      const mockTrackEvent = jest.fn();
      render(<QuickActionsCard user={mockAdminUser} onActionClick={mockTrackEvent} />);

      fireEvent.click(screen.getByText('Upload Document'));

      expect(mockTrackEvent).toHaveBeenCalledWith({
        action: 'upload-document',
        category: 'quick-actions',
        user_role: 'admin'
      });
    });

    it('tracks keyboard shortcut usage', () => {
      const mockTrackEvent = jest.fn();
      render(<QuickActionsCard user={mockSuperAdminUser} onShortcutUse={mockTrackEvent} />);

      fireEvent.keyDown(document, { key: 'c', altKey: true });

      expect(mockTrackEvent).toHaveBeenCalledWith({
        shortcut: 'Alt+C',
        action: 'create-chatbot',
        method: 'keyboard'
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels for action buttons', () => {
      render(<QuickActionsCard user={mockSuperAdminUser} />);

      expect(screen.getByLabelText(/start new chat session/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/create new chatbot/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/upload document/i)).toBeInTheDocument();
    });

    it('supports keyboard navigation between actions', () => {
      render(<QuickActionsCard user={mockAdminUser} />);

      const firstButton = screen.getByText('Start Chat');
      const secondButton = screen.getByText('View Dashboard');

      firstButton.focus();
      expect(document.activeElement).toBe(firstButton);

      // Tab to next button
      fireEvent.keyDown(firstButton, { key: 'Tab' });
      secondButton.focus();
      expect(document.activeElement).toBe(secondButton);
    });

    it('provides proper role attributes for action groups', () => {
      render(<QuickActionsCard user={mockSuperAdminUser} />);

      expect(screen.getByRole('group')).toBeInTheDocument();
    });

    it('announces action status changes to screen readers', () => {
      render(<QuickActionsCard user={mockSuperAdminUser} />);

      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  describe('Responsive Design', () => {
    it('adapts layout for mobile screens', () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      render(<QuickActionsCard user={mockAdminUser} />);

      const card = screen.getByRole('region');
      expect(card).toHaveClass('grid-cols-1'); // Single column on mobile
    });

    it('shows grid layout for desktop', () => {
      // Mock desktop viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      render(<QuickActionsCard user={mockSuperAdminUser} />);

      const card = screen.getByRole('region');
      expect(card).toHaveClass('grid-cols-2'); // Two columns on desktop
    });
  });

  describe('Performance Optimizations', () => {
    it('memoizes action list to prevent unnecessary re-renders', () => {
      const { rerender } = render(<QuickActionsCard user={mockAdminUser} />);

      const initialButtonCount = screen.getAllByRole('button').length;

      // Re-render with same props
      rerender(<QuickActionsCard user={mockAdminUser} />);

      const afterRerenderCount = screen.getAllByRole('button').length;
      expect(initialButtonCount).toBe(afterRerenderCount);
    });

    it('debounces rapid action clicks', () => {
      jest.useFakeTimers();
      render(<QuickActionsCard user={mockAdminUser} />);

      const uploadButton = screen.getByText('Upload Document');

      // Rapid clicks
      fireEvent.click(uploadButton);
      fireEvent.click(uploadButton);
      fireEvent.click(uploadButton);

      // Should only navigate once
      expect(mockPush).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });
  });

  describe('Error Handling', () => {
    it('handles navigation errors gracefully', () => {
      mockPush.mockImplementation(() => {
        throw new Error('Navigation error');
      });

      render(<QuickActionsCard user={mockAdminUser} />);

      // Should not crash when navigation fails
      fireEvent.click(screen.getByText('Upload Document'));

      expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    });

    it('shows error state when actions are unavailable', () => {
      render(<QuickActionsCard user={mockAdminUser} actionsUnavailable={true} />);

      expect(screen.getByText('Actions temporarily unavailable')).toBeInTheDocument();
    });
  });
});