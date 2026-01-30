'use client';

import DOMPurify from 'isomorphic-dompurify';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

export interface BlogMarkdownReaderProps {
  readonly html: string;
  readonly className?: string;
}

// Extracted markdown styling classes for reusability
const MARKDOWN_STYLES = cn(
  // Base text styles using design tokens
  'max-w-none text-lg leading-relaxed text-secondary-token text-linear',

  // First paragraph styling (drop cap effect area)
  '[&>p:first-of-type]:text-xl [&>p:first-of-type]:leading-relaxed [&>p:first-of-type]:text-primary-token',

  // Headings with proper hierarchy
  '[&_h1]:scroll-mt-24 [&_h1]:marketing-h2-linear [&_h1]:text-primary-token [&_h1]:mb-6 [&_h1]:mt-0',
  '[&_h2]:scroll-mt-24 [&_h2]:text-2xl [&_h2]:sm:text-3xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-primary-token [&_h2]:mt-16 [&_h2]:mb-6',
  '[&_h3]:scroll-mt-24 [&_h3]:text-xl [&_h3]:sm:text-2xl [&_h3]:font-semibold [&_h3]:tracking-tight [&_h3]:text-primary-token [&_h3]:mt-12 [&_h3]:mb-4',
  '[&_h4]:scroll-mt-24 [&_h4]:text-lg [&_h4]:sm:text-xl [&_h4]:font-semibold [&_h4]:tracking-tight [&_h4]:text-primary-token [&_h4]:mt-10 [&_h4]:mb-4',

  // Paragraphs
  '[&_p]:text-lg [&_p]:leading-relaxed [&_p]:text-secondary-token [&_p]:mb-6',

  // Blockquotes with subtle styling
  '[&_blockquote]:my-10 [&_blockquote]:relative [&_blockquote]:pl-6',
  '[&_blockquote]:before:absolute [&_blockquote]:before:left-0 [&_blockquote]:before:top-0 [&_blockquote]:before:bottom-0 [&_blockquote]:before:w-[3px] [&_blockquote]:before:rounded-full [&_blockquote]:before:bg-border-strong',
  '[&_blockquote_p]:text-lg [&_blockquote_p]:text-secondary-token [&_blockquote_p]:italic [&_blockquote_p]:mb-0',

  // Lists with proper spacing
  '[&_ul]:my-8 [&_ul]:pl-0 [&_ul]:list-none [&_ul]:space-y-4',
  '[&_ol]:my-8 [&_ol]:pl-6 [&_ol]:list-decimal [&_ol]:space-y-4',
  '[&_li]:text-lg [&_li]:leading-relaxed [&_li]:text-secondary-token [&_li]:relative',

  // Custom bullet points for unordered lists
  '[&_ul>li]:pl-6',
  '[&_ul>li]:before:absolute [&_ul>li]:before:left-0 [&_ul>li]:before:top-[0.6em] [&_ul>li]:before:w-1.5 [&_ul>li]:before:h-1.5 [&_ul>li]:before:rounded-full [&_ul>li]:before:bg-tertiary-token',

  // Ordered list markers
  '[&_ol>li::marker]:text-tertiary-token [&_ol>li::marker]:font-medium',

  // Links with subtle underline
  '[&_a]:text-primary-token [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4 [&_a]:decoration-border-default [&_a]:transition-colors [&_a]:duration-200',
  'hover:[&_a]:decoration-primary-token',

  // Strong/bold text
  '[&_strong]:text-primary-token [&_strong]:font-semibold',

  // Emphasis/italic
  '[&_em]:text-primary-token',

  // Code inline
  '[&_code]:text-sm [&_code]:font-mono [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md [&_code]:bg-surface-2 [&_code]:text-primary-token',

  // Code blocks
  '[&_pre]:my-8 [&_pre]:p-6 [&_pre]:rounded-xl [&_pre]:bg-surface-1 [&_pre]:border [&_pre]:border-border-subtle [&_pre]:overflow-x-auto',
  '[&_pre_code]:p-0 [&_pre_code]:bg-transparent [&_pre_code]:text-secondary-token',

  // Horizontal rules
  '[&_hr]:my-12 [&_hr]:border-0 [&_hr]:h-px [&_hr]:bg-border-subtle',

  // Images
  '[&_img]:my-10 [&_img]:rounded-xl [&_img]:w-full',

  // Tables
  '[&_table]:my-8 [&_table]:w-full [&_table]:text-left [&_table]:border-collapse',
  '[&_th]:pb-3 [&_th]:text-sm [&_th]:font-semibold [&_th]:text-tertiary-token [&_th]:border-b [&_th]:border-border-default',
  '[&_td]:py-3 [&_td]:text-secondary-token [&_td]:border-b [&_td]:border-border-subtle'
);

export function BlogMarkdownReader({
  html,
  className,
}: BlogMarkdownReaderProps) {
  // Sanitize HTML to prevent XSS from markdown content
  const sanitizedHtml = useMemo(() => DOMPurify.sanitize(html), [html]);

  return (
    <article className={cn('relative', className)}>
      <div
        className={MARKDOWN_STYLES}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML sanitized with DOMPurify
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    </article>
  );
}
