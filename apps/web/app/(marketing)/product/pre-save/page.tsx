import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { PRE_SAVE_COPY } from '@/data/preSaveCopy';
import { buildSoftwareSchema } from '@/lib/constants/schemas';
import { PreSaveLanding } from './PreSaveLanding';

const PAGE_URL = `${BASE_URL}${APP_ROUTES.PRODUCT_PRE_SAVE}`;
const PAGE_TITLE = `${PRE_SAVE_COPY.seo.title} | ${APP_NAME}`;

export const metadata: Metadata = {
  title: PRE_SAVE_COPY.seo.title,
  description: PRE_SAVE_COPY.seo.description,
  metadataBase: new URL(BASE_URL),
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'website',
    url: PAGE_URL,
    title: PAGE_TITLE,
    description: PRE_SAVE_COPY.seo.description,
    siteName: APP_NAME,
    images: [{ url: `${BASE_URL}/og/default.png`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PRE_SAVE_COPY.seo.description,
    images: [`${BASE_URL}/og/default.png`],
  },
};

const PRE_SAVE_SCHEMA = buildSoftwareSchema(PRE_SAVE_COPY.seo.description);

export default function PreSavePage() {
  return (
    <>
      <script type='application/ld+json'>{PRE_SAVE_SCHEMA}</script>
      <PreSaveLanding />
    </>
  );
}
