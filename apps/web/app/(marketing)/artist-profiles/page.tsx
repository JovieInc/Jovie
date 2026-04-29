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

const ARTIST_PROFILES_TITLE = ARTIST_PROFILE_COPY.seo.title;
const ARTIST_PROFILES_OG_TITLE = `Artist Profiles | ${APP_NAME}`;
const ARTIST_PROFILES_DESCRIPTION = ARTIST_PROFILE_COPY.seo.description;
const ARTIST_PROFILES_URL = `${BASE_URL}${APP_ROUTES.ARTIST_PROFILES}`;
const ARTIST_PROFILES_OG_IMAGE = `${BASE_URL}/og/default.png`;

export const metadata: Metadata = {
  title: ARTIST_PROFILES_TITLE,
  description: ARTIST_PROFILES_DESCRIPTION,
  keywords: [...ARTIST_PROFILE_COPY.seo.keywords],
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
      <ArtistProfileLandingPage
        copy={ARTIST_PROFILE_COPY}
        launchFeatures={ARTIST_PROFILE_LAUNCH_FEATURES}
        specTiles={ARTIST_PROFILE_SPEC_TILES}
        socialProof={ARTIST_PROFILE_SOCIAL_PROOF}
        flags={ARTIST_PROFILE_FLAGS}
        payFlowVideoUrl={process.env.ARTIST_PROFILES_PAY_FLOW_VIDEO_URL}
      />
    </MarketingPageShell>
  );
}
