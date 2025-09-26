import React from 'react'
import { render as rtlRender, RenderOptions } from '@testing-library/react'
import { ThemeProvider } from 'next-themes'

// Mock providers for testing
const MockThemeProvider = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
    {children}
  </ThemeProvider>
)

interface AllTheProvidersProps {
  children: React.ReactNode
}

const AllTheProviders = ({ children }: AllTheProvidersProps) => {
  return (
    <MockThemeProvider>
      <div data-testid="app-wrapper">
        {children}
      </div>
    </MockThemeProvider>
  )
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  wrapper?: React.ComponentType<any>
}

const customRender = (
  ui: React.ReactElement,
  options?: CustomRenderOptions
) => rtlRender(ui, { wrapper: AllTheProviders, ...options })

// re-export everything
export * from '@testing-library/react'

// override render method
export { customRender as render }