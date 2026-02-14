'use client';

import DOMPurify from 'isomorphic-dompurify';
import { useMemo } from 'react';
import { remark } from 'remark';
import remarkHtml from 'remark-html';

import { cn } from '@/lib/utils';

/**
 * Chat-scoped markdown styles. Designed for compact AI responses with
 * proper hierarchy using the app's design tokens.
 */
const CHAT_MARKDOWN_STYLES = cn(
  'text-sm leading-relaxed text-primary-token',

  // Paragraphs
  '[&_p]:mb-2 [&_p:last-child]:mb-0',

  // Lists
  '[&_ul]:my-2 [&_ul]:pl-4 [&_ul]:list-disc [&_ul]:space-y-1',
  '[&_ol]:my-2 [&_ol]:pl-4 [&_ol]:list-decimal [&_ol]:space-y-1',
  '[&_li]:text-sm [&_li]:leading-relaxed',

  // Strong / emphasis
  '[&_strong]:font-semibold [&_strong]:text-primary-token',
  '[&_em]:italic',

  // Headings
  '[&_h1]:font-semibold [&_h1]:text-primary-token [&_h1]:text-base [&_h1]:mt-3 [&_h1]:mb-1',
  '[&_h2]:font-semibold [&_h2]:text-primary-token [&_h2]:text-base [&_h2]:mt-3 [&_h2]:mb-1',
  '[&_h3]:font-semibold [&_h3]:text-primary-token [&_h3]:text-sm [&_h3]:mt-3 [&_h3]:mb-1',
  '[&_h4]:font-medium [&_h4]:text-primary-token [&_h4]:text-sm [&_h4]:mt-2 [&_h4]:mb-1',

  // Inline code
  '[&_code]:text-xs [&_code]:font-mono [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded-md [&_code]:bg-surface-3',

  // Code blocks
  '[&_pre]:my-2 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:bg-surface-3 [&_pre]:overflow-x-auto',
  '[&_pre_code]:p-0 [&_pre_code]:bg-transparent [&_pre_code]:text-xs',

  // Links
  '[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2',

  // Horizontal rules
  '[&_hr]:my-3 [&_hr]:border-subtle',

  // Blockquotes
  '[&_blockquote]:border-l-2 [&_blockquote]:border-subtle [&_blockquote]:pl-3 [&_blockquote]:my-2 [&_blockquote]:text-secondary-token'
);

interface ChatMarkdownProps {
  readonly content: string;
  readonly className?: string;
}

/**
 * Renders markdown content with chat-appropriate typography.
 * Uses remark + remark-html + DOMPurify (same stack as BlogMarkdownReader).
 */
export function ChatMarkdown({ content, className }: ChatMarkdownProps) {
  const sanitizedHtml = useMemo(() => {
    const html = remark().use(remarkHtml).processSync(content).toString();
    return DOMPurify.sanitize(html);
  }, [content]);

  return (
    <div
      className={cn(CHAT_MARKDOWN_STYLES, className)}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML sanitized with DOMPurify
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}
