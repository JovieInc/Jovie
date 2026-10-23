import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { UTM_LINKS_COPY } from '@/data/utmLinksCopy';
import { buildSoftwareSchema } from '@/lib/constants/schemas';
import { UtmLinksLanding } from './UtmLinksLanding';

export const revalidate = false;

const PAGE_URL = `${BASE_URL}${APP_ROUTES.PRODUCT_UTM_LINKS}`;
const PAGE_TITLE = `${UTM_LINKS_COPY.seo.title} | ${APP_NAME}`;

export const metadata: Metadata = {
  title: UTM_LINKS_COPY.seo.title,
  description: UTM_LINKS_COPY.seo.description,
  metadataBase: new URL(BASE_URL),
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'website',
    url: PAGE_URL,
    title: PAGE_TITLE,
    description: UTM_LINKS_COPY.seo.description,
    siteName: APP_NAME,
    images: [{ url: `${BASE_URL}/og/default.png`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: UTM_LINKS_COPY.seo.description,
    images: [`${BASE_URL}/og/default.png`],
  },
};

const UTM_LINKS_SCHEMA = buildSoftwareSchema(UTM_LINKS_COPY.seo.description);

export default function UtmLinksPage() {
  return (
    <>
      <script type='application/ld+json'>{UTM_LINKS_SCHEMA}</script>
      <UtmLinksLanding />
    </>
  );
}
