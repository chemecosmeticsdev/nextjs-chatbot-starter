import { render, screen } from '@/lib/test-utils'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'

describe('Card Components', () => {
  describe('Card', () => {
    it('renders with default classes', () => {
      render(<Card data-testid="card">Card Content</Card>)

      const card = screen.getByTestId('card')
      expect(card).toBeInTheDocument()
      expect(card).toHaveClass('rounded-lg', 'border', 'bg-card', 'text-card-foreground', 'shadow-sm')
    })

    it('applies custom className', () => {
      render(<Card className="custom-card" data-testid="card">Content</Card>)

      const card = screen.getByTestId('card')
      expect(card).toHaveClass('custom-card')
      expect(card).toHaveClass('rounded-lg') // Still has default classes
    })
  })

  describe('CardHeader', () => {
    it('renders with default classes', () => {
      render(<CardHeader data-testid="card-header">Header</CardHeader>)

      const header = screen.getByTestId('card-header')
      expect(header).toBeInTheDocument()
      expect(header).toHaveClass('flex', 'flex-col', 'space-y-1.5', 'p-6')
    })
  })

  describe('CardTitle', () => {
    it('renders as h3 by default', () => {
      render(<CardTitle>Card Title</CardTitle>)

      const title = screen.getByRole('heading', { level: 3 })
      expect(title).toBeInTheDocument()
      expect(title).toHaveTextContent('Card Title')
      expect(title).toHaveClass('text-2xl', 'font-semibold', 'leading-none', 'tracking-tight')
    })

    it('applies custom className', () => {
      render(<CardTitle className="custom-title">Title</CardTitle>)

      const title = screen.getByRole('heading', { level: 3 })
      expect(title).toHaveClass('custom-title')
      expect(title).toHaveClass('font-semibold') // Still has default classes
    })
  })

  describe('CardDescription', () => {
    it('renders with default classes', () => {
      render(<CardDescription data-testid="card-description">Description text</CardDescription>)

      const description = screen.getByTestId('card-description')
      expect(description).toBeInTheDocument()
      expect(description).toHaveTextContent('Description text')
      expect(description).toHaveClass('text-sm', 'text-muted-foreground')
    })
  })

  describe('CardContent', () => {
    it('renders with default classes', () => {
      render(<CardContent data-testid="card-content">Content</CardContent>)

      const content = screen.getByTestId('card-content')
      expect(content).toBeInTheDocument()
      expect(content).toHaveClass('p-6', 'pt-0')
    })
  })

  describe('CardFooter', () => {
    it('renders with default classes', () => {
      render(<CardFooter data-testid="card-footer">Footer</CardFooter>)

      const footer = screen.getByTestId('card-footer')
      expect(footer).toBeInTheDocument()
      expect(footer).toHaveClass('flex', 'items-center', 'p-6', 'pt-0')
    })
  })

  describe('Card Composition', () => {
    it('renders complete card structure correctly', () => {
      render(
        <Card data-testid="complete-card">
          <CardHeader>
            <CardTitle>Test Card Title</CardTitle>
            <CardDescription>Test card description</CardDescription>
          </CardHeader>
          <CardContent>
            <p>This is the card content.</p>
          </CardContent>
          <CardFooter>
            <button>Action</button>
          </CardFooter>
        </Card>
      )

      // Check all parts are rendered
      expect(screen.getByTestId('complete-card')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Test Card Title' })).toBeInTheDocument()
      expect(screen.getByText('Test card description')).toBeInTheDocument()
      expect(screen.getByText('This is the card content.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument()
    })

    it('supports cards with only title and content', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Simple Card</CardTitle>
          </CardHeader>
          <CardContent>
            Simple content
          </CardContent>
        </Card>
      )

      expect(screen.getByRole('heading', { name: 'Simple Card' })).toBeInTheDocument()
      expect(screen.getByText('Simple content')).toBeInTheDocument()
      // Should not have description or footer
      expect(screen.queryByText(/description/i)).not.toBeInTheDocument()
    })
  })
})