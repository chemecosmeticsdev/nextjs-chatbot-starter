/**
 * Message Queue Service
 *
 * Handles queuing messages when connection is unavailable
 * and automatically sends them when connection is restored
 */

export interface QueuedMessage {
  id: string;
  chatbotId: string;
  conversationId: string;
  content: string;
  metadata?: Record<string, any>;
  timestamp: number;
  attempts: number;
  maxAttempts: number;
  priority: 'high' | 'normal' | 'low';
}

export interface MessageQueueOptions {
  maxQueueSize?: number;
  maxRetryAttempts?: number;
  autoFlushOnConnect?: boolean;
  persistToStorage?: boolean;
  storageKey?: string;
}

export class MessageQueue {
  private queue: QueuedMessage[] = [];
  private options: Required<MessageQueueOptions>;
  private isOnline = false;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(options: MessageQueueOptions = {}) {
    this.options = {
      maxQueueSize: 100,
      maxRetryAttempts: 3,
      autoFlushOnConnect: true,
      persistToStorage: true,
      storageKey: 'websocket_message_queue',
      ...options
    };

    // Load persisted queue from storage
    if (this.options.persistToStorage && typeof window !== 'undefined') {
      this.loadFromStorage();
    }
  }

  /**
   * Add a message to the queue
   */
  public enqueue(
    chatbotId: string,
    conversationId: string,
    content: string,
    metadata?: Record<string, any>,
    priority: QueuedMessage['priority'] = 'normal'
  ): string {
    const messageId = `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const queuedMessage: QueuedMessage = {
      id: messageId,
      chatbotId,
      conversationId,
      content,
      metadata,
      timestamp: Date.now(),
      attempts: 0,
      maxAttempts: this.options.maxRetryAttempts,
      priority
    };

    // Add to queue based on priority
    if (priority === 'high') {
      this.queue.unshift(queuedMessage);
    } else {
      this.queue.push(queuedMessage);
    }

    // Ensure queue doesn't exceed max size
    if (this.queue.length > this.options.maxQueueSize) {
      // Remove oldest low priority messages first
      const lowPriorityIndex = this.queue.findIndex(msg => msg.priority === 'low');
      if (lowPriorityIndex !== -1) {
        this.queue.splice(lowPriorityIndex, 1);
      } else {
        // Remove oldest normal priority message
        const normalPriorityIndex = this.queue.findIndex(msg => msg.priority === 'normal');
        if (normalPriorityIndex !== -1) {
          this.queue.splice(normalPriorityIndex, 1);
        } else {
          // As last resort, remove oldest message
          this.queue.shift();
        }
      }
    }

    this.saveToStorage();
    return messageId;
  }

  /**
   * Remove a message from the queue
   */
  public dequeue(messageId: string): QueuedMessage | null {
    const index = this.queue.findIndex(msg => msg.id === messageId);
    if (index === -1) return null;

    const message = this.queue.splice(index, 1)[0];
    this.saveToStorage();
    return message;
  }

  /**
   * Get all queued messages
   */
  public getQueue(): QueuedMessage[] {
    return [...this.queue];
  }

  /**
   * Get queue size
   */
  public size(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is empty
   */
  public isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Clear all messages from queue
   */
  public clear(): void {
    this.queue = [];
    this.saveToStorage();
  }

  /**
   * Set online status
   */
  public setOnlineStatus(online: boolean): void {
    const wasOffline = !this.isOnline;
    this.isOnline = online;

    // Auto-flush when coming back online
    if (online && wasOffline && this.options.autoFlushOnConnect && !this.isEmpty()) {
      this.scheduleFlush();
    }
  }

  /**
   * Flush queue with callback for each message
   */
  public async flush(
    sendCallback: (message: QueuedMessage) => Promise<boolean>
  ): Promise<{ sent: number; failed: number; remaining: number }> {
    let sent = 0;
    let failed = 0;

    const messagesToProcess = [...this.queue];

    for (const message of messagesToProcess) {
      try {
        message.attempts++;
        const success = await sendCallback(message);

        if (success) {
          this.dequeue(message.id);
          sent++;
        } else {
          if (message.attempts >= message.maxAttempts) {
            this.dequeue(message.id);
            failed++;
          }
          // Message stays in queue for retry if under max attempts
        }
      } catch (error) {
        console.error('Error sending queued message:', error);
        if (message.attempts >= message.maxAttempts) {
          this.dequeue(message.id);
          failed++;
        }
      }
    }

    return {
      sent,
      failed,
      remaining: this.queue.length
    };
  }

  /**
   * Schedule automatic flush
   */
  private scheduleFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    // Delay flush slightly to allow connection to stabilize
    this.flushTimer = setTimeout(() => {
      this.notifyFlushRequired();
    }, 1000);
  }

  /**
   * Override this method to handle flush notifications
   */
  protected notifyFlushRequired(): void {
    // This should be overridden by implementations
    console.log('Message queue flush required');
  }

  /**
   * Save queue to local storage
   */
  private saveToStorage(): void {
    if (!this.options.persistToStorage || typeof window === 'undefined') return;

    try {
      localStorage.setItem(this.options.storageKey, JSON.stringify(this.queue));
    } catch (error) {
      console.warn('Failed to save message queue to storage:', error);
    }
  }

  /**
   * Load queue from local storage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.options.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.queue = parsed;
        }
      }
    } catch (error) {
      console.warn('Failed to load message queue from storage:', error);
    }
  }

  /**
   * Get queue statistics
   */
  public getStats(): {
    total: number;
    byPriority: Record<QueuedMessage['priority'], number>;
    oldestMessage: number | null;
    averageAge: number;
  } {
    const now = Date.now();
    const byPriority = { high: 0, normal: 0, low: 0 };
    let oldestMessage: number | null = null;
    let totalAge = 0;

    for (const message of this.queue) {
      byPriority[message.priority]++;
      const age = now - message.timestamp;
      totalAge += age;

      if (oldestMessage === null || message.timestamp < oldestMessage) {
        oldestMessage = message.timestamp;
      }
    }

    return {
      total: this.queue.length,
      byPriority,
      oldestMessage,
      averageAge: this.queue.length > 0 ? totalAge / this.queue.length : 0
    };
  }
}

// Global message queue instance
export const messageQueue = new MessageQueue();