import type { Metadata } from 'next';
import { SupportPageContent } from '@/components/organisms/SupportPageContent';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { SUPPORT_FAQ_ITEMS, SUPPORT_SEO_COPY } from '@/data/supportCopy';
import { buildBreadcrumbSchema, buildFaqSchema } from '@/lib/constants/schemas';

export const metadata: Metadata = {
  title: 'Support',
  description: SUPPORT_SEO_COPY.description,
  keywords: [...SUPPORT_SEO_COPY.keywords],
  alternates: {
    canonical: `${BASE_URL}/support`,
  },
  openGraph: {
    title: `Support - ${APP_NAME}`,
    description: SUPPORT_SEO_COPY.description,
    url: `${BASE_URL}/support`,
    type: 'website',
  },
};

export const revalidate = false;

const FAQ_SCHEMA = buildFaqSchema([...SUPPORT_FAQ_ITEMS]);
const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: APP_NAME, url: BASE_URL },
  { name: 'Support', url: `${BASE_URL}/support` },
]);

export default function SupportPage() {
  return (
    <>
      <script type='application/ld+json'>{FAQ_SCHEMA}</script>
      <script type='application/ld+json'>{BREADCRUMB_SCHEMA}</script>
      <SupportPageContent />
    </>
  );
}
