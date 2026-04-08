import type { Metadata } from 'next';
import { LegalPage } from '@/components/organisms/LegalPage';
import { BASE_URL } from '@/constants/app';
import { getLegalDocument } from '@/lib/legal/getLegalDocument';

// Full SSG - markdown content is read at build time, no runtime regeneration needed
export const dynamic = 'force-static';
export const revalidate = false;

export const metadata: Metadata = {
  title: 'DMCA Policy',
  description:
    'How to report copyright infringement on Jovie. Designated agent, takedown procedure, and counter-notice process.',
  alternates: {
    canonical: `${BASE_URL}/legal/dmca`,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function DMCAPage() {
  const doc = await getLegalDocument('dmca');

  return (
    <LegalPage
      doc={doc}
      hero={{
        eyebrow: 'DMCA policy',
        title: 'Copyright protection for creators',
        description:
          'How to report copyright infringement on Jovie. Our takedown and counter-notice process.',
        highlight: 'We respect your rights',
      }}
      contactEmail='legal@jov.ie'
      supportDescription='Need to report copyright infringement?'
    />
  );
}
