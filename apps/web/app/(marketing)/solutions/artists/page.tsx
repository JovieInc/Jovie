import type { Metadata } from 'next';
import { ArtistProfileLandingRoute } from '@/components/marketing/artist-profile/ArtistProfileLandingRoute';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { buildSoftwareSchema } from '@/lib/constants/schemas';

export const revalidate = false;

const PAGE_TITLE = ARTIST_PROFILE_COPY.seo.title;
const PAGE_OG_TITLE = `For Artists | ${APP_NAME}`;
const PAGE_DESCRIPTION = ARTIST_PROFILE_COPY.seo.description;
const PAGE_URL = `${BASE_URL}${APP_ROUTES.SOLUTIONS_ARTISTS}`;
const OG_IMAGE = `${BASE_URL}/og/default.png`;

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  keywords: [...ARTIST_PROFILE_COPY.seo.keywords],
  alternates: {
    canonical: PAGE_URL,
  },
  openGraph: {
    title: PAGE_OG_TITLE,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    siteName: APP_NAME,
    type: 'website',
    images: [
      {
        url: OG_IMAGE,
        secureUrl: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: PAGE_TITLE,
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_OG_TITLE,
    description: PAGE_DESCRIPTION,
    images: [OG_IMAGE],
    creator: '@meetjovie',
    site: '@meetjovie',
  },
};

const SOFTWARE_SCHEMA = buildSoftwareSchema(PAGE_DESCRIPTION);

export default function SolutionsArtistsPage() {
  return (
    <>
      <script type='application/ld+json'>{SOFTWARE_SCHEMA}</script>
      <ArtistProfileLandingRoute />
    </>
  );
}
