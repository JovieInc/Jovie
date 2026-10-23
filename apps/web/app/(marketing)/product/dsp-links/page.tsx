import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { DSP_LINKS_COPY } from '@/data/dspLinksCopy';
import { buildSoftwareSchema } from '@/lib/constants/schemas';
import { DspLinksLanding } from './DspLinksLanding';

const PAGE_URL = `${BASE_URL}${APP_ROUTES.PRODUCT_DSP_LINKS}`;
const PAGE_TITLE = `${DSP_LINKS_COPY.seo.title} | ${APP_NAME}`;

export const metadata: Metadata = {
  title: DSP_LINKS_COPY.seo.title,
  description: DSP_LINKS_COPY.seo.description,
  metadataBase: new URL(BASE_URL),
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'website',
    url: PAGE_URL,
    title: PAGE_TITLE,
    description: DSP_LINKS_COPY.seo.description,
    siteName: APP_NAME,
    images: [{ url: `${BASE_URL}/og/default.png`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: DSP_LINKS_COPY.seo.description,
    images: [`${BASE_URL}/og/default.png`],
  },
};

const DSP_LINKS_SCHEMA = buildSoftwareSchema(DSP_LINKS_COPY.seo.description);

export default function DspLinksPage() {
  return (
    <>
      <script type='application/ld+json'>{DSP_LINKS_SCHEMA}</script>
      <DspLinksLanding />
    </>
  );
}
