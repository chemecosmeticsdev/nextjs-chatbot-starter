import { render, screen, act } from '@/lib/test-utils'
import { ThemeProvider } from '@/components/theme-provider'
import { useTheme } from 'next-themes'

// Mock next-themes
const mockSetTheme = jest.fn()
const mockUseTheme = {
  theme: 'light',
  setTheme: mockSetTheme,
  systemTheme: 'light',
  themes: ['light', 'dark', 'system'],
  resolvedTheme: 'light'
}

jest.mock('next-themes', () => ({
  ThemeProvider: ({ children, ...props }: any) => (
    <div data-testid="theme-provider" {...props}>
      {children}
    </div>
  ),
  useTheme: () => mockUseTheme
}))

// Test component that uses theme
const TestThemeConsumer = () => {
  const { theme, setTheme } = useTheme()

  return (
    <div>
      <span data-testid="current-theme">Current theme: {theme}</span>
      <button
        data-testid="toggle-theme"
        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      >
        Toggle Theme
      </button>
    </div>
  )
}

describe('ThemeProvider Component', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseTheme.theme = 'light'
  })

  it('renders children correctly', () => {
    render(
      <ThemeProvider>
        <div data-testid="child-content">Test content</div>
      </ThemeProvider>
    )

    expect(screen.getByTestId('theme-provider')).toBeInTheDocument()
    expect(screen.getByTestId('child-content')).toBeInTheDocument()
  })

  it('passes correct props to ThemeProvider', () => {
    render(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>
    )

    const provider = screen.getByTestId('theme-provider')
    expect(provider).toHaveAttribute('attribute', 'class')
    expect(provider).toHaveAttribute('defaultTheme', 'system')
    expect(provider).toHaveAttribute('enableSystem', 'true')
    expect(provider).toHaveAttribute('disableTransitionOnChange')
  })

  it('provides theme context to child components', () => {
    render(
      <ThemeProvider>
        <TestThemeConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId('current-theme')).toHaveTextContent('Current theme: light')
  })

  it('handles theme changes', () => {
    render(
      <ThemeProvider>
        <TestThemeConsumer />
      </ThemeProvider>
    )

    const toggleButton = screen.getByTestId('toggle-theme')

    act(() => {
      toggleButton.click()
    })

    expect(mockSetTheme).toHaveBeenCalledWith('dark')
  })

  it('supports dark theme', () => {
    mockUseTheme.theme = 'dark'

    render(
      <ThemeProvider>
        <TestThemeConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId('current-theme')).toHaveTextContent('Current theme: dark')
  })

  it('supports system theme', () => {
    mockUseTheme.theme = 'system'

    render(
      <ThemeProvider>
        <TestThemeConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId('current-theme')).toHaveTextContent('Current theme: system')
  })

  it('handles theme transitions', () => {
    const { rerender } = render(
      <ThemeProvider>
        <TestThemeConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId('current-theme')).toHaveTextContent('Current theme: light')

    // Change theme
    mockUseTheme.theme = 'dark'

    rerender(
      <ThemeProvider>
        <TestThemeConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId('current-theme')).toHaveTextContent('Current theme: dark')
  })

  it('preserves theme preference across re-renders', () => {
    const { rerender } = render(
      <ThemeProvider>
        <div data-testid="content">Content</div>
      </ThemeProvider>
    )

    expect(screen.getByTestId('theme-provider')).toBeInTheDocument()

    rerender(
      <ThemeProvider>
        <div data-testid="content">Updated Content</div>
      </ThemeProvider>
    )

    expect(screen.getByTestId('theme-provider')).toBeInTheDocument()
    expect(screen.getByTestId('content')).toHaveTextContent('Updated Content')
  })

  it('handles multiple theme consumers', () => {
    const SecondConsumer = () => {
      const { theme } = useTheme()
      return <div data-testid="second-consumer">Theme: {theme}</div>
    }

    render(
      <ThemeProvider>
        <TestThemeConsumer />
        <SecondConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId('current-theme')).toHaveTextContent('Current theme: light')
    expect(screen.getByTestId('second-consumer')).toHaveTextContent('Theme: light')
  })
})