import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { RELEASE_SCHEDULING_COPY } from '@/data/releaseSchedulingCopy';
import { buildSoftwareSchema } from '@/lib/constants/schemas';
import { ReleaseSchedulingLanding } from './ReleaseSchedulingLanding';

const PAGE_URL = `${BASE_URL}${APP_ROUTES.PRODUCT_RELEASE_SCHEDULING}`;
const PAGE_TITLE = `${RELEASE_SCHEDULING_COPY.seo.title} | ${APP_NAME}`;

export const metadata: Metadata = {
  title: RELEASE_SCHEDULING_COPY.seo.title,
  description: RELEASE_SCHEDULING_COPY.seo.description,
  metadataBase: new URL(BASE_URL),
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'website',
    url: PAGE_URL,
    title: PAGE_TITLE,
    description: RELEASE_SCHEDULING_COPY.seo.description,
    siteName: APP_NAME,
    images: [{ url: `${BASE_URL}/og/default.png`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: RELEASE_SCHEDULING_COPY.seo.description,
    images: [`${BASE_URL}/og/default.png`],
  },
};

const RELEASE_SCHEDULING_SCHEMA = buildSoftwareSchema(
  RELEASE_SCHEDULING_COPY.seo.description
);

export default function ReleaseSchedulingPage() {
  return (
    <>
      <script type='application/ld+json'>{RELEASE_SCHEDULING_SCHEMA}</script>
      <ReleaseSchedulingLanding />
    </>
  );
}
