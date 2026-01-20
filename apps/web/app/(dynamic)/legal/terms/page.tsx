import type { Metadata } from 'next';
import { LegalPage } from '@/components/organisms/LegalPage';
import { APP_NAME, APP_URL } from '@/constants/app';
import { getLegalDocument } from '@/lib/legal/getLegalDocument';

// Static generation with hourly revalidation - legal content rarely changes
export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Terms of Service | ${APP_NAME}`,
  description:
    'Jovie is a creative workspace governed by clear, fair policies so you can focus on sharing your music.',
  alternates: {
    canonical: `${APP_URL}/legal/terms`,
  },
  robots: {
    index: true,
    follow: true,
  },
};

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
      contactEmail='legal@meetjovie.com'
      supportDescription='Need clarity on usage, bans, or upcoming billing updates?'
    />
  );
}
