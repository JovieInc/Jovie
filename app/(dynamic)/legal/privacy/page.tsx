import { LegalPage } from '@/components/organisms/LegalPage';
import { getLegalDocument } from '@/lib/legal/getLegalDocument';

export default async function PrivacyPage() {
  const doc = await getLegalDocument('privacy');

  return (
    <LegalPage
      doc={doc}
      hero={{
        eyebrow: 'Privacy policy',
        title: 'Privacy built for artists on the move',
        description:
          'We collect only what is essential, guard it with modern controls, and keep you in the loop about every change.',
        highlight: 'Data handled with care',
      }}
      contactEmail='privacy@jov.ie'
      supportDescription='Questions about your data, exports, or opt-outs?'
    />
  );
}
