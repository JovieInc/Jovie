'use client';

import DOMPurify from 'isomorphic-dompurify';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

export interface LegalMarkdownReaderProps {
  readonly html: string;
  readonly className?: string;
}

export function LegalMarkdownReader({
  html,
  className,
}: LegalMarkdownReaderProps) {
  // Sanitize HTML to prevent XSS from markdown content
  const sanitizedHtml = useMemo(() => DOMPurify.sanitize(html), [html]);

  return (
    <article className={cn('relative', className)}>
      <div
        className={cn(
          'max-w-none text-[15px] leading-7 text-neutral-900 dark:text-white',
          // Headings
          '[&_h1]:scroll-mt-24 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:mb-2 [&_h1]:text-neutral-900 dark:[&_h1]:text-white',
          '[&_h2]:scroll-mt-24 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:pb-3 [&_h2]:border-b [&_h2]:border-neutral-200 dark:[&_h2]:border-neutral-800 [&_h2]:text-neutral-900 dark:[&_h2]:text-white',
          '[&_h3]:scroll-mt-24 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:tracking-tight [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:text-neutral-900 dark:[&_h3]:text-white',
          // Paragraphs
          '[&_p]:text-[15px] [&_p]:leading-7 [&_p]:text-neutral-600 dark:[&_p]:text-neutral-400 [&_p]:mb-4',
          // Blockquotes (Geist-like)
          '[&_blockquote]:my-6 [&_blockquote]:rounded-lg [&_blockquote]:border-l-2 [&_blockquote]:border-neutral-200 dark:[&_blockquote]:border-white/10 [&_blockquote]:bg-neutral-50 dark:[&_blockquote]:bg-white/5 [&_blockquote]:px-4 [&_blockquote]:py-3',
          '[&_blockquote_p]:mb-3 [&_blockquote_p]:text-neutral-700 dark:[&_blockquote_p]:text-neutral-300',
          '[&_blockquote_p:last-child]:mb-0 [&_blockquote_p:last-child]:mt-3 [&_blockquote_p:last-child]:text-sm [&_blockquote_p:last-child]:text-neutral-500 dark:[&_blockquote_p:last-child]:text-neutral-400',
          '[&_blockquote_a]:font-medium [&_blockquote_a]:underline [&_blockquote_a]:underline-offset-4 [&_blockquote_a]:decoration-neutral-300 dark:[&_blockquote_a]:decoration-neutral-600 hover:[&_blockquote_a]:decoration-neutral-500',
          // Lists
          '[&_ul]:my-4 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:space-y-2',
          '[&_ol]:my-4 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-2',
          '[&_li]:text-[15px] [&_li]:leading-7 [&_li]:text-neutral-600 dark:[&_li]:text-neutral-400 [&_li]:pl-1',
          '[&_li::marker]:text-neutral-400 dark:[&_li::marker]:text-neutral-600',
          // Links
          '[&_a]:text-neutral-900 dark:[&_a]:text-white [&_a]:underline [&_a]:underline-offset-4 [&_a]:decoration-neutral-300 dark:[&_a]:decoration-neutral-600 hover:[&_a]:decoration-neutral-500',
          // Strong
          '[&_strong]:text-neutral-900 dark:[&_strong]:text-white [&_strong]:font-medium'
        )}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML sanitized with DOMPurify
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    </article>
  );
}
