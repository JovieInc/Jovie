import { LegalHero, LegalHeroProps } from '@/components/molecules/LegalHero';
import { LegalMarkdownReader } from '@/components/molecules/LegalMarkdownReader';
import { LegalSidebar } from '@/components/molecules/LegalSidebar';
import { LegalSupportBlock } from '@/components/molecules/LegalSupportBlock';
import { LegalDocument } from '@/lib/legal/getLegalDocument';

export interface LegalPageProps {
  doc: LegalDocument;
  hero: LegalHeroProps;
  contactEmail: string;
  supportDescription: string;
}

export function LegalPage({
  doc,
  hero,
  contactEmail,
  supportDescription,
}: LegalPageProps) {
  return (
    <div className='space-y-12'>
      <LegalHero {...hero} />
      <div className='grid gap-12 lg:grid-cols-[220px_1fr] xl:grid-cols-[240px_1fr]'>
        <aside className='hidden lg:block lg:sticky lg:top-24 lg:self-start'>
          <LegalSidebar toc={doc.toc} />
          <LegalSupportBlock
            description={supportDescription}
            email={contactEmail}
          />
        </aside>
        <LegalMarkdownReader html={doc.html} />
      </div>
    </div>
  );
}
