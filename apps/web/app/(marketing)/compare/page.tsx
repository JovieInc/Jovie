import type { Metadata } from 'next';
import { MarketingCatalogPage } from '@/components/marketing/MarketingCatalogPage';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { getComparisons } from '@/content/comparisons';
import { buildBreadcrumbSchema } from '@/lib/constants/schemas';

export const revalidate = false;

const TITLE = `Compare ${APP_NAME}`;
const DESCRIPTION =
  'See how Jovie compares with the tools musicians already use for links, releases, and fan capture.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: `${BASE_URL}${APP_ROUTES.COMPARE}`,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${BASE_URL}${APP_ROUTES.COMPARE}`,
    type: 'website',
  },
};

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: APP_NAME, url: BASE_URL },
  { name: 'Compare', url: `${BASE_URL}${APP_ROUTES.COMPARE}` },
]);

export default function CompareIndexPage() {
  const items = getComparisons().map(comparison => ({
    href: `${APP_ROUTES.COMPARE}/${comparison.slug}`,
    title: comparison.title,
    description: comparison.heroSubheadline,
  }));

  return (
    <>
      <script type='application/ld+json'>{BREADCRUMB_SCHEMA}</script>
      <MarketingCatalogPage
        eyebrow='Compare'
        title={`Jovie vs the tools you already know`}
        description={DESCRIPTION}
        listHeading='Comparisons'
        items={items}
      />
    </>
  );
}
