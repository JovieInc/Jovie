import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { FinalCTASection } from '@/features/home/FinalCTASection';
import { HeroCinematic } from '@/features/home/HeroCinematic';

export const revalidate = false;

export const metadata: Metadata = {
  title: `Artist Profiles | ${APP_NAME}`,
  description:
    'Claim your free artist profile on Jovie. Smart links, fan engagement, and release automation — all in one link-in-bio built for musicians.',
  keywords: [
    'artist profile',
    'link in bio for musicians',
    'smart links',
    'music artist page',
    'linktree alternative for artists',
    'music link in bio',
    'creator profile',
    'artist bio',
  ],
  alternates: {
    canonical: `${BASE_URL}/artist-profiles`,
  },
  openGraph: {
    title: `Artist Profiles | ${APP_NAME}`,
    description:
      'Claim your free artist profile on Jovie. Smart links, fan engagement, and release automation — all in one link-in-bio built for musicians.',
    url: `${BASE_URL}/artist-profiles`,
    siteName: APP_NAME,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Artist Profiles | ${APP_NAME}`,
    description:
      'Claim your free artist profile on Jovie. Smart links, fan engagement, and release automation — all in one link-in-bio built for musicians.',
    creator: '@meetjovie',
    site: '@meetjovie',
  },
};

export default function ArtistProfilesPage() {
  return (
    <div className='relative min-h-screen'>
      <HeroCinematic />
      <FinalCTASection />
    </div>
  );
}
