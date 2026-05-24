import type { Metadata } from 'next';
import { LegalPage } from '@/components/organisms/LegalPage';
import { BASE_URL } from '@/constants/app';
import { getLegalDocument } from '@/lib/legal/getLegalDocument';

// Full SSG - markdown content is read at build time, no runtime regeneration needed
export const dynamic = 'force-static';
export const revalidate = false;

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'Learn how we use cookies and how to manage your preferences.',
  alternates: {
    canonical: `${BASE_URL}/legal/cookies`,
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
      contactEmail='privacy@jov.ie'
      supportDescription='Questions about cookies or tracking?'
    />
  );
}
