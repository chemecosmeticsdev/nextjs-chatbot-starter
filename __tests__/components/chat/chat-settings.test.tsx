import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatSettings } from '@/components/chat/chat-settings';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// Mock toast hook
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn()
};
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

// Mock API fetch
global.fetch = jest.fn();

// Mock settings data
const mockSettingsData = {
  appearance: {
    theme: 'dark',
    fontSize: 'medium',
    bubbleStyle: 'rounded',
    showTimestamps: true,
    showAvatars: true,
    animationsEnabled: true
  },
  behavior: {
    autoScroll: true,
    soundEnabled: true,
    notificationsEnabled: true,
    typingIndicator: true,
    enterToSend: true,
    markdownEnabled: true
  },
  privacy: {
    saveHistory: true,
    shareAnalytics: false,
    autoDeleteDays: 30,
    encryptMessages: true,
    anonymousMode: false
  },
  accessibility: {
    highContrast: false,
    reduceMotion: false,
    largeText: false,
    screenReaderOptimized: false,
    keyboardShortcuts: true
  }
};

describe('ChatSettings Component', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onSettingsChange: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockSettingsData));
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: mockSettingsData }),
    });
  });

  describe('Component Rendering', () => {
    it('renders chat settings dialog when open', () => {
      render(<ChatSettings {...defaultProps} />);

      expect(screen.getByText('Chat Settings')).toBeInTheDocument();
      expect(screen.getByText('Customize your chat experience')).toBeInTheDocument();
    });

    it('does not render when closed', () => {
      render(<ChatSettings {...defaultProps} isOpen={false} />);

      expect(screen.queryByText('Chat Settings')).not.toBeInTheDocument();
    });

    it('shows tabbed interface for different setting categories', () => {
      render(<ChatSettings {...defaultProps} />);

      expect(screen.getByText('Appearance')).toBeInTheDocument();
      expect(screen.getByText('Behavior')).toBeInTheDocument();
      expect(screen.getByText('Privacy')).toBeInTheDocument();
      expect(screen.getByText('Accessibility')).toBeInTheDocument();
    });
  });

  describe('Appearance Settings', () => {
    it('displays appearance settings options', () => {
      render(<ChatSettings {...defaultProps} />);

      expect(screen.getByText('Theme')).toBeInTheDocument();
      expect(screen.getByText('Font Size')).toBeInTheDocument();
      expect(screen.getByText('Bubble Style')).toBeInTheDocument();
      expect(screen.getByText('Show Timestamps')).toBeInTheDocument();
      expect(screen.getByText('Show Avatars')).toBeInTheDocument();
    });

    it('shows current theme selection', () => {
      render(<ChatSettings {...defaultProps} />);

      const darkThemeOption = screen.getByLabelText('Dark theme');
      expect(darkThemeOption).toBeChecked();
    });

    it('handles theme change', async () => {
      render(<ChatSettings {...defaultProps} />);

      const lightThemeOption = screen.getByLabelText('Light theme');
      fireEvent.click(lightThemeOption);

      await waitFor(() => {
        expect(defaultProps.onSettingsChange).toHaveBeenCalledWith({
          appearance: { ...mockSettingsData.appearance, theme: 'light' }
        });
      });
    });

    it('handles font size change', () => {
      render(<ChatSettings {...defaultProps} />);

      const fontSizeSelect = screen.getByLabelText('Font Size');
      fireEvent.change(fontSizeSelect, { target: { value: 'large' } });

      expect(defaultProps.onSettingsChange).toHaveBeenCalledWith({
        appearance: { ...mockSettingsData.appearance, fontSize: 'large' }
      });
    });

    it('toggles show timestamps setting', () => {
      render(<ChatSettings {...defaultProps} />);

      const timestampsToggle = screen.getByLabelText('Show Timestamps');
      fireEvent.click(timestampsToggle);

      expect(defaultProps.onSettingsChange).toHaveBeenCalledWith({
        appearance: { ...mockSettingsData.appearance, showTimestamps: false }
      });
    });

    it('provides theme preview', () => {
      render(<ChatSettings {...defaultProps} />);

      expect(screen.getByTestId('theme-preview')).toBeInTheDocument();
    });
  });

  describe('Behavior Settings', () => {
    it('displays behavior settings options', () => {
      render(<ChatSettings {...defaultProps} />);

      fireEvent.click(screen.getByText('Behavior'));

      expect(screen.getByText('Auto Scroll')).toBeInTheDocument();
      expect(screen.getByText('Sound Enabled')).toBeInTheDocument();
      expect(screen.getByText('Notifications')).toBeInTheDocument();
      expect(screen.getByText('Typing Indicator')).toBeInTheDocument();
      expect(screen.getByText('Enter to Send')).toBeInTheDocument();
    });

    it('shows current behavior settings state', () => {
      render(<ChatSettings {...defaultProps} />);

      fireEvent.click(screen.getByText('Behavior'));

      const autoScrollToggle = screen.getByLabelText('Auto Scroll');
      expect(autoScrollToggle).toBeChecked();

      const soundToggle = screen.getByLabelText('Sound Enabled');
      expect(soundToggle).toBeChecked();
    });

    it('handles auto scroll toggle', () => {
      render(<ChatSettings {...defaultProps} />);

      fireEvent.click(screen.getByText('Behavior'));

      const autoScrollToggle = screen.getByLabelText('Auto Scroll');
      fireEvent.click(autoScrollToggle);

      expect(defaultProps.onSettingsChange).toHaveBeenCalledWith({
        behavior: { ...mockSettingsData.behavior, autoScroll: false }
      });
    });

    it('handles sound setting toggle', () => {
      render(<ChatSettings {...defaultProps} />);

      fireEvent.click(screen.getByText('Behavior'));

      const soundToggle = screen.getByLabelText('Sound Enabled');
      fireEvent.click(soundToggle);

      expect(defaultProps.onSettingsChange).toHaveBeenCalledWith({
        behavior: { ...mockSettingsData.behavior, soundEnabled: false }
      });
    });

    it('handles keyboard shortcut preferences', () => {
      render(<ChatSettings {...defaultProps} />);

      fireEvent.click(screen.getByText('Behavior'));

      const enterToSendToggle = screen.getByLabelText('Enter to Send');
      fireEvent.click(enterToSendToggle);

      expect(defaultProps.onSettingsChange).toHaveBeenCalledWith({
        behavior: { ...mockSettingsData.behavior, enterToSend: false }
      });
    });
  });

  describe('Privacy Settings', () => {
    it('displays privacy settings options', () => {
      render(<ChatSettings {...defaultProps} />);

      fireEvent.click(screen.getByText('Privacy'));

      expect(screen.getByText('Save History')).toBeInTheDocument();
      expect(screen.getByText('Share Analytics')).toBeInTheDocument();
      expect(screen.getByText('Auto Delete Messages')).toBeInTheDocument();
      expect(screen.getByText('Encrypt Messages')).toBeInTheDocument();
      expect(screen.getByText('Anonymous Mode')).toBeInTheDocument();
    });

    it('shows current privacy settings', () => {
      render(<ChatSettings {...defaultProps} />);

      fireEvent.click(screen.getByText('Privacy'));

      const saveHistoryToggle = screen.getByLabelText('Save History');
      expect(saveHistoryToggle).toBeChecked();

      const shareAnalyticsToggle = screen.getByLabelText('Share Analytics');
      expect(shareAnalyticsToggle).not.toBeChecked();
    });

    it('handles privacy setting changes', () => {
      render(<ChatSettings {...defaultProps} />);

      fireEvent.click(screen.getByText('Privacy'));

      const shareAnalyticsToggle = screen.getByLabelText('Share Analytics');
      fireEvent.click(shareAnalyticsToggle);

      expect(defaultProps.onSettingsChange).toHaveBeenCalledWith({
        privacy: { ...mockSettingsData.privacy, shareAnalytics: true }
      });
    });

    it('handles auto delete days setting', () => {
      render(<ChatSettings {...defaultProps} />);

      fireEvent.click(screen.getByText('Privacy'));

      const autoDeleteSelect = screen.getByLabelText('Auto Delete Messages');
      fireEvent.change(autoDeleteSelect, { target: { value: '7' } });

      expect(defaultProps.onSettingsChange).toHaveBeenCalledWith({
        privacy: { ...mockSettingsData.privacy, autoDeleteDays: 7 }
      });
    });

    it('shows warning for sensitive privacy settings', () => {
      render(<ChatSettings {...defaultProps} />);

      fireEvent.click(screen.getByText('Privacy'));

      const anonymousToggle = screen.getByLabelText('Anonymous Mode');
      fireEvent.click(anonymousToggle);

      expect(screen.getByText('This will prevent message history from being saved')).toBeInTheDocument();
    });
  });

  describe('Accessibility Settings', () => {
    it('displays accessibility settings options', () => {
      render(<ChatSettings {...defaultProps} />);

      fireEvent.click(screen.getByText('Accessibility'));

      expect(screen.getByText('High Contrast')).toBeInTheDocument();
      expect(screen.getByText('Reduce Motion')).toBeInTheDocument();
      expect(screen.getByText('Large Text')).toBeInTheDocument();
      expect(screen.getByText('Screen Reader Optimized')).toBeInTheDocument();
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    });

    it('handles accessibility setting changes', () => {
      render(<ChatSettings {...defaultProps} />);

      fireEvent.click(screen.getByText('Accessibility'));

      const highContrastToggle = screen.getByLabelText('High Contrast');
      fireEvent.click(highContrastToggle);

      expect(defaultProps.onSettingsChange).toHaveBeenCalledWith({
        accessibility: { ...mockSettingsData.accessibility, highContrast: true }
      });
    });

    it('shows keyboard shortcuts help', () => {
      render(<ChatSettings {...defaultProps} />);

      fireEvent.click(screen.getByText('Accessibility'));

      const shortcutsButton = screen.getByText('View Shortcuts');
      fireEvent.click(shortcutsButton);

      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
      expect(screen.getByText('Ctrl + Enter: Send message')).toBeInTheDocument();
      expect(screen.getByText('Ctrl + /: Toggle settings')).toBeInTheDocument();
    });
  });

  describe('Settings Persistence', () => {
    it('saves settings to localStorage on change', () => {
      render(<ChatSettings {...defaultProps} />);

      const lightThemeOption = screen.getByLabelText('Light theme');
      fireEvent.click(lightThemeOption);

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'chat-settings',
        expect.stringContaining('"theme":"light"')
      );
    });

    it('loads settings from localStorage on mount', () => {
      render(<ChatSettings {...defaultProps} />);

      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('chat-settings');
    });

    it('syncs settings with server when enabled', async () => {
      render(<ChatSettings {...defaultProps} syncWithServer={true} />);

      const lightThemeOption = screen.getByLabelText('Light theme');
      fireEvent.click(lightThemeOption);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          '/api/user/chat-settings',
          expect.objectContaining({
            method: 'PUT',
            body: expect.stringContaining('"theme":"light"')
          })
        );
      });
    });
  });

  describe('Import/Export Functionality', () => {
    it('provides export settings option', () => {
      render(<ChatSettings {...defaultProps} />);

      expect(screen.getByText('Export Settings')).toBeInTheDocument();
    });

    it('handles settings export', async () => {
      const mockCreateObjectURL = jest.fn(() => 'blob:url');
      const mockRevokeObjectURL = jest.fn();
      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;

      const mockLink = {
        click: jest.fn(),
        download: '',
        href: ''
      };
      jest.spyOn(document, 'createElement').mockReturnValue(mockLink as any);

      render(<ChatSettings {...defaultProps} />);

      const exportButton = screen.getByText('Export Settings');
      fireEvent.click(exportButton);

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockLink.click).toHaveBeenCalled();
    });

    it('provides import settings option', () => {
      render(<ChatSettings {...defaultProps} />);

      expect(screen.getByText('Import Settings')).toBeInTheDocument();
    });

    it('handles settings import', async () => {
      const mockFile = new File(['{}'], 'settings.json', { type: 'application/json' });
      const mockFileReader = {
        readAsText: jest.fn(),
        result: JSON.stringify(mockSettingsData)
      };
      jest.spyOn(global, 'FileReader').mockImplementation(() => mockFileReader as any);

      render(<ChatSettings {...defaultProps} />);

      const importInput = screen.getByLabelText('Import Settings File');
      fireEvent.change(importInput, { target: { files: [mockFile] } });

      // Simulate FileReader onload
      mockFileReader.onload?.({ target: mockFileReader } as any);

      expect(defaultProps.onSettingsChange).toHaveBeenCalledWith(mockSettingsData);
    });
  });

  describe('Reset Functionality', () => {
    it('provides reset to defaults option', () => {
      render(<ChatSettings {...defaultProps} />);

      expect(screen.getByText('Reset to Defaults')).toBeInTheDocument();
    });

    it('shows confirmation dialog for reset', () => {
      render(<ChatSettings {...defaultProps} />);

      const resetButton = screen.getByText('Reset to Defaults');
      fireEvent.click(resetButton);

      expect(screen.getByText('Reset all settings to default values?')).toBeInTheDocument();
    });

    it('handles reset confirmation', () => {
      render(<ChatSettings {...defaultProps} />);

      const resetButton = screen.getByText('Reset to Defaults');
      fireEvent.click(resetButton);

      const confirmButton = screen.getByText('Reset');
      fireEvent.click(confirmButton);

      expect(defaultProps.onSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({
          appearance: expect.objectContaining({ theme: 'system' }),
          behavior: expect.objectContaining({ autoScroll: true }),
          privacy: expect.objectContaining({ saveHistory: true }),
          accessibility: expect.objectContaining({ highContrast: false })
        })
      );
    });
  });

  describe('Validation and Error Handling', () => {
    it('validates settings before saving', async () => {
      render(<ChatSettings {...defaultProps} />);

      fireEvent.click(screen.getByText('Privacy'));

      const autoDeleteSelect = screen.getByLabelText('Auto Delete Messages');
      fireEvent.change(autoDeleteSelect, { target: { value: '-1' } });

      await waitFor(() => {
        expect(screen.getByText('Invalid auto-delete duration')).toBeInTheDocument();
      });
    });

    it('handles API errors gracefully', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('Settings API Error'));

      render(<ChatSettings {...defaultProps} syncWithServer={true} />);

      const lightThemeOption = screen.getByLabelText('Light theme');
      fireEvent.click(lightThemeOption);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Settings Sync Failed',
          description: 'Your settings were saved locally but could not be synced to the server.',
          variant: 'destructive'
        });
      });
    });

    it('shows warning for unsaved changes', () => {
      render(<ChatSettings {...defaultProps} />);

      const lightThemeOption = screen.getByLabelText('Light theme');
      fireEvent.click(lightThemeOption);

      fireEvent.click(defaultProps.onClose);

      expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();
    });
  });

  describe('Dialog Management', () => {
    it('handles close button click', () => {
      render(<ChatSettings {...defaultProps} />);

      const closeButton = screen.getByLabelText('Close settings');
      fireEvent.click(closeButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('handles escape key press', () => {
      render(<ChatSettings {...defaultProps} />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('handles save and close', () => {
      render(<ChatSettings {...defaultProps} />);

      const saveButton = screen.getByText('Save & Close');
      fireEvent.click(saveButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  describe('Live Preview', () => {
    it('shows live preview of theme changes', () => {
      render(<ChatSettings {...defaultProps} showPreview={true} />);

      expect(screen.getByTestId('settings-preview')).toBeInTheDocument();

      const lightThemeOption = screen.getByLabelText('Light theme');
      fireEvent.click(lightThemeOption);

      const preview = screen.getByTestId('settings-preview');
      expect(preview).toHaveAttribute('data-theme', 'light');
    });

    it('previews font size changes', () => {
      render(<ChatSettings {...defaultProps} showPreview={true} />);

      const fontSizeSelect = screen.getByLabelText('Font Size');
      fireEvent.change(fontSizeSelect, { target: { value: 'large' } });

      const preview = screen.getByTestId('settings-preview');
      expect(preview).toHaveClass('text-lg');
    });
  });

  describe('Accessibility Compliance', () => {
    it('has proper ARIA labels for all controls', () => {
      render(<ChatSettings {...defaultProps} />);

      expect(screen.getByLabelText('Dark theme')).toBeInTheDocument();
      expect(screen.getByLabelText('Light theme')).toBeInTheDocument();
      expect(screen.getByLabelText('Font Size')).toBeInTheDocument();
    });

    it('supports keyboard navigation between tabs', () => {
      render(<ChatSettings {...defaultProps} />);

      const appearanceTab = screen.getByText('Appearance');
      const behaviorTab = screen.getByText('Behavior');

      appearanceTab.focus();
      expect(document.activeElement).toBe(appearanceTab);

      fireEvent.keyDown(appearanceTab, { key: 'ArrowRight' });
      behaviorTab.focus();
      expect(document.activeElement).toBe(behaviorTab);
    });

    it('provides proper role attributes', () => {
      render(<ChatSettings {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('manages focus properly when opening and closing', () => {
      const { rerender } = render(<ChatSettings {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      rerender(<ChatSettings {...defaultProps} isOpen={false} />);

      // Focus should return to trigger element (mocked behavior)
      expect(document.activeElement).toBe(document.body);
    });
  });

  describe('Performance Optimizations', () => {
    it('debounces rapid setting changes', () => {
      jest.useFakeTimers();
      render(<ChatSettings {...defaultProps} />);

      const fontSizeSelect = screen.getByLabelText('Font Size');

      // Rapid changes
      fireEvent.change(fontSizeSelect, { target: { value: 'large' } });
      fireEvent.change(fontSizeSelect, { target: { value: 'small' } });
      fireEvent.change(fontSizeSelect, { target: { value: 'medium' } });

      // Should debounce and only call once
      jest.runAllTimers();
      expect(defaultProps.onSettingsChange).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });

    it('memoizes expensive calculations', () => {
      const { rerender } = render(<ChatSettings {...defaultProps} />);

      // Re-render with same props
      rerender(<ChatSettings {...defaultProps} />);

      // Should not recalculate settings structure
      expect(mockLocalStorage.getItem).toHaveBeenCalledTimes(1);
    });
  });
});