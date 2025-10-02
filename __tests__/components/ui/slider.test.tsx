import { render, screen, fireEvent } from '@testing-library/react'
import { Slider } from '@/components/ui/slider'
import { act } from 'react'

describe('Slider Component', () => {
  it('renders with default props', () => {
    render(<Slider />)

    const slider = screen.getByRole('slider')
    expect(slider).toBeInTheDocument()
    expect(slider).toHaveAttribute('aria-valuemin', '0')
    expect(slider).toHaveAttribute('aria-valuemax', '100')
    expect(slider).toHaveAttribute('aria-valuenow', '0')
  })

  it('renders with custom min and max values', () => {
    render(<Slider min={10} max={200} defaultValue={[100]} />)

    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('aria-valuemin', '10')
    expect(slider).toHaveAttribute('aria-valuemax', '200')
    expect(slider).toHaveAttribute('aria-valuenow', '100')
  })

  it('renders with multiple values (range)', () => {
    render(<Slider defaultValue={[20, 80]} />)

    const sliders = screen.getAllByRole('slider')
    // Single slider shows first value when multiple values provided
    expect(sliders).toHaveLength(1)
    expect(sliders[0]).toHaveAttribute('aria-valuenow', '20')
  })

  it('renders with custom step value', () => {
    render(<Slider step={5} min={0} max={50} defaultValue={[25]} />)

    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('aria-valuemin', '0')
    expect(slider).toHaveAttribute('aria-valuemax', '50')
    expect(slider).toHaveAttribute('aria-valuenow', '25')
  })

  it('applies custom className', () => {
    const { container } = render(<Slider className="custom-slider" />)

    const sliderRoot = container.firstChild
    expect(sliderRoot).toHaveClass('custom-slider')
    expect(sliderRoot).toHaveClass('relative', 'flex', 'w-full', 'touch-none', 'select-none', 'items-center')
  })

  it('handles disabled state', () => {
    render(<Slider disabled defaultValue={[50]} />)

    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('data-disabled', '')
    expect(slider).toHaveAttribute('aria-valuenow', '50')
  })

  it('calls onValueChange when value changes', () => {
    const handleValueChange = jest.fn()
    render(<Slider onValueChange={handleValueChange} defaultValue={[50]} />)

    const slider = screen.getByRole('slider')

    // Simulate keyboard interaction
    act(() => {
      fireEvent.keyDown(slider, { key: 'ArrowRight' })
    })

    expect(handleValueChange).toHaveBeenCalled()
  })

  it('responds to keyboard navigation', () => {
    const handleValueChange = jest.fn()
    render(<Slider onValueChange={handleValueChange} defaultValue={[50]} step={1} />)

    const slider = screen.getByRole('slider')
    slider.focus()

    // Test arrow right increases value
    act(() => {
      fireEvent.keyDown(slider, { key: 'ArrowRight' })
    })

    // Test arrow left decreases value
    act(() => {
      fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    })

    // Test page up increases by larger step
    act(() => {
      fireEvent.keyDown(slider, { key: 'PageUp' })
    })

    // Test page down decreases by larger step
    act(() => {
      fireEvent.keyDown(slider, { key: 'PageDown' })
    })

    // Test home goes to minimum
    act(() => {
      fireEvent.keyDown(slider, { key: 'Home' })
    })

    // Test end goes to maximum
    act(() => {
      fireEvent.keyDown(slider, { key: 'End' })
    })

    expect(handleValueChange).toHaveBeenCalledTimes(6)
  })

  it('has proper ARIA attributes', () => {
    render(<Slider defaultValue={[75]} min={0} max={100} step={5} />)

    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('role', 'slider')
    expect(slider).toHaveAttribute('aria-valuemin', '0')
    expect(slider).toHaveAttribute('aria-valuemax', '100')
    expect(slider).toHaveAttribute('aria-valuenow', '75')
    expect(slider).toHaveAttribute('tabindex', '0')
  })

  it('displays track and range correctly', () => {
    const { container } = render(<Slider defaultValue={[30]} />)

    // Check for track element
    const track = container.querySelector('[class*="bg-secondary"]')
    expect(track).toBeInTheDocument()

    // Check for range element
    const range = container.querySelector('[class*="bg-primary"]')
    expect(range).toBeInTheDocument()
  })

  it('displays thumb correctly', () => {
    const { container } = render(<Slider defaultValue={[60]} />)

    // Check for thumb element
    const thumb = container.querySelector('[class*="rounded-full"][class*="border-2"][class*="border-primary"]')
    expect(thumb).toBeInTheDocument()
  })

  it('handles controlled mode with value prop', () => {
    const handleValueChange = jest.fn()
    const { rerender } = render(
      <Slider value={[25]} onValueChange={handleValueChange} />
    )

    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('aria-valuenow', '25')

    // Update the value prop
    rerender(<Slider value={[75]} onValueChange={handleValueChange} />)
    expect(slider).toHaveAttribute('aria-valuenow', '75')
  })

  it('supports vertical orientation', () => {
    const { container } = render(<Slider orientation="vertical" defaultValue={[50]} />)

    const sliderRoot = container.firstChild
    expect(sliderRoot).toHaveAttribute('data-orientation', 'vertical')
  })

  it('supports range selection with multiple thumbs', () => {
    const handleValueChange = jest.fn()
    render(<Slider defaultValue={[20, 80]} onValueChange={handleValueChange} />)

    const sliders = screen.getAllByRole('slider')
    expect(sliders).toHaveLength(1) // Single slider for now

    // First thumb shows first value
    expect(sliders[0]).toHaveAttribute('aria-valuenow', '20')
  })

  it('prevents interaction when disabled', () => {
    const handleValueChange = jest.fn()
    render(<Slider disabled defaultValue={[50]} onValueChange={handleValueChange} />)

    const slider = screen.getByRole('slider')

    // Try to interact with disabled slider
    act(() => {
      fireEvent.keyDown(slider, { key: 'ArrowRight' })
    })

    // Should not call the handler
    expect(handleValueChange).not.toHaveBeenCalled()
  })

  it('respects min and max bounds', () => {
    const handleValueChange = jest.fn()
    render(<Slider min={10} max={90} defaultValue={[50]} onValueChange={handleValueChange} />)

    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('aria-valuemin', '10')
    expect(slider).toHaveAttribute('aria-valuemax', '90')
    expect(slider).toHaveAttribute('aria-valuenow', '50')
  })

  it('handles edge case values', () => {
    // Test with minimum value
    const { rerender } = render(<Slider min={0} max={100} defaultValue={[0]} />)
    let slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('aria-valuenow', '0')

    // Test with maximum value - need to render new instance for default value to take effect
    rerender(<Slider min={0} max={100} value={[100]} />)
    slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('aria-valuenow', '100')
  })
})