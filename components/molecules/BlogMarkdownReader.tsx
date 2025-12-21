import { cn } from '@/lib/utils';

export interface BlogMarkdownReaderProps {
  html: string;
  className?: string;
}

export function BlogMarkdownReader({
  html,
  className,
}: BlogMarkdownReaderProps) {
  return (
    <article className={cn('relative', className)}>
      <div
        className={cn(
          'max-w-none text-lg leading-8 text-neutral-700 dark:text-neutral-200',
          // Headings
          '[&_h1]:scroll-mt-24 [&_h1]:text-4xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:mb-6 [&_h1]:text-neutral-950 dark:[&_h1]:text-white',
          '[&_h2]:scroll-mt-24 [&_h2]:text-3xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:mt-16 [&_h2]:mb-6 [&_h2]:text-neutral-950 dark:[&_h2]:text-white',
          '[&_h3]:scroll-mt-24 [&_h3]:text-2xl [&_h3]:font-bold [&_h3]:tracking-tight [&_h3]:mt-12 [&_h3]:mb-4 [&_h3]:text-neutral-950 dark:[&_h3]:text-white',
          // Paragraphs
          '[&_p]:text-lg [&_p]:leading-8 [&_p]:text-neutral-700 dark:[&_p]:text-neutral-200 [&_p]:mb-6',
          // Blockquotes
          '[&_blockquote]:my-10 [&_blockquote]:rounded-lg [&_blockquote]:border-l-[3px] [&_blockquote]:border-neutral-950 dark:[&_blockquote]:border-white [&_blockquote]:bg-neutral-950/5 dark:[&_blockquote]:bg-white/5 [&_blockquote]:px-6 [&_blockquote]:py-5',
          '[&_blockquote_p]:mb-2 [&_blockquote_p]:text-neutral-800 dark:[&_blockquote_p]:text-neutral-200',
          '[&_blockquote_p:last-child]:mb-0 [&_blockquote_p:last-child]:text-sm [&_blockquote_p:last-child]:text-neutral-500 dark:[&_blockquote_p:last-child]:text-neutral-400',
          // Lists
          '[&_ul]:my-8 [&_ul]:pl-6 [&_ul]:list-disc [&_ul]:space-y-4',
          '[&_ol]:my-8 [&_ol]:pl-6 [&_ol]:list-decimal [&_ol]:space-y-4',
          '[&_li]:text-lg [&_li]:leading-8 [&_li]:text-neutral-700 dark:[&_li]:text-neutral-200 [&_li]:pl-2',
          '[&_li::marker]:text-neutral-400 dark:[&_li::marker]:text-neutral-500',
          // Links
          '[&_a]:text-neutral-950 dark:[&_a]:text-white [&_a]:underline [&_a]:underline-offset-4 [&_a]:decoration-neutral-300 dark:[&_a]:decoration-neutral-600 [&_a]:font-semibold hover:[&_a]:decoration-neutral-600',
          // Strong
          '[&_strong]:text-neutral-950 dark:[&_strong]:text-white [&_strong]:font-bold'
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}
