import type { Metadata } from 'next';
import { LegalPage } from '@/components/organisms/LegalPage';
import { APP_NAME, APP_URL } from '@/constants/app';
import { getLegalDocument } from '@/lib/legal/getLegalDocument';

// Full SSG - markdown content is read at build time, no runtime regeneration needed
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: `Cookie Policy | ${APP_NAME}`,
  description: 'Learn how we use cookies and how to manage your preferences.',
  alternates: {
    canonical: `${APP_URL}/legal/cookies`,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function CookiesPage() {
  const doc = await getLegalDocument('cookies');

  return (
    <LegalPage
      doc={doc}
      hero={{
        eyebrow: 'Cookie policy',
        title: 'Your choices, your cookies',
        description:
          'We use cookies to improve your experience. Here is exactly what we collect and why.',
        highlight: 'Full transparency',
      }}
      contactEmail='privacy@meetjovie.com'
      supportDescription='Questions about cookies or tracking?'
    />
  );
}
