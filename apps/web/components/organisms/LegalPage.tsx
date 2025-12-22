import type { LegalHeroProps } from '@/components/molecules/LegalHero';
import { LegalSupportBlock } from '@/components/molecules/LegalSupportBlock';
import { DocPage } from '@/components/organisms/DocPage';
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
    <DocPage
      doc={doc}
      hero={hero}
      pdfTitle={doc.title}
      aside={
        <LegalSupportBlock
          description={supportDescription}
          email={contactEmail}
        />
      }
    />
  );
}
