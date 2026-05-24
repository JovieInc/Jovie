import { cn } from '@/lib/utils';

export interface LegalMarkdownReaderProps {
  readonly html: string;
  readonly className?: string;
}

const LEGAL_MARKDOWN_STYLES = cn(
  'max-w-none min-w-0 text-[15px] leading-7 text-neutral-900 dark:text-white',
  '[&_h1]:scroll-mt-24 [&_h1]:mb-4 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:text-neutral-950 dark:[&_h1]:text-white',
  '[&_h2]:scroll-mt-24 [&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:border-b [&_h2]:border-neutral-200 [&_h2]:pb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-neutral-950 dark:[&_h2]:border-white/10 dark:[&_h2]:text-white',
  '[&_h3]:scroll-mt-24 [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-neutral-950 dark:[&_h3]:text-white',
  '[&_h4]:scroll-mt-24 [&_h4]:mt-7 [&_h4]:mb-2 [&_h4]:text-[15px] [&_h4]:font-semibold [&_h4]:text-neutral-950 dark:[&_h4]:text-white',
  '[&_p]:mb-5 [&_p]:text-[15px] [&_p]:leading-7 [&_p]:text-neutral-600 dark:[&_p]:text-neutral-400',
  '[&_a]:break-words [&_a]:font-medium [&_a]:text-neutral-950 [&_a]:underline [&_a]:decoration-neutral-300 [&_a]:underline-offset-4 hover:[&_a]:decoration-neutral-600 dark:[&_a]:text-white dark:[&_a]:decoration-neutral-600 dark:hover:[&_a]:decoration-neutral-300',
  '[&_strong]:font-medium [&_strong]:text-neutral-950 dark:[&_strong]:text-white',
  '[&_em]:text-neutral-800 dark:[&_em]:text-neutral-200',
  '[&_del]:text-neutral-500 dark:[&_del]:text-neutral-500',
  '[&_blockquote]:my-7 [&_blockquote]:border-l [&_blockquote]:border-neutral-300 [&_blockquote]:pl-4 dark:[&_blockquote]:border-white/15',
  '[&_blockquote_p]:mb-3 [&_blockquote_p]:text-neutral-700 dark:[&_blockquote_p]:text-neutral-300',
  '[&_blockquote_p:last-child]:mb-0',
  '[&_ul]:my-5 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5',
  '[&_ol]:my-5 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5',
  '[&_li]:pl-1 [&_li]:text-[15px] [&_li]:leading-7 [&_li]:text-neutral-600 dark:[&_li]:text-neutral-400',
  '[&_li::marker]:text-neutral-400 dark:[&_li::marker]:text-neutral-600',
  '[&_ul.contains-task-list]:list-none [&_ul.contains-task-list]:pl-0',
  '[&_li.task-list-item]:flex [&_li.task-list-item]:items-start [&_li.task-list-item]:gap-2 [&_li.task-list-item]:pl-0',
  '[&_li.task-list-item_input]:mt-[0.45rem] [&_li.task-list-item_input]:h-3.5 [&_li.task-list-item_input]:w-3.5 [&_li.task-list-item_input]:shrink-0 [&_li.task-list-item_input]:accent-neutral-950 dark:[&_li.task-list-item_input]:accent-white',
  '[&_code]:rounded-[5px] [&_code]:bg-neutral-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em] [&_code]:text-neutral-900 dark:[&_code]:bg-white/10 dark:[&_code]:text-neutral-100',
  '[&_pre]:my-7 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-neutral-200 [&_pre]:bg-neutral-950 [&_pre]:p-4 dark:[&_pre]:border-white/10 dark:[&_pre]:bg-black',
  '[&_pre_code]:block [&_pre_code]:min-w-max [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[13px] [&_pre_code]:leading-6 [&_pre_code]:text-neutral-100',
  '[&_table]:my-7 [&_table]:block [&_table]:w-full [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-separate [&_table]:border-spacing-0 [&_table]:text-left [&_table]:text-sm',
  '[&_th]:min-w-[12rem] [&_th]:border-b [&_th]:border-neutral-300 [&_th]:bg-neutral-50 [&_th]:px-3 [&_th]:py-2 [&_th]:font-medium [&_th]:text-neutral-950 dark:[&_th]:border-white/15 dark:[&_th]:bg-white/5 dark:[&_th]:text-white',
  '[&_td]:min-w-[12rem] [&_td]:border-b [&_td]:border-neutral-200 [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top [&_td]:text-neutral-600 dark:[&_td]:border-white/10 dark:[&_td]:text-neutral-400',
  '[&_tr:last-child_td]:border-b-0',
  '[&_hr]:my-10 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-neutral-200 dark:[&_hr]:border-white/10'
);

export function LegalMarkdownReader({
  html,
  className,
}: LegalMarkdownReaderProps) {
  // HTML is sanitized server-side in createMarkdownDocument() — see
  // apps/web/lib/docs/getMarkdownDocument.ts.
  return (
    <article className={cn('relative', className)}>
      <div
        className={LEGAL_MARKDOWN_STYLES}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML sanitized server-side in createMarkdownDocument
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}
