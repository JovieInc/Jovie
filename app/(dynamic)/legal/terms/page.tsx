import { LegalPage } from '@/components/organisms/LegalPage';
import { getLegalDocument } from '@/lib/legal/getLegalDocument';

export default async function TermsPage() {
  const doc = await getLegalDocument('terms');

  return (
    <LegalPage
      doc={doc}
      hero={{
        eyebrow: 'Terms of service',
        title: 'Terms that respect your creativity and control',
        description:
          'Jovie is a creative workspace governed by clear, fair policies so you can focus on sharing your music.',
        highlight: 'Creators first',
      }}
      contactEmail='legal@jov.ie'
      supportDescription='Need clarity on usage, bans, or upcoming billing updates?'
    />
  );
}
