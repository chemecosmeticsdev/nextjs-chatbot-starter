import { render, screen, fireEvent } from '@testing-library/react'
import { AppSidebar } from '@/components/app-sidebar'

// Mock Next.js navigation hooks
const mockPush = jest.fn()
const mockUseRouter = jest.fn(() => ({ push: mockPush }))
const mockUsePathname = jest.fn(() => '/dashboard')

jest.mock('next/navigation', () => ({
  useRouter: mockUseRouter,
  usePathname: mockUsePathname,
}))

// Mock sidebar context
const mockUseSidebar = jest.fn(() => ({ state: 'expanded' }))

jest.mock('@/components/ui/sidebar', () => ({
  Sidebar: ({ children, ...props }: any) => <div data-testid="sidebar" {...props}>{children}</div>,
  SidebarContent: ({ children }: any) => <div data-testid="sidebar-content">{children}</div>,
  SidebarHeader: ({ children }: any) => <div data-testid="sidebar-header">{children}</div>,
  SidebarFooter: ({ children }: any) => <div data-testid="sidebar-footer">{children}</div>,
  SidebarGroup: ({ children }: any) => <div data-testid="sidebar-group">{children}</div>,
  SidebarMenu: ({ children }: any) => <ul data-testid="sidebar-menu">{children}</ul>,
  SidebarMenuItem: ({ children }: any) => <li data-testid="sidebar-menu-item">{children}</li>,
  SidebarMenuButton: ({ children, asChild, ...props }: any) =>
    asChild ? children : <button data-testid="sidebar-menu-button" {...props}>{children}</button>,
  SidebarMenuSub: ({ children }: any) => <ul data-testid="sidebar-menu-sub">{children}</ul>,
  SidebarMenuSubItem: ({ children }: any) => <li data-testid="sidebar-menu-sub-item">{children}</li>,
  SidebarMenuSubButton: ({ children, asChild, isActive, ...props }: any) =>
    asChild ? children : <button data-testid="sidebar-menu-sub-button" data-active={isActive} {...props}>{children}</button>,
  useSidebar: mockUseSidebar,
}))

describe('AppSidebar Component', () => {
  const mockUser = {
    id: '1',
    email: 'test@example.com',
    full_name: 'Test User',
    role: 'user',
  }

  const mockAdminUser = {
    id: '2',
    email: 'admin@example.com',
    full_name: 'Admin User',
    role: 'admin',
  }

  const mockSuperAdminUser = {
    id: '3',
    email: 'superadmin@example.com',
    full_name: 'Super Admin User',
    role: 'super_admin',
  }

  describe('Basic Rendering', () => {
    it('renders sidebar for regular user', () => {
      render(<AppSidebar user={mockUser} />)

      expect(screen.getByTestId('sidebar')).toBeInTheDocument()
      expect(screen.getByTestId('sidebar-header')).toBeInTheDocument()
      expect(screen.getByTestId('sidebar-content')).toBeInTheDocument()
      expect(screen.getByTestId('sidebar-footer')).toBeInTheDocument()
    })

    it('displays correct header content', () => {
      render(<AppSidebar user={mockUser} />)

      expect(screen.getByText('Chatbot Dashboard')).toBeInTheDocument()
      expect(screen.getByText('Management System')).toBeInTheDocument()
    })

    it('displays user email in footer when expanded', () => {
      render(<AppSidebar user={mockUser} />)

      expect(screen.getByText('test@example.com')).toBeInTheDocument()
      expect(screen.getByText('User')).toBeInTheDocument()
    })

    it('displays user initials in footer when collapsed', () => {
      // Mock collapsed state
      mockUseSidebar.mockReturnValue({ state: 'collapsed' })

      render(<AppSidebar user={mockUser} />)

      expect(screen.getByText('TE')).toBeInTheDocument()
    })
  })

  describe('Navigation Items - Regular User', () => {
    beforeEach(() => {
      // Reset to expanded state
      mockUseSidebar.mockReturnValue({ state: 'expanded' })
    })

    it('shows basic navigation items for regular user', () => {
      render(<AppSidebar user={mockUser} />)

      expect(screen.getByText('Dashboard')).toBeInTheDocument()
      expect(screen.getByText('Chat')).toBeInTheDocument()
    })

    it('does not show admin-only items for regular user', () => {
      render(<AppSidebar user={mockUser} />)

      expect(screen.queryByText('User Management')).not.toBeInTheDocument()
      expect(screen.queryByText('Knowledge Base')).not.toBeInTheDocument()
      expect(screen.queryByText('Analytics')).not.toBeInTheDocument()
    })

    it('does not show Documents dropdown for regular user', () => {
      render(<AppSidebar user={mockUser} />)

      expect(screen.queryByText('All Documents')).not.toBeInTheDocument()
      expect(screen.queryByText('Upload Document')).not.toBeInTheDocument()
    })
  })

  describe('Navigation Items - Admin User', () => {
    it('shows admin-specific navigation items', () => {
      render(<AppSidebar user={mockAdminUser} />)

      expect(screen.getByText('Dashboard')).toBeInTheDocument()
      expect(screen.getByText('Chat')).toBeInTheDocument()
      expect(screen.getByText('Knowledge Base')).toBeInTheDocument()
      expect(screen.getByText('Analytics')).toBeInTheDocument()
    })

    it('shows Documents dropdown for admin user', () => {
      render(<AppSidebar user={mockAdminUser} />)

      expect(screen.getByText('All Documents')).toBeInTheDocument()
      expect(screen.getByText('Upload Document')).toBeInTheDocument()
    })

    it('does not show super admin only items for admin', () => {
      render(<AppSidebar user={mockAdminUser} />)

      expect(screen.queryByText('User Management')).not.toBeInTheDocument()
      expect(screen.queryByText('All Chatbots')).not.toBeInTheDocument()
      expect(screen.queryByText('Create Chatbot')).not.toBeInTheDocument()
    })

    it('displays correct role text for admin', () => {
      render(<AppSidebar user={mockAdminUser} />)

      expect(screen.getByText('Admin')).toBeInTheDocument()
    })
  })

  describe('Navigation Items - Super Admin User', () => {
    it('shows all navigation items for super admin', () => {
      render(<AppSidebar user={mockSuperAdminUser} />)

      expect(screen.getByText('Dashboard')).toBeInTheDocument()
      expect(screen.getByText('Chat')).toBeInTheDocument()
      expect(screen.getByText('Knowledge Base')).toBeInTheDocument()
      expect(screen.getByText('Analytics')).toBeInTheDocument()
      expect(screen.getByText('User Management')).toBeInTheDocument()
    })

    it('shows Chatbots dropdown for super admin', () => {
      render(<AppSidebar user={mockSuperAdminUser} />)

      expect(screen.getByText('All Chatbots')).toBeInTheDocument()
      expect(screen.getByText('Create Chatbot')).toBeInTheDocument()
    })

    it('shows System dropdown for super admin', () => {
      render(<AppSidebar user={mockSuperAdminUser} />)

      expect(screen.getByText('Settings')).toBeInTheDocument()
      expect(screen.getByText('Activity Logs')).toBeInTheDocument()
    })

    it('displays correct role text for super admin', () => {
      render(<AppSidebar user={mockSuperAdminUser} />)

      expect(screen.getByText('Super Admin')).toBeInTheDocument()
    })
  })

  describe('Navigation Functionality', () => {
    it('calls router.push when clicking on navigation links', () => {
      mockPush.mockClear()
      mockUseRouter.mockReturnValue({ push: mockPush })

      render(<AppSidebar user={mockUser} />)

      const dashboardLink = screen.getByText('Dashboard').closest('a')
      fireEvent.click(dashboardLink!)

      expect(mockPush).toHaveBeenCalledWith('/dashboard')
    })

    it('handles sub-menu navigation', () => {
      const mockPush = jest.fn()
      jest.mocked(require('next/navigation').useRouter).mockReturnValue({ push: mockPush })

      render(<AppSidebar user={mockAdminUser} />)

      const allDocumentsLink = screen.getByText('All Documents').closest('a')
      fireEvent.click(allDocumentsLink!)

      expect(mockPush).toHaveBeenCalledWith('/dashboard/documents')
    })

    it('does not navigate for placeholder links', () => {
      const mockPush = jest.fn()
      jest.mocked(require('next/navigation').useRouter).mockReturnValue({ push: mockPush })

      render(<AppSidebar user={mockAdminUser} />)

      // Documents main item is a placeholder (#)
      const documentsMainLink = screen.getByText('Documents').closest('a')
      fireEvent.click(documentsMainLink!)

      expect(mockPush).not.toHaveBeenCalled()
    })
  })

  describe('Active State Management', () => {
    it('shows active state for current path', () => {
      // Mock current pathname as documents
      jest.mocked(require('next/navigation').usePathname).mockReturnValue('/dashboard/documents')

      render(<AppSidebar user={mockAdminUser} />)

      // The All Documents item should be marked as active
      const allDocumentsButton = screen.getByText('All Documents').closest('[data-testid="sidebar-menu-sub-button"]')
      expect(allDocumentsButton).toHaveAttribute('data-active', 'true')
    })

    it('does not show active state for non-current paths', () => {
      jest.mocked(require('next/navigation').usePathname).mockReturnValue('/dashboard')

      render(<AppSidebar user={mockAdminUser} />)

      const allDocumentsButton = screen.getByText('All Documents').closest('[data-testid="sidebar-menu-sub-button"]')
      expect(allDocumentsButton).toHaveAttribute('data-active', 'false')
    })
  })

  describe('Role-based Visibility', () => {
    it('filters out invisible items correctly', () => {
      render(<AppSidebar user={mockUser} />)

      // These should not be visible for regular users
      expect(screen.queryByText('Knowledge Base')).not.toBeInTheDocument()
      expect(screen.queryByText('Analytics')).not.toBeInTheDocument()
      expect(screen.queryByText('User Management')).not.toBeInTheDocument()
    })

    it('shows all items for super admin', () => {
      render(<AppSidebar user={mockSuperAdminUser} />)

      expect(screen.getByText('Knowledge Base')).toBeInTheDocument()
      expect(screen.getByText('Analytics')).toBeInTheDocument()
      expect(screen.getByText('User Management')).toBeInTheDocument()
    })
  })

  describe('Icons and Styling', () => {
    it('renders sidebar with correct variant and collapsible props', () => {
      render(<AppSidebar user={mockUser} />)

      const sidebar = screen.getByTestId('sidebar')
      expect(sidebar).toHaveAttribute('variant', 'sidebar')
      expect(sidebar).toHaveAttribute('collapsible', 'icon')
    })

    it('includes header link to dashboard', () => {
      render(<AppSidebar user={mockUser} />)

      const headerLink = screen.getByText('Chatbot Dashboard').closest('a')
      expect(headerLink).toHaveAttribute('href', '/dashboard')
    })
  })

  describe('User Information Display', () => {
    it('formats role names correctly', () => {
      render(<AppSidebar user={{ ...mockUser, role: 'content_moderator' }} />)

      expect(screen.getByText('Content Moderator')).toBeInTheDocument()
    })

    it('handles super_admin role formatting', () => {
      render(<AppSidebar user={mockSuperAdminUser} />)

      expect(screen.getByText('Super Admin')).toBeInTheDocument()
    })

    it('generates correct user initials', () => {
      jest.mocked(require('@/components/ui/sidebar').useSidebar).mockReturnValue({ state: 'collapsed' })

      render(<AppSidebar user={{ ...mockUser, email: 'john.doe@example.com' }} />)

      expect(screen.getByText('JO')).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('handles user with minimal information', () => {
      const minimalUser = {
        id: '999',
        email: 'a@b.co',
        full_name: '',
        role: 'user',
      }

      render(<AppSidebar user={minimalUser} />)

      expect(screen.getByText('a@b.co')).toBeInTheDocument()
      expect(screen.getByText('User')).toBeInTheDocument()
    })

    it('handles empty sub-menu arrays', () => {
      const userWithNoSubItems = { ...mockAdminUser, role: 'user' }

      render(<AppSidebar user={userWithNoSubItems} />)

      // Should not crash and should not show sub-menus
      expect(screen.queryByText('All Documents')).not.toBeInTheDocument()
    })
  })
})