import { LegalSupportBlock } from '@/components/molecules/LegalSupportBlock';
import { DocPage } from '@/components/organisms/DocPage';
import type { LegalDocument } from '@/lib/legal/getLegalDocument';

export interface LegalPageProps {
  readonly doc: LegalDocument;
  readonly contactEmail: string;
  readonly supportDescription: string;
}

export function LegalPage({
  doc,
  contactEmail,
  supportDescription,
}: LegalPageProps) {
  return (
    <DocPage
      doc={doc}
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
