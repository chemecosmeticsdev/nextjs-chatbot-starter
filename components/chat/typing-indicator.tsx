"use client";

import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  typingUsers: string[];
  className?: string;
  compact?: boolean;
}

export function TypingIndicator({ typingUsers, className, compact = false }: TypingIndicatorProps) {
  if (typingUsers.length === 0) return null;

  const displayText = typingUsers.length === 1
    ? "Assistant is typing..."
    : `${typingUsers.length} users are typing...`;

  return (
    <div className={cn("flex items-center gap-2 text-muted-foreground text-sm animate-in fade-in-0 duration-300", className)}>
      <div className="flex space-x-1">
        <div
          className="w-2 h-2 bg-primary/60 rounded-full animate-bounce shadow-sm"
          style={{ animationDelay: '0s', animationDuration: '1.4s' }}
        />
        <div
          className="w-2 h-2 bg-primary/60 rounded-full animate-bounce shadow-sm"
          style={{ animationDelay: '0.2s', animationDuration: '1.4s' }}
        />
        <div
          className="w-2 h-2 bg-primary/60 rounded-full animate-bounce shadow-sm"
          style={{ animationDelay: '0.4s', animationDuration: '1.4s' }}
        />
      </div>
      {!compact && <span className="animate-pulse">{displayText}</span>}
    </div>
  );
}