import { render, screen, fireEvent } from '@testing-library/react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

describe('Tabs Components', () => {
  const TabsExample = ({ defaultValue = "tab1", onValueChange }: { defaultValue?: string, onValueChange?: (value: string) => void }) => (
    <Tabs defaultValue={defaultValue} onValueChange={onValueChange}>
      <TabsList>
        <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        <TabsTrigger value="tab3" disabled>Tab 3 (Disabled)</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">Content for Tab 1</TabsContent>
      <TabsContent value="tab2">Content for Tab 2</TabsContent>
      <TabsContent value="tab3">Content for Tab 3</TabsContent>
    </Tabs>
  )

  describe('Tabs Root', () => {
    it('renders correctly with default value', () => {
      render(<TabsExample />)

      // Check that tab triggers are rendered
      expect(screen.getByRole('tab', { name: 'Tab 1' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Tab 2' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Tab 3 (Disabled)' })).toBeInTheDocument()

      // Check that default content is visible
      expect(screen.getByText('Content for Tab 1')).toBeInTheDocument()
      expect(screen.queryByText('Content for Tab 2')).not.toBeInTheDocument()
    })

    it('switches between tabs correctly', () => {
      render(<TabsExample />)

      // Initially tab1 content should be visible
      expect(screen.getByText('Content for Tab 1')).toBeInTheDocument()

      // Click on tab2
      fireEvent.click(screen.getByRole('tab', { name: 'Tab 2' }))

      // Now tab2 content should be visible (tab1 content may be hidden, not removed)
      expect(screen.getByText('Content for Tab 2')).toBeInTheDocument()

      // Check that tab2 is now active
      expect(screen.getByRole('tab', { name: 'Tab 2' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveAttribute('aria-selected', 'false')
    })

    it('calls onValueChange when tab is changed', () => {
      const handleValueChange = jest.fn()
      render(<TabsExample onValueChange={handleValueChange} />)

      fireEvent.click(screen.getByRole('tab', { name: 'Tab 2' }))

      expect(handleValueChange).toHaveBeenCalledWith('tab2')
    })

    it('handles controlled mode with value prop', () => {
      const { rerender } = render(
        <Tabs value="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      )

      expect(screen.getByText('Content 1')).toBeInTheDocument()
      expect(screen.queryByText('Content 2')).not.toBeInTheDocument()

      // Update value prop
      rerender(
        <Tabs value="tab2">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      )

      expect(screen.queryByText('Content 1')).not.toBeInTheDocument()
      expect(screen.getByText('Content 2')).toBeInTheDocument()
    })
  })

  describe('TabsList', () => {
    it('renders with correct default classes', () => {
      const { container } = render(
        <TabsList>
          <TabsTrigger value="test">Test</TabsTrigger>
        </TabsList>
      )

      const tabsList = container.firstChild
      expect(tabsList).toHaveClass(
        'inline-flex',
        'h-10',
        'items-center',
        'justify-center',
        'rounded-md',
        'bg-muted',
        'p-1',
        'text-muted-foreground'
      )
    })

    it('applies custom className', () => {
      const { container } = render(
        <TabsList className="custom-tabs-list">
          <TabsTrigger value="test">Test</TabsTrigger>
        </TabsList>
      )

      const tabsList = container.firstChild
      expect(tabsList).toHaveClass('custom-tabs-list')
      expect(tabsList).toHaveClass('inline-flex', 'h-10') // Should still have default classes
    })

    it('spreads additional props', () => {
      const { container } = render(
        <TabsList data-testid="custom-tabs-list" aria-label="Tab navigation">
          <TabsTrigger value="test">Test</TabsTrigger>
        </TabsList>
      )

      const tabsList = container.firstChild
      expect(tabsList).toHaveAttribute('data-testid', 'custom-tabs-list')
      expect(tabsList).toHaveAttribute('aria-label', 'Tab navigation')
    })

    it('has proper role attributes', () => {
      render(
        <TabsList>
          <TabsTrigger value="test">Test</TabsTrigger>
        </TabsList>
      )

      const tabsList = screen.getByRole('tablist')
      expect(tabsList).toBeInTheDocument()
    })
  })

  describe('TabsTrigger', () => {
    it('renders with correct default classes', () => {
      render(
        <Tabs defaultValue="test">
          <TabsList>
            <TabsTrigger value="test">Test Tab</TabsTrigger>
          </TabsList>
        </Tabs>
      )

      const trigger = screen.getByRole('tab', { name: 'Test Tab' })
      expect(trigger).toHaveClass(
        'inline-flex',
        'items-center',
        'justify-center',
        'whitespace-nowrap',
        'rounded-sm',
        'px-3',
        'py-1.5',
        'text-sm',
        'font-medium'
      )
    })

    it('shows active state correctly', () => {
      render(
        <Tabs defaultValue="active-tab">
          <TabsList>
            <TabsTrigger value="active-tab">Active Tab</TabsTrigger>
            <TabsTrigger value="inactive-tab">Inactive Tab</TabsTrigger>
          </TabsList>
        </Tabs>
      )

      const activeTab = screen.getByRole('tab', { name: 'Active Tab' })
      const inactiveTab = screen.getByRole('tab', { name: 'Inactive Tab' })

      expect(activeTab).toHaveAttribute('aria-selected', 'true')
      expect(inactiveTab).toHaveAttribute('aria-selected', 'false')
    })

    it('handles disabled state', () => {
      render(
        <Tabs defaultValue="test">
          <TabsList>
            <TabsTrigger value="enabled">Enabled</TabsTrigger>
            <TabsTrigger value="disabled" disabled>Disabled</TabsTrigger>
          </TabsList>
          <TabsContent value="enabled">Enabled content</TabsContent>
          <TabsContent value="disabled">Disabled content</TabsContent>
        </Tabs>
      )

      const disabledTab = screen.getByRole('tab', { name: 'Disabled' })
      expect(disabledTab).toBeDisabled()
      expect(disabledTab).toHaveClass('disabled:pointer-events-none', 'disabled:opacity-50')

      // Clicking disabled tab should not change content
      fireEvent.click(disabledTab)
      expect(screen.getByText('Enabled content')).toBeInTheDocument()
      expect(screen.queryByText('Disabled content')).not.toBeInTheDocument()
    })

    it('applies custom className', () => {
      render(
        <Tabs defaultValue="test">
          <TabsList>
            <TabsTrigger value="test" className="custom-trigger">Test</TabsTrigger>
          </TabsList>
        </Tabs>
      )

      const trigger = screen.getByRole('tab', { name: 'Test' })
      expect(trigger).toHaveClass('custom-trigger')
      expect(trigger).toHaveClass('inline-flex', 'items-center') // Should still have default classes
    })

    it('supports keyboard navigation', () => {
      render(<TabsExample />)

      const tab1 = screen.getByRole('tab', { name: 'Tab 1' })
      const tab2 = screen.getByRole('tab', { name: 'Tab 2' })

      // Focus first tab
      tab1.focus()
      expect(tab1).toHaveFocus()

      // Arrow right should move to next tab
      fireEvent.keyDown(tab1, { key: 'ArrowRight' })
      expect(tab2).toHaveFocus()

      // Enter should activate the focused tab
      fireEvent.keyDown(tab2, { key: 'Enter' })
      expect(screen.getByText('Content for Tab 2')).toBeInTheDocument()
    })

    it('spreads additional props', () => {
      render(
        <Tabs defaultValue="test">
          <TabsList>
            <TabsTrigger value="test" data-testid="custom-trigger" aria-describedby="test-desc">
              Test
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )

      const trigger = screen.getByTestId('custom-trigger')
      expect(trigger).toHaveAttribute('aria-describedby', 'test-desc')
    })
  })

  describe('TabsContent', () => {
    it('renders with correct default classes', () => {
      const { container } = render(
        <Tabs defaultValue="test">
          <TabsContent value="test">Test content</TabsContent>
        </Tabs>
      )

      const content = container.querySelector('[role="tabpanel"]')
      expect(content).toHaveClass(
        'mt-2',
        'ring-offset-background',
        'focus-visible:outline-none',
        'focus-visible:ring-2',
        'focus-visible:ring-ring',
        'focus-visible:ring-offset-2'
      )
    })

    it('applies custom className', () => {
      const { container } = render(
        <Tabs defaultValue="test">
          <TabsContent value="test" className="custom-content">
            Test content
          </TabsContent>
        </Tabs>
      )

      const content = container.querySelector('[role="tabpanel"]')
      expect(content).toHaveClass('custom-content')
      expect(content).toHaveClass('mt-2') // Should still have default classes
    })

    it('has proper ARIA attributes', () => {
      render(
        <Tabs defaultValue="test">
          <TabsList>
            <TabsTrigger value="test">Test Tab</TabsTrigger>
          </TabsList>
          <TabsContent value="test">Test content</TabsContent>
        </Tabs>
      )

      const content = screen.getByRole('tabpanel')
      const trigger = screen.getByRole('tab', { name: 'Test Tab' })

      expect(content).toHaveAttribute('aria-labelledby', trigger.id)
      expect(trigger).toHaveAttribute('aria-controls', content.id)
    })

    it('is only visible when corresponding tab is active', () => {
      render(<TabsExample />)

      // Initially only tab1 content is visible
      expect(screen.getByText('Content for Tab 1')).toBeInTheDocument()
      expect(screen.queryByText('Content for Tab 2')).not.toBeInTheDocument()

      // After clicking tab2, only tab2 content is visible
      fireEvent.click(screen.getByRole('tab', { name: 'Tab 2' }))
      expect(screen.queryByText('Content for Tab 1')).not.toBeInTheDocument()
      expect(screen.getByText('Content for Tab 2')).toBeInTheDocument()
    })

    it('supports complex content', () => {
      render(
        <Tabs defaultValue="complex">
          <TabsList>
            <TabsTrigger value="complex">Complex Tab</TabsTrigger>
          </TabsList>
          <TabsContent value="complex">
            <div>
              <h2>Complex Content</h2>
              <p>This is a paragraph</p>
              <button>A button</button>
              <ul>
                <li>List item 1</li>
                <li>List item 2</li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      )

      expect(screen.getByText('Complex Content')).toBeInTheDocument()
      expect(screen.getByText('This is a paragraph')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'A button' })).toBeInTheDocument()
      expect(screen.getByText('List item 1')).toBeInTheDocument()
      expect(screen.getByText('List item 2')).toBeInTheDocument()
    })

    it('spreads additional props', () => {
      render(
        <Tabs defaultValue="test">
          <TabsContent value="test" data-testid="custom-content" aria-describedby="content-desc">
            Test content
          </TabsContent>
        </Tabs>
      )

      const content = screen.getByTestId('custom-content')
      expect(content).toHaveAttribute('aria-describedby', 'content-desc')
    })
  })

  describe('Integration Tests', () => {
    it('handles multiple tab switches correctly', () => {
      render(<TabsExample />)

      // Start with tab1
      expect(screen.getByText('Content for Tab 1')).toBeInTheDocument()

      // Switch to tab2
      fireEvent.click(screen.getByRole('tab', { name: 'Tab 2' }))
      expect(screen.getByText('Content for Tab 2')).toBeInTheDocument()
      expect(screen.queryByText('Content for Tab 1')).not.toBeInTheDocument()

      // Switch back to tab1
      fireEvent.click(screen.getByRole('tab', { name: 'Tab 1' }))
      expect(screen.getByText('Content for Tab 1')).toBeInTheDocument()
      expect(screen.queryByText('Content for Tab 2')).not.toBeInTheDocument()
    })

    it('maintains proper focus management', () => {
      render(<TabsExample />)

      const tab1 = screen.getByRole('tab', { name: 'Tab 1' })
      const tab2 = screen.getByRole('tab', { name: 'Tab 2' })

      // Click should focus the tab
      fireEvent.click(tab2)
      expect(tab2).toHaveFocus()

      // Tab navigation should work
      fireEvent.keyDown(tab2, { key: 'ArrowLeft' })
      expect(tab1).toHaveFocus()
    })

    it('works with different orientations', () => {
      render(
        <Tabs defaultValue="test" orientation="vertical">
          <TabsList>
            <TabsTrigger value="test">Test</TabsTrigger>
          </TabsList>
          <TabsContent value="test">Content</TabsContent>
        </Tabs>
      )

      expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical')
    })
  })
})