import type { Metadata } from 'next';
import { MarketingPageShell } from '@/components/marketing';
import { ArtistProfileLandingPage } from '@/components/marketing/artist-profile';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import {
  ARTIST_PROFILE_LAUNCH_FEATURES,
  ARTIST_PROFILE_SPEC_TILES,
} from '@/data/artistProfileFeatures';
import { ARTIST_PROFILE_SOCIAL_PROOF } from '@/data/socialProof';
import { ARTIST_PROFILE_FLAGS } from '@/lib/featureFlags';

export const revalidate = false;

const ARTIST_PROFILE_URL = `${BASE_URL}/artist-profile`;
const ARTIST_PROFILES_URL = `${BASE_URL}${APP_ROUTES.ARTIST_PROFILES}`;
const ARTIST_PROFILE_OG_TITLE = `Artist Profiles | ${APP_NAME}`;
const ARTIST_PROFILE_OG_IMAGE = `${BASE_URL}/og/default.png`;

export const metadata: Metadata = {
  title: ARTIST_PROFILE_COPY.seo.title,
  description: ARTIST_PROFILE_COPY.seo.description,
  keywords: [...ARTIST_PROFILE_COPY.seo.keywords],
  alternates: {
    canonical: ARTIST_PROFILES_URL,
  },
  openGraph: {
    title: ARTIST_PROFILE_OG_TITLE,
    description: ARTIST_PROFILE_COPY.seo.description,
    url: ARTIST_PROFILE_URL,
    siteName: APP_NAME,
    type: 'website',
    images: [
      {
        url: ARTIST_PROFILE_OG_IMAGE,
        secureUrl: ARTIST_PROFILE_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: ARTIST_PROFILE_COPY.seo.title,
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: ARTIST_PROFILE_OG_TITLE,
    description: ARTIST_PROFILE_COPY.seo.description,
    images: [ARTIST_PROFILE_OG_IMAGE],
    creator: '@meetjovie',
    site: '@meetjovie',
  },
  robots: {
    index: false,
    follow: false,
  },
};

export function ArtistProfileLandingRoute() {
  return (
    <MarketingPageShell>
      <ArtistProfileLandingPage
        copy={ARTIST_PROFILE_COPY}
        launchFeatures={ARTIST_PROFILE_LAUNCH_FEATURES}
        specTiles={ARTIST_PROFILE_SPEC_TILES}
        socialProof={ARTIST_PROFILE_SOCIAL_PROOF}
        flags={ARTIST_PROFILE_FLAGS}
      />
    </MarketingPageShell>
  );
}

export default function ArtistProfilePage() {
  return <ArtistProfileLandingRoute />;
}
