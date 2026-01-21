import type { Metadata } from 'next';
import { LegalPage } from '@/components/organisms/LegalPage';
import { APP_NAME, APP_URL } from '@/constants/app';
import { getLegalDocument } from '@/lib/legal/getLegalDocument';

// Static generation with hourly revalidation - legal content rarely changes
export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Privacy Policy | ${APP_NAME}`,
  description:
    'We collect only what is essential, guard it with modern controls, and keep you in the loop about every change.',
  alternates: {
    canonical: `${APP_URL}/legal/privacy`,
  },
  robots: {
    index: true,
    follow: true,
  },
};

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
      contactEmail='privacy@meetjovie.com'
      supportDescription='Questions about your data, exports, or opt-outs?'
    />
  );
}
