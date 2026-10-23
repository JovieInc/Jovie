import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { ISRC_COPY } from '@/data/isrcCopy';
import { buildSoftwareSchema } from '@/lib/constants/schemas';
import { IsrcLanding } from './IsrcLanding';

export const revalidate = false;

const PAGE_URL = `${BASE_URL}${APP_ROUTES.PRODUCT_ISRC}`;
const PAGE_TITLE = `${ISRC_COPY.seo.title} | ${APP_NAME}`;

export const metadata: Metadata = {
  title: ISRC_COPY.seo.title,
  description: ISRC_COPY.seo.description,
  metadataBase: new URL(BASE_URL),
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'website',
    url: PAGE_URL,
    title: PAGE_TITLE,
    description: ISRC_COPY.seo.description,
    siteName: APP_NAME,
    images: [{ url: `${BASE_URL}/og/default.png`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: ISRC_COPY.seo.description,
    images: [`${BASE_URL}/og/default.png`],
  },
};

const ISRC_SCHEMA = buildSoftwareSchema(ISRC_COPY.seo.description);

export default function IsrcPage() {
  return (
    <>
      <script type='application/ld+json'>{ISRC_SCHEMA}</script>
      <IsrcLanding />
    </>
  );
}
