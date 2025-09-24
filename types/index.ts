// Global types for the chatbot application

export interface ChatMessage {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: Date
  userId?: string
}

export interface User {
  id: string
  email: string
  name?: string
  createdAt: Date
  updatedAt: Date
}

export interface ChatSession {
  id: string
  userId: string
  title?: string
  messages: ChatMessage[]
  createdAt: Date
  updatedAt: Date
}

export interface APIResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface BedrockResponse {
  completion: string
  stop_reason: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}