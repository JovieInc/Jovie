import type { Metadata } from 'next';
import { ArtistProfileLandingRoute } from '@/app/(marketing)/artist-profile/ArtistProfileLandingRoute';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';

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

export default function ArtistProfilePage() {
  return <ArtistProfileLandingRoute />;
}
