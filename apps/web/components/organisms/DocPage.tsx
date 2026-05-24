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

export function DocPage({ doc, aside, pdfTitle }: DocPageProps) {
  return (
    <div className='space-y-10'>
      <DocPrintScope />
      <div className='flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between'>
        <LegalHero
          title={doc.title}
          lastUpdated={doc.lastUpdated}
          practicalSummary={doc.practicalSummary}
        />
        <div className='self-start'>
          <DocToolbar pdfTitle={pdfTitle} />
        </div>
      </div>
      <div className='border-y border-neutral-200 py-5 dark:border-white/10 lg:hidden'>
        <LegalSidebar toc={doc.toc} />
      </div>
      <div className='grid min-w-0 gap-12 lg:grid-cols-[220px_minmax(0,760px)] xl:grid-cols-[240px_minmax(0,800px)]'>
        <aside
          data-doc-sidebar
          className='max-lg:hidden lg:sticky lg:top-24 lg:self-start'
        >
          <LegalSidebar toc={doc.toc} />
          {aside}
        </aside>
        <LegalMarkdownReader html={doc.html} className='min-w-0' />
      </div>
    </div>
  );
}
