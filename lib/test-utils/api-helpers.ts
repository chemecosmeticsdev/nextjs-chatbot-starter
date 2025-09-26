import { NextRequest, NextResponse } from 'next/server'
import { createMocks } from 'node-mocks-http'

export interface MockRequestOptions {
  method?: string
  query?: Record<string, string>
  body?: any
  headers?: Record<string, string>
  cookies?: Record<string, string>
  url?: string
}

export function createMockRequest(options: MockRequestOptions = {}): NextRequest {
  const {
    method = 'GET',
    query = {},
    body,
    headers = {},
    cookies = {},
    url = '/'
  } = options

  // Create base URL with query params
  const searchParams = new URLSearchParams(query)
  const fullUrl = `http://localhost:3000${url}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`

  // Create request object
  const request = new NextRequest(fullUrl, {
    method,
    headers: new Headers(headers),
    body: body ? JSON.stringify(body) : undefined,
  })

  // Mock cookies
  if (Object.keys(cookies).length > 0) {
    const cookieHeader = Object.entries(cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')
    request.headers.set('cookie', cookieHeader)
  }

  return request
}

export function createMockResponse(): NextResponse {
  return new NextResponse()
}

export async function callApiRoute(
  handler: (req: NextRequest) => Promise<NextResponse>,
  options: MockRequestOptions = {}
) {
  const request = createMockRequest(options)
  const response = await handler(request)

  let data = null
  try {
    const text = await response.text()
    data = text ? JSON.parse(text) : null
  } catch (error) {
    // Response might not be JSON
    data = null
  }

  return {
    status: response.status,
    data,
    headers: response.headers,
    response
  }
}

export class MockAuthService {
  static validSessions = new Map<string, { userId: string, email: string, role: string }>()

  static createValidSession(userId: string, email: string, role: string = 'user'): string {
    const sessionToken = `mock-session-${Date.now()}-${Math.random()}`
    this.validSessions.set(sessionToken, { userId, email, role })
    return sessionToken
  }

  static async verifySession(sessionToken: string) {
    const session = this.validSessions.get(sessionToken)
    return session ? { userId: session.userId, email: session.email } : null
  }

  static clearSessions() {
    this.validSessions.clear()
  }
}

export class MockUserService {
  static users = new Map<string, {
    id: string,
    email: string,
    fullName: string,
    role: string,
    isActive: boolean
  }>()

  static createUser(id: string, email: string, fullName: string, role: string = 'user') {
    const user = { id, email, fullName, role, isActive: true }
    this.users.set(id, user)
    return user
  }

  static async getUserById(id: string) {
    return this.users.get(id) || null
  }

  static clearUsers() {
    this.users.clear()
  }
}

export function setupApiMocks() {
  // Mock fetch globally
  global.fetch = jest.fn()

  // Setup default mock responses
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>

  mockFetch.mockImplementation((url: string, options = {}) => {
    // Default mock response
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: {} }),
      text: () => Promise.resolve('{}'),
      headers: new Headers(),
    } as Response)
  })

  return mockFetch
}

export function mockApiResponse(
  url: string | RegExp,
  response: any,
  status: number = 200
) {
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>

  mockFetch.mockImplementation((requestUrl: string) => {
    const matches = typeof url === 'string'
      ? requestUrl.includes(url)
      : url.test(requestUrl)

    if (matches) {
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(response),
        text: () => Promise.resolve(JSON.stringify(response)),
        headers: new Headers({
          'content-type': 'application/json',
        }),
      } as Response)
    }

    // Default fallback
    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Not found' }),
      text: () => Promise.resolve('{"error":"Not found"}'),
      headers: new Headers(),
    } as Response)
  })
}

export async function waitForAsyncOperations(ms: number = 0) {
  return new Promise(resolve => setTimeout(resolve, ms))
}