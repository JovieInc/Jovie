import { DocPrintScope } from '@/components/molecules/DocPrintScope';
import { DocToolbar } from '@/components/molecules/DocToolbar';
import { LegalHero } from '@/components/molecules/LegalHero';
import { LegalMarkdownReader } from '@/components/molecules/LegalMarkdownReader';
import { LegalSidebar } from '@/components/molecules/LegalSidebar';
import type { MarkdownDocument } from '@/types/docs';

interface PublicDocument extends MarkdownDocument {
  readonly title: string;
  readonly lastUpdated: string;
  readonly practicalSummary: string;
}

export interface DocPageProps {
  readonly doc: PublicDocument;
  readonly aside?: React.ReactNode;
  readonly pdfTitle: string;
}

/**
 * Public document reader (legal pages). The table of contents owns the left
 * track; the title, toolbar and body share one right-hand column held to a
 * readable measure (`max-w-prose`, ~65ch), so the H1 and every paragraph start
 * on the same edge.
 */
export function DocPage({ doc, aside, pdfTitle }: DocPageProps) {
  return (
    <div
      data-doc-layout
      className='grid min-w-0 gap-x-12 gap-y-10 lg:grid-cols-[220px_minmax(0,760px)] xl:grid-cols-[240px_minmax(0,800px)]'
    >
      <DocPrintScope />
      <div
        data-doc-header
        className='flex min-w-0 max-w-prose flex-col gap-6 border-b border-subtle pb-8 sm:flex-row sm:items-start sm:justify-between lg:col-start-2 lg:row-start-1'
      >
        <LegalHero
          title={doc.title}
          lastUpdated={doc.lastUpdated}
          practicalSummary={doc.practicalSummary}
        />
        <div className='shrink-0 self-start'>
          <DocToolbar pdfTitle={pdfTitle} />
        </div>
      </div>
      <div className='max-w-prose border-b border-subtle pb-5 lg:hidden'>
        <LegalSidebar toc={doc.toc} />
      </div>
      <aside
        data-doc-sidebar
        className='max-lg:hidden lg:sticky lg:top-24 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:self-start'
      >
        <LegalSidebar toc={doc.toc} />
        {aside}
      </aside>
      <LegalMarkdownReader
        html={doc.html}
        className='min-w-0 max-w-prose lg:col-start-2 lg:row-start-2'
      />
    </div>
  );
}
