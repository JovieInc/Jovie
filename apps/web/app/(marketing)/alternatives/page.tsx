import type { Metadata } from 'next';
import { MarketingCatalogPage } from '@/components/marketing/MarketingCatalogPage';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { getAlternatives } from '@/content/alternatives';
import { buildBreadcrumbSchema } from '@/lib/constants/schemas';

export const revalidate = false;

const TITLE = `${APP_NAME} alternatives`;
const DESCRIPTION =
  'Browse Jovie alternatives to link-in-bio tools. Start from the category that matches how you already share music.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: `${BASE_URL}${APP_ROUTES.ALTERNATIVES}`,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${BASE_URL}${APP_ROUTES.ALTERNATIVES}`,
    type: 'website',
  },
};

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: APP_NAME, url: BASE_URL },
  { name: 'Alternatives', url: `${BASE_URL}${APP_ROUTES.ALTERNATIVES}` },
]);

export default function AlternativesIndexPage() {
  const items = getAlternatives().map(alternative => ({
    href: `${APP_ROUTES.ALTERNATIVES}/${alternative.slug}`,
    title: alternative.title,
    description: alternative.heroSubheadline,
  }));

  return (
    <>
      <script type='application/ld+json'>{BREADCRUMB_SCHEMA}</script>
      <MarketingCatalogPage
        eyebrow='Alternatives'
        title='Jovie alternatives for musicians'
        description={DESCRIPTION}
        listHeading='Alternative guides'
        items={items}
      />
    </>
  );
}
