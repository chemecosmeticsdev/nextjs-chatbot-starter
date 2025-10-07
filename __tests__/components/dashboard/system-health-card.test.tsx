import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SystemHealthCard } from '@/components/dashboard/system-health-card';

// Mock Next.js router
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock API fetch
global.fetch = jest.fn();

// Mock system health data
const mockHealthData = {
  apiUptime: 99.8,
  databasePerformance: {
    responseTime: 45,
    connectionPool: 85,
    queryPerformance: 'excellent'
  },
  webSocketConnections: {
    active: 342,
    peak: 456,
    dropRate: 0.2
  },
  cacheHitRate: 94.5,
  systemResources: {
    memoryUsage: 68,
    cpuUsage: 42,
    diskUsage: 35
  },
  healthChecks: [
    { service: 'API Gateway', status: 'healthy', responseTime: 23 },
    { service: 'Database', status: 'healthy', responseTime: 45 },
    { service: 'Redis Cache', status: 'healthy', responseTime: 8 },
    { service: 'WebSocket Server', status: 'healthy', responseTime: 12 },
    { service: 'File Storage', status: 'degraded', responseTime: 156 }
  ],
  alerts: [
    { id: 1, severity: 'warning', message: 'High memory usage detected', timestamp: '2025-10-03T10:30:00Z' },
    { id: 2, severity: 'info', message: 'Cache optimization completed', timestamp: '2025-10-03T09:15:00Z' }
  ],
  overallStatus: 'healthy'
};

describe('SystemHealthCard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: mockHealthData }),
    });
  });

  describe('Component Rendering', () => {
    it('renders system health card with title and description', () => {
      render(<SystemHealthCard />);

      expect(screen.getByText('System Health')).toBeInTheDocument();
      expect(screen.getByText('Infrastructure monitoring and status')).toBeInTheDocument();
    });

    it('applies custom className when provided', () => {
      render(<SystemHealthCard className="custom-health-class" />);

      const card = screen.getByText('System Health').closest('.custom-health-class');
      expect(card).toBeInTheDocument();
    });

    it('shows loading skeletons initially', () => {
      render(<SystemHealthCard />);

      const skeletons = screen.getAllByTestId(/skeleton|loading/);
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Health Status Display', () => {
    it('displays overall system status', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        expect(screen.getByText('Healthy')).toBeInTheDocument();
        const statusBadge = screen.getByText('Healthy');
        expect(statusBadge).toHaveClass('bg-green-100');
      });
    });

    it('shows API uptime percentage', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        expect(screen.getByText('99.8%')).toBeInTheDocument();
      });
    });

    it('displays cache hit rate', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        expect(screen.getByText('94.5%')).toBeInTheDocument();
      });
    });
  });

  describe('Database Performance', () => {
    it('shows database response time', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        expect(screen.getByText('45ms')).toBeInTheDocument();
      });
    });

    it('displays connection pool usage', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        expect(screen.getByText('85%')).toBeInTheDocument();
      });
    });

    it('shows query performance rating', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        expect(screen.getByText('Excellent')).toBeInTheDocument();
      });
    });
  });

  describe('WebSocket Metrics', () => {
    it('displays active WebSocket connections', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        expect(screen.getByText('342')).toBeInTheDocument(); // Active connections
        expect(screen.getByText('456')).toBeInTheDocument(); // Peak connections
      });
    });

    it('shows connection drop rate', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        expect(screen.getByText('0.2%')).toBeInTheDocument();
      });
    });
  });

  describe('System Resources', () => {
    it('displays memory usage with progress bar', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        const memoryBar = screen.getByLabelText(/memory usage/i);
        expect(memoryBar).toHaveAttribute('aria-valuenow', '68');
      });
    });

    it('shows CPU usage', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        const cpuBar = screen.getByLabelText(/cpu usage/i);
        expect(cpuBar).toHaveAttribute('aria-valuenow', '42');
      });
    });

    it('displays disk usage', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        const diskBar = screen.getByLabelLabel(/disk usage/i);
        expect(diskBar).toHaveAttribute('aria-valuenow', '35');
      });
    });

    it('uses different colors based on usage levels', async () => {
      const highUsageData = {
        ...mockHealthData,
        systemResources: {
          memoryUsage: 90,
          cpuUsage: 85,
          diskUsage: 92
        }
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: highUsageData }),
      });

      render(<SystemHealthCard />);

      await waitFor(() => {
        const memoryBar = screen.getByLabelText(/memory usage/i);
        expect(memoryBar).toHaveClass('bg-red-500');
      });
    });
  });

  describe('Health Checks', () => {
    it('displays all service health checks', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        expect(screen.getByText('API Gateway')).toBeInTheDocument();
        expect(screen.getByText('Database')).toBeInTheDocument();
        expect(screen.getByText('Redis Cache')).toBeInTheDocument();
        expect(screen.getByText('WebSocket Server')).toBeInTheDocument();
        expect(screen.getByText('File Storage')).toBeInTheDocument();
      });
    });

    it('shows service status indicators', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        const healthyServices = screen.getAllByText('Healthy');
        expect(healthyServices.length).toBe(5); // 4 healthy services + overall status

        const degradedService = screen.getByText('Degraded');
        expect(degradedService).toBeInTheDocument();
      });
    });

    it('displays response times for each service', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        expect(screen.getByText('23ms')).toBeInTheDocument(); // API Gateway
        expect(screen.getByText('8ms')).toBeInTheDocument(); // Redis Cache
        expect(screen.getByText('156ms')).toBeInTheDocument(); // File Storage
      });
    });

    it('uses appropriate colors for service status', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        const healthyIndicators = screen.getAllByTestId('status-healthy');
        expect(healthyIndicators[0]).toHaveClass('text-green-500');

        const degradedIndicator = screen.getByTestId('status-degraded');
        expect(degradedIndicator).toHaveClass('text-yellow-500');
      });
    });
  });

  describe('System Alerts', () => {
    it('displays recent system alerts', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        expect(screen.getByText('High memory usage detected')).toBeInTheDocument();
        expect(screen.getByText('Cache optimization completed')).toBeInTheDocument();
      });
    });

    it('shows alert severity levels', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        const warningAlert = screen.getByTestId('alert-warning');
        expect(warningAlert).toHaveClass('text-yellow-500');

        const infoAlert = screen.getByTestId('alert-info');
        expect(infoAlert).toHaveClass('text-blue-500');
      });
    });

    it('displays alert timestamps', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        expect(screen.getByText(/10:30/)).toBeInTheDocument();
        expect(screen.getByText(/09:15/)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('displays error state when API fails', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('Health API Error'));

      render(<SystemHealthCard />);

      await waitFor(() => {
        expect(screen.getByText(/error loading health data/i)).toBeInTheDocument();
      });
    });

    it('shows retry functionality on error', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('Health API Error'));

      render(<SystemHealthCard />);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Retry'));
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('User Interactions', () => {
    it('handles refresh button click', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        const refreshButton = screen.getByLabelText(/refresh health data/i);
        fireEvent.click(refreshButton);
      });

      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('navigates to monitoring dashboard', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('View Monitoring'));
      });

      expect(mockPush).toHaveBeenCalledWith('/dashboard/monitoring');
    });

    it('expands alert details on click', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        const alertButton = screen.getByTestId('expand-alert-1');
        fireEvent.click(alertButton);
      });

      expect(screen.getByText('Alert Details')).toBeInTheDocument();
    });
  });

  describe('Status Color Coding', () => {
    it('shows critical status with red styling', async () => {
      const criticalData = {
        ...mockHealthData,
        overallStatus: 'critical',
        apiUptime: 85.2
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: criticalData }),
      });

      render(<SystemHealthCard />);

      await waitFor(() => {
        const statusBadge = screen.getByText('Critical');
        expect(statusBadge).toHaveClass('bg-red-100');
      });
    });

    it('shows degraded status with yellow styling', async () => {
      const degradedData = {
        ...mockHealthData,
        overallStatus: 'degraded'
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: degradedData }),
      });

      render(<SystemHealthCard />);

      await waitFor(() => {
        const statusBadge = screen.getByText('Degraded');
        expect(statusBadge).toHaveClass('bg-yellow-100');
      });
    });
  });

  describe('Real-time Updates', () => {
    it('refreshes health data at regular intervals', async () => {
      jest.useFakeTimers();
      render(<SystemHealthCard refreshInterval={15000} />);

      expect(fetch).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(15000);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledTimes(2);
      });

      jest.useRealTimers();
    });

    it('shows live indicator when real-time updates are enabled', () => {
      render(<SystemHealthCard showLiveIndicator={true} />);

      expect(screen.getByText('Live')).toBeInTheDocument();
      expect(screen.getByTestId('pulse-indicator')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels for progress bars', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        expect(screen.getByLabelText(/memory usage: 68%/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/cpu usage: 42%/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/disk usage: 35%/i)).toBeInTheDocument();
      });
    });

    it('provides status announcements for screen readers', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        const statusRegion = screen.getByRole('status');
        expect(statusRegion).toBeInTheDocument();
      });
    });

    it('supports keyboard navigation for interactive elements', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        const refreshButton = screen.getByLabelText(/refresh/i);
        refreshButton.focus();
        expect(document.activeElement).toBe(refreshButton);
      });
    });
  });

  describe('Performance Thresholds', () => {
    it('highlights concerning metrics', async () => {
      const concerningData = {
        ...mockHealthData,
        databasePerformance: {
          responseTime: 250,
          connectionPool: 95,
          queryPerformance: 'poor'
        }
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: concerningData }),
      });

      render(<SystemHealthCard />);

      await waitFor(() => {
        expect(screen.getByText('Poor')).toBeInTheDocument();
        const responseTime = screen.getByText('250ms');
        expect(responseTime).toHaveClass('text-red-500');
      });
    });

    it('shows warning indicators for high resource usage', async () => {
      render(<SystemHealthCard />);

      await waitFor(() => {
        // Memory at 68% should show warning color
        const memoryBar = screen.getByLabelText(/memory usage/i);
        expect(memoryBar).toHaveClass('bg-yellow-500');
      });
    });
  });
});