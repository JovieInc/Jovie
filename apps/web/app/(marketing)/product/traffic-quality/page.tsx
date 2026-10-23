import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { TRAFFIC_QUALITY_COPY } from '@/data/trafficQualityCopy';
import { buildSoftwareSchema } from '@/lib/constants/schemas';
import { TrafficQualityLanding } from './TrafficQualityLanding';

const PAGE_URL = `${BASE_URL}${APP_ROUTES.PRODUCT_TRAFFIC_QUALITY}`;
const PAGE_TITLE = `${TRAFFIC_QUALITY_COPY.seo.title} | ${APP_NAME}`;

export const metadata: Metadata = {
  title: TRAFFIC_QUALITY_COPY.seo.title,
  description: TRAFFIC_QUALITY_COPY.seo.description,
  metadataBase: new URL(BASE_URL),
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'website',
    url: PAGE_URL,
    title: PAGE_TITLE,
    description: TRAFFIC_QUALITY_COPY.seo.description,
    siteName: APP_NAME,
    images: [{ url: `${BASE_URL}/og/default.png`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: TRAFFIC_QUALITY_COPY.seo.description,
    images: [`${BASE_URL}/og/default.png`],
  },
};

const TRAFFIC_QUALITY_SCHEMA = buildSoftwareSchema(
  TRAFFIC_QUALITY_COPY.seo.description
);

export default function TrafficQualityPage() {
  return (
    <>
      <script type='application/ld+json'>{TRAFFIC_QUALITY_SCHEMA}</script>
      <TrafficQualityLanding />
    </>
  );
}
