import { render, screen, fireEvent } from '@/lib/test-utils'
import { Input } from '@/components/ui/input'

describe('Input Component', () => {
  it('renders with default props', () => {
    render(<Input />)

    const input = screen.getByRole('textbox')
    expect(input).toBeInTheDocument()
    expect(input).toHaveClass('flex', 'h-10', 'w-full', 'rounded-md', 'border')
  })

  it('handles value changes', () => {
    const handleChange = jest.fn()
    render(<Input onChange={handleChange} />)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'test input' } })

    expect(handleChange).toHaveBeenCalled()
    expect(input).toHaveValue('test input')
  })

  it('can be disabled', () => {
    render(<Input disabled />)

    const input = screen.getByRole('textbox')
    expect(input).toBeDisabled()
    expect(input).toHaveClass('disabled:cursor-not-allowed')
  })

  it('supports different input types', () => {
    const { rerender } = render(<Input type="password" />)
    expect(screen.getByRole('textbox', { hidden: true })).toHaveAttribute('type', 'password')

    rerender(<Input type="email" />)
    expect(screen.getByRole('textbox')).toHaveAttribute('type', 'email')

    rerender(<Input type="number" />)
    expect(screen.getByRole('spinbutton')).toHaveAttribute('type', 'number')
  })

  it('applies custom className', () => {
    render(<Input className="custom-input" />)

    const input = screen.getByRole('textbox')
    expect(input).toHaveClass('custom-input')
    expect(input).toHaveClass('border') // Still has default classes
  })

  it('supports placeholder text', () => {
    render(<Input placeholder="Enter your name" />)

    const input = screen.getByPlaceholderText('Enter your name')
    expect(input).toBeInTheDocument()
  })

  it('can have default value', () => {
    render(<Input defaultValue="default text" />)

    const input = screen.getByDisplayValue('default text')
    expect(input).toBeInTheDocument()
  })

  it('handles focus and blur events', () => {
    const handleFocus = jest.fn()
    const handleBlur = jest.fn()
    render(<Input onFocus={handleFocus} onBlur={handleBlur} />)

    const input = screen.getByRole('textbox')

    fireEvent.focus(input)
    expect(handleFocus).toHaveBeenCalled()

    fireEvent.blur(input)
    expect(handleBlur).toHaveBeenCalled()
  })

  it('supports ref forwarding', () => {
    const ref = React.createRef<HTMLInputElement>()
    render(<Input ref={ref} />)

    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })

  it('applies error styling when in error state', () => {
    // Assuming error styling is applied via className or data attributes
    render(<Input className="border-red-500" data-error="true" />)

    const input = screen.getByRole('textbox')
    expect(input).toHaveClass('border-red-500')
    expect(input).toHaveAttribute('data-error', 'true')
  })
})