import type { Metadata } from 'next';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { COMMAND_PALETTE_COPY } from '@/data/commandPaletteCopy';
import { buildSoftwareSchema } from '@/lib/constants/schemas';
import { CommandPaletteLanding } from './CommandPaletteLanding';

export const revalidate = false;

const PAGE_URL = `${BASE_URL}${APP_ROUTES.PRODUCT_COMMAND_PALETTE}`;
const PAGE_TITLE = `${COMMAND_PALETTE_COPY.seo.title} | ${APP_NAME}`;

export const metadata: Metadata = {
  title: COMMAND_PALETTE_COPY.seo.title,
  description: COMMAND_PALETTE_COPY.seo.description,
  metadataBase: new URL(BASE_URL),
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: 'website',
    url: PAGE_URL,
    title: PAGE_TITLE,
    description: COMMAND_PALETTE_COPY.seo.description,
    siteName: APP_NAME,
    images: [{ url: `${BASE_URL}/og/default.png`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: COMMAND_PALETTE_COPY.seo.description,
    images: [`${BASE_URL}/og/default.png`],
  },
};

const COMMAND_PALETTE_SCHEMA = buildSoftwareSchema(
  COMMAND_PALETTE_COPY.seo.description
);

export default function CommandPalettePage() {
  return (
    <>
      <script type='application/ld+json'>{COMMAND_PALETTE_SCHEMA}</script>
      <CommandPaletteLanding />
    </>
  );
}
