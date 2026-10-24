import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { LINK_ANALYTICS_COPY } from '@/data/linkAnalyticsCopy';
import { buildSoftwareSchema } from '@/lib/constants/schemas';
import { LinkAnalyticsLanding } from './LinkAnalyticsLanding';

const PAGE_URL = `${BASE_URL}${APP_ROUTES.PRODUCT_LINK_ANALYTICS}`;
const PAGE_TITLE = `${LINK_ANALYTICS_COPY.seo.title} | ${APP_NAME}`;

export const metadata: Metadata = {
  title: LINK_ANALYTICS_COPY.seo.title,
  description: LINK_ANALYTICS_COPY.seo.description,
  metadataBase: new URL(BASE_URL),
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'website',
    url: PAGE_URL,
    title: PAGE_TITLE,
    description: LINK_ANALYTICS_COPY.seo.description,
    siteName: APP_NAME,
    images: [{ url: `${BASE_URL}/og/default.png`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: LINK_ANALYTICS_COPY.seo.description,
    images: [`${BASE_URL}/og/default.png`],
  },
};

const LINK_ANALYTICS_SCHEMA = buildSoftwareSchema(
  LINK_ANALYTICS_COPY.seo.description
);

export default function LinkAnalyticsPage() {
  return (
    <>
      <script type='application/ld+json'>{LINK_ANALYTICS_SCHEMA}</script>
      <LinkAnalyticsLanding />
    </>
  );
}
