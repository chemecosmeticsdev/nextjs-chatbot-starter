import { render, screen, fireEvent, waitFor } from '@/lib/test-utils'
import userEvent from '@testing-library/user-event'
import { LoginForm } from '@/components/login-form'
import { mockApiResponse } from '@/lib/test-utils'

// Mock the useRouter hook
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
  }),
}))

describe('LoginForm Component', () => {
  const user = userEvent.setup()

  beforeEach(() => {
    jest.clearAllMocks()
    mockPush.mockClear()
  })

  it('renders login form with all required fields', () => {
    render(<LoginForm />)

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('shows validation errors for empty fields', async () => {
    render(<LoginForm />)

    const submitButton = screen.getByRole('button', { name: /sign in/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument()
      expect(screen.getByText(/password is required/i)).toBeInTheDocument()
    })
  })

  it('shows validation error for invalid email format', async () => {
    render(<LoginForm />)

    const emailInput = screen.getByLabelText(/email/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    await user.type(emailInput, 'invalid-email')
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/invalid email address/i)).toBeInTheDocument()
    })
  })

  it('handles successful login', async () => {
    // Mock successful login API response
    mockApiResponse('/api/v1/auth/login', {
      success: true,
      user: { id: '1', email: 'test@example.com', role: 'user' },
      token: 'mock-token'
    })

    render(<LoginForm />)

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    await user.type(emailInput, 'test@example.com')
    await user.type(passwordInput, 'password123')
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('handles login failure with error message', async () => {
    // Mock failed login API response
    mockApiResponse('/api/v1/auth/login', {
      success: false,
      error: 'Invalid credentials'
    }, 401)

    render(<LoginForm />)

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    await user.type(emailInput, 'test@example.com')
    await user.type(passwordInput, 'wrongpassword')
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument()
    })
  })

  it('shows loading state during submission', async () => {
    // Mock delayed API response
    mockApiResponse('/api/v1/auth/login', new Promise(resolve =>
      setTimeout(() => resolve({ success: true }), 1000)
    ))

    render(<LoginForm />)

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    await user.type(emailInput, 'test@example.com')
    await user.type(passwordInput, 'password123')
    await user.click(submitButton)

    // Button should show loading state
    expect(screen.getByRole('button', { name: /signing in/i })).toBeInTheDocument()
    expect(submitButton).toBeDisabled()
  })

  it('toggles password visibility', async () => {
    render(<LoginForm />)

    const passwordInput = screen.getByLabelText(/password/i)
    const toggleButton = screen.getByRole('button', { name: /toggle password visibility/i })

    // Initially password should be hidden
    expect(passwordInput).toHaveAttribute('type', 'password')

    // Click to show password
    await user.click(toggleButton)
    expect(passwordInput).toHaveAttribute('type', 'text')

    // Click again to hide password
    await user.click(toggleButton)
    expect(passwordInput).toHaveAttribute('type', 'password')
  })

  it('handles keyboard navigation correctly', async () => {
    render(<LoginForm />)

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    // Tab through form fields
    await user.tab()
    expect(emailInput).toHaveFocus()

    await user.tab()
    expect(passwordInput).toHaveFocus()

    await user.tab()
    expect(submitButton).toHaveFocus()
  })

  it('prevents multiple submissions', async () => {
    mockApiResponse('/api/v1/auth/login', new Promise(resolve =>
      setTimeout(() => resolve({ success: true }), 500)
    ))

    render(<LoginForm />)

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    await user.type(emailInput, 'test@example.com')
    await user.type(passwordInput, 'password123')

    // Click submit button twice quickly
    await user.click(submitButton)
    await user.click(submitButton)

    // Should only call API once
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('clears form on successful submission', async () => {
    mockApiResponse('/api/v1/auth/login', {
      success: true,
      user: { id: '1', email: 'test@example.com' }
    })

    render(<LoginForm />)

    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement
    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    await user.type(emailInput, 'test@example.com')
    await user.type(passwordInput, 'password123')
    await user.click(submitButton)

    await waitFor(() => {
      expect(emailInput.value).toBe('')
      expect(passwordInput.value).toBe('')
    })
  })
})