import { DocPrintScope } from '@/components/molecules/DocPrintScope';
import { DocToolbar } from '@/components/molecules/DocToolbar';
import {
  LegalHero,
  type LegalHeroProps,
} from '@/components/molecules/LegalHero';
import { LegalMarkdownReader } from '@/components/molecules/LegalMarkdownReader';
import { LegalSidebar } from '@/components/molecules/LegalSidebar';
import type { MarkdownDocument } from '@/types/docs';

export interface DocPageProps {
  readonly doc: MarkdownDocument;
  readonly hero: LegalHeroProps;
  readonly aside?: React.ReactNode;
  readonly pdfTitle: string;
}

export function DocPage({ doc, hero, aside, pdfTitle }: DocPageProps) {
  return (
    <div className='space-y-12'>
      <DocPrintScope />
      <div className='flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between'>
        <LegalHero {...hero} />
        <div className='self-start'>
          <DocToolbar pdfTitle={pdfTitle} />
        </div>
      </div>
      <div className='grid gap-12 lg:grid-cols-[220px_1fr] xl:grid-cols-[240px_1fr]'>
        <aside
          data-doc-sidebar
          className='hidden lg:block lg:sticky lg:top-24 lg:self-start'
        >
          <LegalSidebar toc={doc.toc} />
          {aside}
        </aside>
        <LegalMarkdownReader html={doc.html} />
      </div>
    </div>
  );
}
