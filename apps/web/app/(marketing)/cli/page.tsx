import type { Metadata } from 'next';
import {
  CLI_FAQ_ITEMS,
  CLI_SUBTITLE,
  CliLandingPage,
} from '@/components/marketing/CliLandingPage';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { marketingOgImage } from '@/data/marketingOgCopy';
import { buildBreadcrumbSchema, buildFaqSchema } from '@/lib/constants/schemas';

export const revalidate = false;

export const metadata: Metadata = {
  title: `CLI — ${APP_NAME}`,
  description: CLI_SUBTITLE,
  alternates: {
    canonical: `${BASE_URL}${APP_ROUTES.CLI}`,
  },
  openGraph: {
    title: `CLI — ${APP_NAME}`,
    description: CLI_SUBTITLE,
    url: `${BASE_URL}${APP_ROUTES.CLI}`,
    type: 'website',
    images: [marketingOgImage('cli')],
  },
  twitter: {
    card: 'summary_large_image',
    images: [marketingOgImage('cli').url],
  },
};

const FAQ_SCHEMA = buildFaqSchema([...CLI_FAQ_ITEMS]);
const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: APP_NAME, url: BASE_URL },
  { name: 'CLI', url: `${BASE_URL}${APP_ROUTES.CLI}` },
]);

export default function CliPage() {
  return (
    <>
      <script type='application/ld+json'>{FAQ_SCHEMA}</script>
      <script type='application/ld+json'>{BREADCRUMB_SCHEMA}</script>
      <CliLandingPage />
    </>
  );
}
