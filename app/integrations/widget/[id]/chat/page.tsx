'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

interface WidgetConfig {
  theme: {
    primary_color: string;
    secondary_color: string;
    background_color: string;
    text_color: string;
    border_radius: number;
    font_family: string;
    font_size: number;
  };
  behavior: {
    greeting_message: string;
    placeholder_text: string;
    show_typing_indicator: boolean;
    sound_enabled: boolean;
  };
  branding: {
    bot_name: string;
    company_name: string;
    show_powered_by: boolean;
    custom_avatar_url?: string;
  };
}

export default function WidgetChatPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const chatbotId = params.id as string;
  const sessionId = searchParams.get('sessionId');
  const apiKey = searchParams.get('apiKey');

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load widget configuration
  useEffect(() => {
    const loadConfig = async () => {
      try {
        if (!apiKey || !chatbotId) return;

        const response = await fetch(`/api/v1/chatbots/${chatbotId}/integrations/widget`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          setConfig(data.config);
          setIsConnected(true);

          // Add greeting message
          if (data.config.behavior.greeting_message) {
            const greetingMessage: Message = {
              id: 'greeting_' + Date.now(),
              content: data.config.behavior.greeting_message,
              sender: 'bot',
              timestamp: new Date()
            };
            setMessages([greetingMessage]);
          }

          // Notify parent about successful connection
          window.parent?.postMessage({
            type: 'CHAT_OPENED',
            data: { chatbotId, sessionId }
          }, '*');
        }
      } catch (error) {
        console.error('Failed to load widget config:', error);
      }
    };

    loadConfig();
  }, [apiKey, chatbotId, sessionId]);

  // Listen for messages from parent window
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type, data } = event.data;

      switch (type) {
        case 'WIDGET_CONFIG':
          setConfig(data.config);
          break;
        case 'MINIMIZE_WIDGET':
          window.parent?.postMessage({
            type: 'MINIMIZE_REQUEST',
            data: {}
          }, '*');
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: 'user_' + Date.now(),
      content: inputValue.trim(),
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // Notify parent about message sent
    window.parent?.postMessage({
      type: 'CHAT_MESSAGE_SENT',
      data: userMessage.content
    }, '*');

    // Show typing indicator
    if (config?.behavior.show_typing_indicator) {
      setIsTyping(true);
    }

    try {
      // Simulate API call to chatbot (replace with actual implementation)
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

      // Generate mock response (replace with actual chatbot integration)
      const botResponse = generateMockResponse(userMessage.content);

      const botMessage: Message = {
        id: 'bot_' + Date.now(),
        content: botResponse,
        sender: 'bot',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMessage]);

      // Notify parent about message received
      window.parent?.postMessage({
        type: 'CHAT_MESSAGE_RECEIVED',
        data: botMessage.content
      }, '*');

    } catch (error) {
      console.error('Failed to send message:', error);

      const errorMessage: Message = {
        id: 'error_' + Date.now(),
        content: 'Sorry, I encountered an error. Please try again.',
        sender: 'bot',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  };

  // Generate mock response (replace with actual chatbot integration)
  const generateMockResponse = (userInput: string): string => {
    const responses = [
      "Thank you for your message! I'm here to help you.",
      "That's an interesting question. Let me help you with that.",
      "I understand what you're looking for. Here's what I can tell you:",
      "Great question! I'd be happy to assist you with that.",
      "Thanks for reaching out. Here's some information that might help:",
    ];

    if (userInput.toLowerCase().includes('hello') || userInput.toLowerCase().includes('hi')) {
      return "Hello! How can I assist you today?";
    }

    if (userInput.toLowerCase().includes('help')) {
      return "I'm here to help! You can ask me questions about our products, services, or anything else you'd like to know.";
    }

    if (userInput.toLowerCase().includes('thank')) {
      return "You're welcome! Is there anything else I can help you with?";
    }

    return responses[Math.floor(Math.random() * responses.length)];
  };

  // Handle minimize
  const handleMinimize = () => {
    window.parent?.postMessage({
      type: 'MINIMIZE_REQUEST',
      data: {}
    }, '*');
  };

  if (!config) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const theme = config.theme;
  const behavior = config.behavior;
  const branding = config.branding;

  return (
    <div
      className="flex flex-col h-screen"
      style={{
        fontFamily: theme.font_family,
        fontSize: `${theme.font_size}px`,
        backgroundColor: theme.background_color,
        color: theme.text_color
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 border-b"
        style={{
          backgroundColor: theme.primary_color,
          color: 'white',
          borderRadius: `${theme.border_radius}px ${theme.border_radius}px 0 0`
        }}
      >
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            {branding.custom_avatar_url ? (
              <img
                src={branding.custom_avatar_url}
                alt="Bot Avatar"
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1 13.5 2.5L16.17 5.17C14.24 4.42 12.12 4.8 10.5 6.5L8 9H2V11H7L9.5 8.5C10.69 7.31 12.78 7.31 13.97 8.5L16.5 11H22V9H21Z"/>
              </svg>
            )}
          </div>
          <div>
            <div className="font-semibold">{branding.bot_name}</div>
            {branding.company_name && (
              <div className="text-xs opacity-80">{branding.company_name}</div>
            )}
            <div className="text-xs opacity-60">
              {isConnected ? 'Online' : 'Connecting...'}
            </div>
          </div>
        </div>
        <button
          onClick={handleMinimize}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13H5V11H19V13Z"/>
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] p-3 rounded-lg ${
                message.sender === 'user'
                  ? 'text-white'
                  : 'border'
              }`}
              style={{
                backgroundColor: message.sender === 'user' ? theme.primary_color : theme.secondary_color,
                borderRadius: `${theme.border_radius}px`,
                borderColor: message.sender === 'bot' ? theme.secondary_color : 'transparent'
              }}
            >
              <div className="text-sm">{message.content}</div>
              <div
                className={`text-xs mt-1 opacity-60 ${
                  message.sender === 'user' ? 'text-white/60' : 'text-gray-500'
                }`}
              >
                {message.timestamp.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex justify-start">
            <div
              className="p-3 border rounded-lg"
              style={{
                backgroundColor: theme.secondary_color,
                borderRadius: `${theme.border_radius}px`,
                borderColor: theme.secondary_color
              }}
            >
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t" style={{ borderColor: theme.secondary_color }}>
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={behavior.placeholder_text}
            className="flex-1 p-3 border rounded-lg focus:outline-none focus:ring-2"
            style={{
              borderRadius: `${theme.border_radius}px`,
              borderColor: theme.secondary_color,
              backgroundColor: 'white',
              color: theme.text_color
            }}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="p-3 text-white rounded-lg transition-all disabled:opacity-50"
            style={{
              backgroundColor: theme.primary_color,
              borderRadius: `${theme.border_radius}px`
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2 21L23 12 2 3V10L17 12 2 14V21Z"/>
            </svg>
          </button>
        </form>

        {/* Powered by */}
        {branding.show_powered_by && (
          <div className="text-center mt-2">
            <div className="text-xs opacity-60">
              Powered by {branding.company_name || 'ChatBot'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}