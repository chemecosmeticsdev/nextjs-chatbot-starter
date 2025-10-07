import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jest } from '@jest/globals';

// Mock Next.js router
const mockPush = jest.fn();
const mockRouter = {
  push: mockPush,
  pathname: '/dashboard/chatbots/test-id/configure',
  query: { id: 'test-id' },
  asPath: '/dashboard/chatbots/test-id/configure',
  route: '/dashboard/chatbots/[id]/configure'
};

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useParams: () => ({ id: 'test-id' }),
}));

// Mock fetch for API calls
global.fetch = jest.fn();

import ConfigurePage from '@/app/dashboard/chatbots/[id]/configure/page';

const mockChatbot = {
  id: 'test-id',
  name: 'Test Chatbot',
  description: 'A test chatbot for configuration testing',
  status: 'active',
  apiKeyHint: 'cb_test_***',
  systemPrompt: 'You are a helpful assistant.',
  configuration: {
    model: 'nova-micro',
    temperature: 0.7,
    maxTokens: 1000,
    language: 'en',
    responseTimeout: 30000,
  },
  uiConfig: {
    theme: 'light',
    primaryColor: '#3b82f6',
    showTyping: true,
    showTimestamps: false,
    allowFeedback: true,
    showUserAvatar: true,
    showBotAvatar: true,
    allowFileUpload: false,
  },
  securityConfig: {
    enableRateLimit: true,
    rateLimitPerMinute: 20,
    enableProfanityFilter: true,
    allowedDomains: ['example.com'],
    blockedKeywords: ['spam', 'inappropriate'],
  },
  createdAt: '2025-10-01T10:00:00Z',
  updatedAt: '2025-10-03T07:00:00Z',
};

const mockApiResponse = {
  success: true,
  data: mockChatbot,
};

describe('Chatbot Configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    });
  });

  it('renders the configuration page with all tabs', async () => {
    render(<ConfigurePage />);

    // Check for main elements
    expect(screen.getByText('Configuration')).toBeInTheDocument();
    expect(screen.getByText('Configure your chatbot settings')).toBeInTheDocument();

    await waitFor(() => {
      // Check for tab navigation
      expect(screen.getByText('General')).toBeInTheDocument();
      expect(screen.getByText('AI Model')).toBeInTheDocument();
      expect(screen.getByText('Behavior')).toBeInTheDocument();
      expect(screen.getByText('Security')).toBeInTheDocument();
      expect(screen.getByText('Advanced')).toBeInTheDocument();
    });
  });

  it('displays chatbot information in general tab', async () => {
    render(<ConfigurePage />);

    await waitFor(() => {
      // Check for form fields
      expect(screen.getByDisplayValue('Test Chatbot')).toBeInTheDocument();
      expect(screen.getByDisplayValue('A test chatbot for configuration testing')).toBeInTheDocument();
    });
  });

  it('allows editing general chatbot information', async () => {
    const user = userEvent.setup();
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Updated successfully' }),
      });

    render(<ConfigurePage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Chatbot')).toBeInTheDocument();
    });

    // Edit chatbot name
    const nameInput = screen.getByDisplayValue('Test Chatbot');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Test Chatbot');

    // Save changes
    const saveButton = screen.getByText('Save Changes');
    await user.click(saveButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/chatbots/test-id',
        expect.objectContaining({
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: expect.stringContaining('Updated Test Chatbot'),
        })
      );
    });
  });

  it('switches between tabs correctly', async () => {
    const user = userEvent.setup();
    render(<ConfigurePage />);

    await waitFor(() => {
      expect(screen.getByText('General')).toBeInTheDocument();
    });

    // Switch to AI Model tab
    const aiModelTab = screen.getByText('AI Model');
    await user.click(aiModelTab);

    // Check for AI model configuration fields
    expect(screen.getByText('Model')).toBeInTheDocument();
    expect(screen.getByText('Temperature')).toBeInTheDocument();
    expect(screen.getByText('Max Tokens')).toBeInTheDocument();

    // Switch to Behavior tab
    const behaviorTab = screen.getByText('Behavior');
    await user.click(behaviorTab);

    // Check for behavior configuration fields
    expect(screen.getByText('Response Timeout')).toBeInTheDocument();
    expect(screen.getByText('Language')).toBeInTheDocument();
  });

  it('validates form inputs correctly', async () => {
    const user = userEvent.setup();
    render(<ConfigurePage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Chatbot')).toBeInTheDocument();
    });

    // Clear required field
    const nameInput = screen.getByDisplayValue('Test Chatbot');
    await user.clear(nameInput);

    // Try to save
    const saveButton = screen.getByText('Save Changes');
    await user.click(saveButton);

    // Should show validation error
    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    });
  });

  it('handles AI model configuration changes', async () => {
    const user = userEvent.setup();
    render(<ConfigurePage />);

    await waitFor(() => {
      expect(screen.getByText('AI Model')).toBeInTheDocument();
    });

    // Switch to AI Model tab
    const aiModelTab = screen.getByText('AI Model');
    await user.click(aiModelTab);

    // Change temperature
    const temperatureSlider = screen.getByRole('slider', { name: /temperature/i });
    fireEvent.change(temperatureSlider, { target: { value: '0.9' } });

    // Change max tokens
    const maxTokensInput = screen.getByDisplayValue('1000');
    await user.clear(maxTokensInput);
    await user.type(maxTokensInput, '2000');

    // Verify changes are reflected in the form
    expect(temperatureSlider).toHaveValue('0.9');
    expect(screen.getByDisplayValue('2000')).toBeInTheDocument();
  });

  it('manages security settings correctly', async () => {
    const user = userEvent.setup();
    render(<ConfigurePage />);

    await waitFor(() => {
      expect(screen.getByText('Security')).toBeInTheDocument();
    });

    // Switch to Security tab
    const securityTab = screen.getByText('Security');
    await user.click(securityTab);

    // Check for security options
    expect(screen.getByText('Rate Limiting')).toBeInTheDocument();
    expect(screen.getByText('Profanity Filter')).toBeInTheDocument();
    expect(screen.getByText('Allowed Domains')).toBeInTheDocument();

    // Toggle rate limiting
    const rateLimitToggle = screen.getByRole('switch', { name: /enable rate limiting/i });
    expect(rateLimitToggle).toBeChecked();

    await user.click(rateLimitToggle);
    expect(rateLimitToggle).not.toBeChecked();
  });

  it('shows auto-save status indicator', async () => {
    const user = userEvent.setup();
    render(<ConfigurePage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Chatbot')).toBeInTheDocument();
    });

    // Make a change to trigger auto-save
    const nameInput = screen.getByDisplayValue('Test Chatbot');
    await user.type(nameInput, ' Updated');

    // Should show auto-saving indicator
    await waitFor(() => {
      expect(screen.getByText('Auto-saving...')).toBeInTheDocument();
    });
  });

  it('handles configuration export functionality', async () => {
    const user = userEvent.setup();

    // Mock URL.createObjectURL
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = jest.fn();

    // Mock link click
    const mockLink = {
      click: jest.fn(),
      setAttribute: jest.fn(),
    };
    jest.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
    jest.spyOn(document.body, 'appendChild').mockImplementation();
    jest.spyOn(document.body, 'removeChild').mockImplementation();

    render(<ConfigurePage />);

    await waitFor(() => {
      expect(screen.getByText('Advanced')).toBeInTheDocument();
    });

    // Switch to Advanced tab
    const advancedTab = screen.getByText('Advanced');
    await user.click(advancedTab);

    // Click export button
    const exportButton = screen.getByText('Export Configuration');
    await user.click(exportButton);

    // Verify download was triggered
    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(mockLink.click).toHaveBeenCalled();
  });

  it('handles API errors during save', async () => {
    const user = userEvent.setup();
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse,
      })
      .mockRejectedValueOnce(new Error('Save failed'));

    render(<ConfigurePage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Chatbot')).toBeInTheDocument();
    });

    // Make a change
    const nameInput = screen.getByDisplayValue('Test Chatbot');
    await user.type(nameInput, ' Modified');

    // Try to save
    const saveButton = screen.getByText('Save Changes');
    await user.click(saveButton);

    // Should show error message
    await waitFor(() => {
      expect(screen.getByText('Failed to save configuration')).toBeInTheDocument();
    });
  });

  it('shows loading state during initial data fetch', () => {
    // Make fetch never resolve to show loading state
    (fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));

    render(<ConfigurePage />);

    // Should show loading indicator
    expect(screen.getByText('Loading configuration...')).toBeInTheDocument();
  });
});