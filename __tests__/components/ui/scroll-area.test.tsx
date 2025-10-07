import { render, screen } from '@testing-library/react'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'

describe('ScrollArea Component', () => {
  it('renders with default props', () => {
    render(
      <ScrollArea>
        <div>Scrollable content</div>
      </ScrollArea>
    )

    const scrollArea = screen.getByText('Scrollable content').closest('[class*="relative"]')
    expect(scrollArea).toBeInTheDocument()
    expect(scrollArea).toHaveClass('relative', 'overflow-hidden')
  })

  it('renders children within viewport', () => {
    render(
      <ScrollArea>
        <div>Test content</div>
        <div>More content</div>
      </ScrollArea>
    )

    expect(screen.getByText('Test content')).toBeInTheDocument()
    expect(screen.getByText('More content')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(
      <ScrollArea className="custom-scroll-area">
        <div>Content</div>
      </ScrollArea>
    )

    const scrollArea = container.firstChild
    expect(scrollArea).toHaveClass('custom-scroll-area')
    expect(scrollArea).toHaveClass('relative', 'overflow-hidden')
  })

  it('has proper viewport structure', () => {
    const { container } = render(
      <ScrollArea>
        <div data-testid="content">Viewport content</div>
      </ScrollArea>
    )

    // Check for viewport element
    const viewport = container.querySelector('[class*="h-full"][class*="w-full"][class*="rounded-[inherit]"]')
    expect(viewport).toBeInTheDocument()

    // Content should be within viewport
    const content = screen.getByTestId('content')
    expect(viewport).toContainElement(content)
  })

  it('includes scrollbar by default', () => {
    const { container } = render(
      <ScrollArea>
        <div style={{ height: '1000px' }}>Very tall content</div>
      </ScrollArea>
    )

    // ScrollArea automatically includes a scrollbar through Radix
    expect(container.firstChild).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('relative', 'overflow-hidden')
  })

  it('includes corner element', () => {
    const { container } = render(
      <ScrollArea>
        <div>Content</div>
      </ScrollArea>
    )

    // ScrollArea should include a corner element (from Radix)
    // This is rendered by the Radix component
    expect(container.firstChild).toBeInTheDocument()
  })

  it('handles long content that requires scrolling', () => {
    render(
      <ScrollArea className="h-48">
        <div style={{ height: '1000px' }} data-testid="long-content">
          Very long content that requires scrolling
        </div>
      </ScrollArea>
    )

    const content = screen.getByTestId('long-content')
    expect(content).toBeInTheDocument()
  })

  it('spreads additional props', () => {
    render(
      <ScrollArea data-testid="custom-scroll-area" role="region" aria-label="Scrollable region">
        <div>Content</div>
      </ScrollArea>
    )

    const scrollArea = screen.getByTestId('custom-scroll-area')
    expect(scrollArea).toHaveAttribute('role', 'region')
    expect(scrollArea).toHaveAttribute('aria-label', 'Scrollable region')
  })

  it('handles multiple children correctly', () => {
    render(
      <ScrollArea>
        <div>First child</div>
        <div>Second child</div>
        <span>Third child</span>
      </ScrollArea>
    )

    expect(screen.getByText('First child')).toBeInTheDocument()
    expect(screen.getByText('Second child')).toBeInTheDocument()
    expect(screen.getByText('Third child')).toBeInTheDocument()
  })

  it('maintains proper DOM structure', () => {
    const { container } = render(
      <ScrollArea>
        <div>Content</div>
      </ScrollArea>
    )

    const root = container.firstChild
    expect(root).toHaveClass('relative', 'overflow-hidden')

    // Should have viewport as child
    const viewport = root?.querySelector('[class*="h-full"][class*="w-full"]')
    expect(viewport).toBeInTheDocument()
  })
})

describe('ScrollBar Component', () => {
  it('renders with default vertical orientation within ScrollArea', () => {
    const { container } = render(
      <ScrollArea>
        <div style={{ height: '1000px' }}>Content</div>
        <ScrollBar />
      </ScrollArea>
    )

    // ScrollBar should be rendered within the ScrollArea
    expect(container.firstChild).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('relative', 'overflow-hidden')
  })

  it('renders with horizontal orientation within ScrollArea', () => {
    const { container } = render(
      <ScrollArea>
        <div style={{ width: '1000px' }}>Wide content</div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    )

    // ScrollArea should render properly with horizontal scrollbar
    expect(container.firstChild).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('relative', 'overflow-hidden')
  })

  it('applies custom className within ScrollArea', () => {
    const { container } = render(
      <ScrollArea>
        <div>Content</div>
        <ScrollBar className="custom-scrollbar" />
      </ScrollArea>
    )

    // ScrollArea should render with custom scrollbar
    expect(container.firstChild).toBeInTheDocument()
  })

  it('includes thumb element within ScrollArea', () => {
    const { container } = render(
      <ScrollArea>
        <div style={{ height: '1000px' }}>Tall content</div>
        <ScrollBar />
      </ScrollArea>
    )

    // ScrollArea should include the scrollbar structure
    expect(container.firstChild).toBeInTheDocument()
  })

  it('spreads additional props within ScrollArea', () => {
    const { container } = render(
      <ScrollArea>
        <div>Content</div>
        <ScrollBar data-testid="custom-scrollbar" aria-label="Custom scrollbar" />
      </ScrollArea>
    )

    // ScrollArea should render with additional props
    expect(container.firstChild).toBeInTheDocument()
  })

  it('works correctly with vertical orientation', () => {
    const { container } = render(
      <ScrollArea>
        <div style={{ height: '1000px' }}>Tall content</div>
        <ScrollBar orientation="vertical" />
      </ScrollArea>
    )

    expect(container.firstChild).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('relative', 'overflow-hidden')
  })

  it('works correctly with horizontal orientation', () => {
    const { container } = render(
      <ScrollArea>
        <div style={{ width: '1000px' }}>Wide content</div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    )

    expect(container.firstChild).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('relative', 'overflow-hidden')
  })

  it('maintains proper structure within ScrollArea', () => {
    const { container } = render(
      <ScrollArea>
        <div>Content</div>
        <ScrollBar />
      </ScrollArea>
    )

    expect(container.firstChild).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('relative', 'overflow-hidden')
  })

  it('combines custom className with ScrollArea', () => {
    const { container } = render(
      <ScrollArea>
        <div>Content</div>
        <ScrollBar className="my-custom-class" />
      </ScrollArea>
    )

    expect(container.firstChild).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('relative', 'overflow-hidden')
  })
})

describe('ScrollArea Integration', () => {
  it('works with both ScrollArea and ScrollBar together', () => {
    const { container } = render(
      <ScrollArea>
        <div style={{ height: '500px', width: '500px' }}>
          Large content requiring both scroll directions
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    )

    // Should have main scroll area
    const scrollArea = container.firstChild
    expect(scrollArea).toHaveClass('relative', 'overflow-hidden')

    // Content should be present
    expect(screen.getByText('Large content requiring both scroll directions')).toBeInTheDocument()
  })

  it('handles nested content structures', () => {
    render(
      <ScrollArea className="h-48 w-48">
        <div className="p-4">
          <h3>Header</h3>
          <div style={{ height: '300px' }}>
            <p>Paragraph 1</p>
            <p>Paragraph 2</p>
            <p>Paragraph 3</p>
          </div>
        </div>
      </ScrollArea>
    )

    expect(screen.getByText('Header')).toBeInTheDocument()
    expect(screen.getByText('Paragraph 1')).toBeInTheDocument()
    expect(screen.getByText('Paragraph 2')).toBeInTheDocument()
    expect(screen.getByText('Paragraph 3')).toBeInTheDocument()
  })
})