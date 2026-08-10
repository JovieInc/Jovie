import { BlogMarkdownReader } from '@/components/molecules/BlogMarkdownReader';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { cn } from '@/lib/utils';

export interface MarketingContentProseProps {
  /** Sanitized HTML produced by the canonical markdown document pipeline. */
  readonly html: string;
  readonly ariaLabel?: string;
  readonly className?: string;
}

/**
 * Canonical long-form marketing body for articles, founder letters, and SEO
 * prose. Width and typography stay token-backed while the caller owns the
 * surrounding page header, table of contents, and related content.
 */
export function MarketingContentProse({
  html,
  ariaLabel = 'Article content',
  className,
}: MarketingContentProseProps) {
  return (
    <section
      aria-label={ariaLabel}
      data-pen-contract={MARKETING_PEN_CONTRACT_IDS.section.contentProse}
      className={cn('w-full max-w-prose-canonical', className)}
      data-marketing-section='content-prose'
      data-testid='marketing-content-prose'
    >
      <BlogMarkdownReader html={html} />
    </section>
  );
}
