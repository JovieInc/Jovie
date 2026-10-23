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
      <div className='flex flex-col gap-6'>
        <LegalHero
          title={doc.title}
          lastUpdated={doc.lastUpdated}
          practicalSummary={doc.practicalSummary}
        />
        <div className='self-start'>
          <DocToolbar pdfTitle={pdfTitle} />
        </div>
      </div>
      <div className='space-y-8'>
        <div data-doc-sidebar className='border-y border-subtle py-5'>
          <LegalSidebar toc={doc.toc} />
        </div>
        <LegalMarkdownReader html={doc.html} />
        {aside}
      </div>
    </div>
  );
}
