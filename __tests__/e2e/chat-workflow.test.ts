import { test, expect, Page } from '@playwright/test';

// Test data
const testUser = {
  email: 'admin@example.com',
  password: 'testpassword123',
  name: 'Test Admin',
};

const testMessages = [
  'Hello, I need help with my account',
  'Can you help me reset my password?',
  'Thank you for your assistance',
];

// Helper functions
async function login(page: Page) {
  await page.goto('/auth/login');
  await page.fill('[data-testid="email-input"]', testUser.email);
  await page.fill('[data-testid="password-input"]', testUser.password);
  await page.click('[data-testid="login-button"]');

  // Wait for redirect
  await expect(page).toHaveURL('/dashboard');
}

async function navigateToChat(page: Page) {
  await page.goto('/chat');
  await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible();
}

async function waitForChatToLoad(page: Page) {
  // Wait for sidebar to load
  await expect(page.locator('[data-testid="conversation-sidebar"]')).toBeVisible();

  // Wait for chat interface to load
  await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible();

  // Wait for WebSocket connection
  await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected');
}

async function selectChatbot(page: Page, chatbotName: string) {
  const chatbotSelector = page.locator('[data-testid="chatbot-selector"]');
  await chatbotSelector.click();
  await page.click(`[data-testid="chatbot-option-${chatbotName}"]`);

  // Wait for selection to complete
  await expect(chatbotSelector).toContainText(chatbotName);
}

async function sendMessage(page: Page, message: string) {
  const messageInput = page.locator('[data-testid="message-input"]');
  const sendButton = page.locator('[data-testid="send-button"]');

  await messageInput.fill(message);
  await sendButton.click();

  // Wait for message to appear in chat
  await expect(page.locator('[data-testid="chat-messages"]')).toContainText(message);
}

async function waitForResponse(page: Page, timeout: number = 10000) {
  // Wait for typing indicator
  await expect(page.locator('[data-testid="typing-indicator"]')).toBeVisible();

  // Wait for response to appear
  await expect(page.locator('[data-testid="typing-indicator"]')).not.toBeVisible({ timeout });

  // Verify new message appeared
  const messages = page.locator('[data-testid="message-item"]');
  await expect(messages.last()).toBeVisible();
}

test.describe('Chat Workflow E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should load chat interface and establish connection', async ({ page }) => {
    await navigateToChat(page);
    await waitForChatToLoad(page);

    // Verify main components are visible
    await expect(page.locator('[data-testid="conversation-sidebar"]')).toBeVisible();
    await expect(page.locator('[data-testid="chat-interface"]')).toBeVisible();
    await expect(page.locator('[data-testid="chat-settings"]')).toBeVisible();

    // Verify WebSocket connection status
    await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected');

    // Verify chatbot selector is available
    await expect(page.locator('[data-testid="chatbot-selector"]')).toBeVisible();
  });

  test('should start new conversation and send messages', async ({ page }) => {
    await navigateToChat(page);
    await waitForChatToLoad(page);

    // Select a chatbot
    await selectChatbot(page, 'Customer Support Bot');

    // Start new conversation
    await page.click('[data-testid="new-conversation-button"]');
    await expect(page.locator('[data-testid="conversation-title"]')).toContainText('New Conversation');

    // Send first message
    await sendMessage(page, testMessages[0]);

    // Wait for bot response
    await waitForResponse(page);

    // Verify conversation appears in sidebar
    await expect(page.locator('[data-testid="conversation-list"]')).toContainText(testMessages[0]);

    // Send follow-up message
    await sendMessage(page, testMessages[1]);
    await waitForResponse(page);

    // Verify message history
    const messages = page.locator('[data-testid="message-item"]');
    await expect(messages).toHaveCount(4); // 2 user messages + 2 bot responses
  });

  test('should handle typing indicators correctly', async ({ page }) => {
    await navigateToChat(page);
    await waitForChatToLoad(page);

    await selectChatbot(page, 'Customer Support Bot');

    // Start typing without sending
    const messageInput = page.locator('[data-testid="message-input"]');
    await messageInput.fill('I am typing...');

    // User typing indicator should not be visible (user sees their own typing)
    await expect(page.locator('[data-testid="user-typing-indicator"]')).not.toBeVisible();

    // Send message and wait for bot typing
    await page.click('[data-testid="send-button"]');

    // Bot typing indicator should appear
    await expect(page.locator('[data-testid="typing-indicator"]')).toBeVisible();
    await expect(page.locator('[data-testid="typing-indicator"]')).toContainText('typing');

    // Wait for typing to stop and response to appear
    await waitForResponse(page);
    await expect(page.locator('[data-testid="typing-indicator"]')).not.toBeVisible();
  });

  test('should manage multiple conversations', async ({ page }) => {
    await navigateToChat(page);
    await waitForChatToLoad(page);

    await selectChatbot(page, 'Customer Support Bot');

    // Create first conversation
    await page.click('[data-testid="new-conversation-button"]');
    await sendMessage(page, 'First conversation message');
    await waitForResponse(page);

    const firstConversationId = await page.locator('[data-testid="active-conversation"]').getAttribute('data-conversation-id');

    // Create second conversation
    await page.click('[data-testid="new-conversation-button"]');
    await sendMessage(page, 'Second conversation message');
    await waitForResponse(page);

    // Verify second conversation is active
    const secondConversationId = await page.locator('[data-testid="active-conversation"]').getAttribute('data-conversation-id');
    expect(secondConversationId).not.toBe(firstConversationId);

    // Switch back to first conversation
    await page.click(`[data-testid="conversation-item-${firstConversationId}"]`);
    await expect(page.locator('[data-testid="chat-messages"]')).toContainText('First conversation message');

    // Switch to second conversation
    await page.click(`[data-testid="conversation-item-${secondConversationId}"]`);
    await expect(page.locator('[data-testid="chat-messages"]')).toContainText('Second conversation message');
  });

  test('should handle message failures and retry', async ({ page }) => {
    await navigateToChat(page);
    await waitForChatToLoad(page);

    await selectChatbot(page, 'Customer Support Bot');

    // Mock network failure
    await page.route('**/api/chat/send', route => route.abort());

    // Try to send message
    await sendMessage(page, 'This message will fail');

    // Verify failure state
    await expect(page.locator('[data-testid="message-failed"]')).toBeVisible();
    await expect(page.locator('[data-testid="retry-message-button"]')).toBeVisible();

    // Restore network and retry
    await page.unroute('**/api/chat/send');
    await page.click('[data-testid="retry-message-button"]');

    // Verify message is sent successfully
    await waitForResponse(page);
    await expect(page.locator('[data-testid="message-failed"]')).not.toBeVisible();
  });

  test('should support file uploads in chat', async ({ page }) => {
    await navigateToChat(page);
    await waitForChatToLoad(page);

    await selectChatbot(page, 'Customer Support Bot');

    // Create a test file
    const testFile = Buffer.from('Test file content for upload');

    // Click file upload button
    await page.click('[data-testid="file-upload-button"]');

    // Upload file
    const fileInput = page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles({
      name: 'test-document.txt',
      mimeType: 'text/plain',
      buffer: testFile,
    });

    // Verify file appears in chat
    await expect(page.locator('[data-testid="uploaded-file"]')).toBeVisible();
    await expect(page.locator('[data-testid="uploaded-file"]')).toContainText('test-document.txt');

    // Send message with file
    await sendMessage(page, 'Please review this document');

    // Wait for bot response
    await waitForResponse(page);

    // Verify file is included in message history
    await expect(page.locator('[data-testid="message-attachment"]')).toBeVisible();
  });

  test('should handle conversation search and filtering', async ({ page }) => {
    await navigateToChat(page);
    await waitForChatToLoad(page);

    // Create multiple conversations for testing
    await selectChatbot(page, 'Customer Support Bot');

    // Create conversations with different topics
    const topics = ['billing', 'technical', 'general'];

    for (const topic of topics) {
      await page.click('[data-testid="new-conversation-button"]');
      await sendMessage(page, `I need help with ${topic} issues`);
      await waitForResponse(page);
    }

    // Test conversation search
    const searchInput = page.locator('[data-testid="conversation-search"]');
    await searchInput.fill('billing');

    // Verify filtered results
    await expect(page.locator('[data-testid="conversation-list"] [data-testid="conversation-item"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="conversation-list"]')).toContainText('billing');

    // Clear search
    await searchInput.clear();
    await expect(page.locator('[data-testid="conversation-list"] [data-testid="conversation-item"]')).toHaveCount(3);

    // Test status filter
    await page.click('[data-testid="filter-conversations"]');
    await page.click('[data-testid="filter-active"]');

    // Verify active conversations are shown
    await expect(page.locator('[data-testid="conversation-list"] [data-testid="conversation-item"]')).toHaveCountGreaterThan(0);
  });

  test('should display conversation history and metrics', async ({ page }) => {
    await navigateToChat(page);
    await waitForChatToLoad(page);

    await selectChatbot(page, 'Customer Support Bot');

    // Start conversation and exchange multiple messages
    await page.click('[data-testid="new-conversation-button"]');

    for (const message of testMessages) {
      await sendMessage(page, message);
      await waitForResponse(page);
    }

    // Verify conversation metrics
    const conversationMetrics = page.locator('[data-testid="conversation-metrics"]');
    await expect(conversationMetrics.locator('[data-testid="message-count"]')).toContainText(/\d+/);
    await expect(conversationMetrics.locator('[data-testid="conversation-duration"]')).toContainText(/\d+/);
    await expect(conversationMetrics.locator('[data-testid="response-time"]')).toContainText(/\d+\.?\d*s/);

    // Verify message timestamps
    const messages = page.locator('[data-testid="message-item"]');
    const messageCount = await messages.count();

    for (let i = 0; i < messageCount; i++) {
      const message = messages.nth(i);
      await expect(message.locator('[data-testid="message-timestamp"]')).toBeVisible();
    }
  });

  test('should handle WebSocket connection issues', async ({ page }) => {
    await navigateToChat(page);
    await waitForChatToLoad(page);

    // Verify initial connection
    await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected');

    // Simulate connection loss
    await page.evaluate(() => {
      // Force close WebSocket connections
      const mockEvent = new Event('offline');
      window.dispatchEvent(mockEvent);
    });

    // Verify disconnection state
    await expect(page.locator('[data-testid="connection-status"]')).toContainText('Disconnected');
    await expect(page.locator('[data-testid="connection-warning"]')).toBeVisible();

    // Simulate reconnection
    await page.evaluate(() => {
      const mockEvent = new Event('online');
      window.dispatchEvent(mockEvent);
    });

    // Verify reconnection
    await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected');
    await expect(page.locator('[data-testid="connection-warning"]')).not.toBeVisible();
  });

  test('should support keyboard shortcuts and navigation', async ({ page }) => {
    await navigateToChat(page);
    await waitForChatToLoad(page);

    await selectChatbot(page, 'Customer Support Bot');

    // Test Ctrl+Enter to send message
    const messageInput = page.locator('[data-testid="message-input"]');
    await messageInput.fill('Message sent with keyboard shortcut');
    await page.keyboard.press('Control+Enter');

    // Verify message was sent
    await expect(page.locator('[data-testid="chat-messages"]')).toContainText('Message sent with keyboard shortcut');

    // Test Escape to clear input
    await messageInput.fill('This will be cleared');
    await page.keyboard.press('Escape');
    await expect(messageInput).toHaveValue('');

    // Test Tab navigation through conversation list
    await page.keyboard.press('Tab');
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();

    // Test arrow keys for conversation navigation
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
  });

  test('should handle message actions (copy, delete, regenerate)', async ({ page }) => {
    await navigateToChat(page);
    await waitForChatToLoad(page);

    await selectChatbot(page, 'Customer Support Bot');

    // Send a message
    await sendMessage(page, 'Test message for actions');
    await waitForResponse(page);

    const lastMessage = page.locator('[data-testid="message-item"]').last();

    // Test copy message
    await lastMessage.hover();
    await lastMessage.locator('[data-testid="copy-message"]').click();

    // Verify copy feedback
    await expect(page.locator('[data-testid="copy-success"]')).toBeVisible();

    // Test regenerate response (for assistant messages)
    const assistantMessage = page.locator('[data-testid="message-item"][data-role="assistant"]').last();
    await assistantMessage.hover();
    await assistantMessage.locator('[data-testid="regenerate-response"]').click();

    // Verify regeneration
    await expect(page.locator('[data-testid="regenerating-indicator"]')).toBeVisible();
    await waitForResponse(page);

    // Test message rating
    await assistantMessage.hover();
    await assistantMessage.locator('[data-testid="thumbs-up"]').click();

    // Verify rating feedback
    await expect(page.locator('[data-testid="rating-success"]')).toBeVisible();
  });

  test('should support conversation export and sharing', async ({ page }) => {
    await navigateToChat(page);
    await waitForChatToLoad(page);

    await selectChatbot(page, 'Customer Support Bot');

    // Create a conversation with multiple messages
    await page.click('[data-testid="new-conversation-button"]');

    for (const message of testMessages) {
      await sendMessage(page, message);
      await waitForResponse(page);
    }

    // Test conversation export
    await page.click('[data-testid="conversation-menu"]');
    await page.click('[data-testid="export-conversation"]');

    // Wait for download
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-format-json"]');
    const download = await downloadPromise;

    // Verify download
    expect(download.suggestedFilename()).toMatch(/conversation-export.*\.json$/);

    // Test conversation sharing
    await page.click('[data-testid="conversation-menu"]');
    await page.click('[data-testid="share-conversation"]');

    // Verify share modal
    await expect(page.locator('[data-testid="share-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="share-link"]')).toBeVisible();

    // Copy share link
    await page.click('[data-testid="copy-share-link"]');
    await expect(page.locator('[data-testid="copy-success"]')).toBeVisible();
  });

  test('should handle responsive design for mobile chat', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await navigateToChat(page);
    await waitForChatToLoad(page);

    // Verify mobile layout
    await expect(page.locator('[data-testid="mobile-chat-layout"]')).toBeVisible();

    // Conversation sidebar should be collapsible on mobile
    const sidebar = page.locator('[data-testid="conversation-sidebar"]');
    if (await sidebar.isVisible()) {
      // Sidebar might be hidden by default on mobile
      await page.click('[data-testid="toggle-sidebar"]');
    }

    // Test mobile message input
    const messageInput = page.locator('[data-testid="message-input"]');
    await expect(messageInput).toBeVisible();

    // Send message on mobile
    await selectChatbot(page, 'Customer Support Bot');
    await sendMessage(page, 'Mobile test message');
    await waitForResponse(page);

    // Verify message appears correctly
    await expect(page.locator('[data-testid="chat-messages"]')).toContainText('Mobile test message');

    // Test mobile touch interactions
    const lastMessage = page.locator('[data-testid="message-item"]').last();

    // Long press to show actions menu
    await lastMessage.press(); // Playwright press event simulates touch
    await expect(page.locator('[data-testid="message-actions-menu"]')).toBeVisible();
  });

  test('should maintain conversation state across page refreshes', async ({ page }) => {
    await navigateToChat(page);
    await waitForChatToLoad(page);

    await selectChatbot(page, 'Customer Support Bot');

    // Create conversation
    await page.click('[data-testid="new-conversation-button"]');
    await sendMessage(page, 'Message before refresh');
    await waitForResponse(page);

    // Get conversation ID
    const conversationId = await page.locator('[data-testid="active-conversation"]').getAttribute('data-conversation-id');

    // Refresh page
    await page.reload();
    await waitForChatToLoad(page);

    // Verify conversation is restored
    await expect(page.locator('[data-testid="chat-messages"]')).toContainText('Message before refresh');

    // Verify active conversation is the same
    const restoredConversationId = await page.locator('[data-testid="active-conversation"]').getAttribute('data-conversation-id');
    expect(restoredConversationId).toBe(conversationId);

    // Verify chat functionality still works
    await sendMessage(page, 'Message after refresh');
    await waitForResponse(page);
  });

  test('should handle concurrent users in same conversation', async ({ page, context }) => {
    // Create second page to simulate another user
    const page2 = await context.newPage();

    // Both users login and join same conversation
    await login(page);
    await login(page2);

    await navigateToChat(page);
    await navigateToChat(page2);

    await waitForChatToLoad(page);
    await waitForChatToLoad(page2);

    // Create shared conversation
    await selectChatbot(page, 'Customer Support Bot');
    await page.click('[data-testid="new-conversation-button"]');
    await sendMessage(page, 'First user message');

    const conversationId = await page.locator('[data-testid="active-conversation"]').getAttribute('data-conversation-id');

    // Second user joins the conversation
    await selectChatbot(page2, 'Customer Support Bot');
    await page2.goto(`/chat?conversation=${conversationId}`);

    // Verify both users see the message
    await expect(page2.locator('[data-testid="chat-messages"]')).toContainText('First user message');

    // Second user sends message
    await sendMessage(page2, 'Second user message');

    // Verify first user sees the new message
    await expect(page.locator('[data-testid="chat-messages"]')).toContainText('Second user message');

    // Verify typing indicators work across users
    const messageInput2 = page2.locator('[data-testid="message-input"]');
    await messageInput2.fill('User 2 is typing...');

    // User 1 should see typing indicator
    await expect(page.locator('[data-testid="other-user-typing"]')).toBeVisible();

    await page2.close();
  });
});