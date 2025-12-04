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
    <section className='space-y-10'>
      <LegalHero {...hero} />
      <div className='grid gap-10 lg:grid-cols-[300px_1fr]'>
        <aside className='space-y-5 lg:sticky lg:top-24 lg:self-start'>
          <LegalSidebar toc={doc.toc} />
          <LegalSupportBlock
            description={supportDescription}
            email={contactEmail}
          />
        </aside>
        <LegalMarkdownReader html={doc.html} />
      </div>
    </section>
  );
}
