'use client';

import { Streamdown } from 'streamdown';

import { getChatMarkdownStreamdownConfig } from '@/lib/markdown/streamdown-config';

interface ChatMarkdownProps {
  readonly content: string;
  readonly className?: string;
  readonly isStreaming?: boolean;
}

/**
 * Renders chat markdown with streamdown's streaming-safe parser and sanitization.
 */
export function ChatMarkdown({
  content,
  className,
  isStreaming = false,
}: ChatMarkdownProps) {
  return (
    <Streamdown {...getChatMarkdownStreamdownConfig(isStreaming, className)}>
      {content}
    </Streamdown>
  );
}
