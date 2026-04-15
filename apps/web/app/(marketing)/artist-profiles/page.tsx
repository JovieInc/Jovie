import type { Metadata } from 'next';
import { MarketingPageShell } from '@/components/marketing';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { HomeHero } from '@/features/home/HomeAdaptiveProfileStory';
import { FinalCallToAction } from '@/features/home/HomePageNarrative';
import { HOMEPAGE_FINAL_CTA_CONTENT } from '@/features/home/home-page-content';
import { StickyPhoneTour } from '@/features/home/StickyPhoneTour';
import { FEATURE_FLAGS } from '@/lib/feature-flags/shared';
import { ARTIST_PROFILE_MODES } from './artist-profile-modes';

export const revalidate = false;

const ARTIST_PROFILES_TITLE = 'Artist Profiles';
const ARTIST_PROFILES_OG_TITLE = `Artist Profiles | ${APP_NAME}`;
const ARTIST_PROFILES_DESCRIPTION =
  'Claim your free artist profile on Jovie. One link that adapts to every release, tour, and campaign — built for independent artists.';
const ARTIST_PROFILES_URL = `${BASE_URL}${APP_ROUTES.ARTIST_PROFILES}`;
const ARTIST_PROFILES_OG_IMAGE = `${BASE_URL}/og/default.png`;

export const metadata: Metadata = {
  title: ARTIST_PROFILES_TITLE,
  description: ARTIST_PROFILES_DESCRIPTION,
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
    canonical: ARTIST_PROFILES_URL,
  },
  openGraph: {
    title: ARTIST_PROFILES_OG_TITLE,
    description: ARTIST_PROFILES_DESCRIPTION,
    url: ARTIST_PROFILES_URL,
    siteName: APP_NAME,
    type: 'website',
    images: [
      {
        url: ARTIST_PROFILES_OG_IMAGE,
        secureUrl: ARTIST_PROFILES_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: ARTIST_PROFILES_TITLE,
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: ARTIST_PROFILES_OG_TITLE,
    description: ARTIST_PROFILES_DESCRIPTION,
    images: [ARTIST_PROFILES_OG_IMAGE],
    creator: '@meetjovie',
    site: '@meetjovie',
  },
};

export default function ArtistProfilesPage() {
  return (
    <MarketingPageShell>
      <HomeHero />

      {FEATURE_FLAGS.SHOW_HOMEPAGE_SECTIONS && (
        <StickyPhoneTour
          modes={ARTIST_PROFILE_MODES}
          introTitle='Your profile adapts to what matters right now.'
          introBadge='One link. Four modes.'
          artistHandle='timwhite'
        />
      )}

      <FinalCallToAction content={HOMEPAGE_FINAL_CTA_CONTENT} />
    </MarketingPageShell>
  );
}
