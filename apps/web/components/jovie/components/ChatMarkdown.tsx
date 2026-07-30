'use client';

import { memo } from 'react';
import { Streamdown } from 'streamdown';

import { getChatMarkdownStreamdownConfig } from '@/lib/markdown/streamdown-config';

interface ChatMarkdownProps {
  readonly content: string;
  readonly className?: string;
  readonly isStreaming?: boolean;
  /** Render a prose fragment without Streamdown's paragraph block wrapper. */
  readonly inline?: boolean;
}

/**
 * Renders chat markdown with streamdown's streaming-safe parser and sanitization.
 */
export const ChatMarkdown = memo(function ChatMarkdown({
  content,
  className,
  isStreaming = false,
  inline = false,
}: ChatMarkdownProps) {
  return (
    <Streamdown
      {...getChatMarkdownStreamdownConfig(isStreaming, className, inline)}
    >
      {content}
    </Streamdown>
  );
});
