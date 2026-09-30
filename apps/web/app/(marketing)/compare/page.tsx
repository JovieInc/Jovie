import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingContainer, MarketingHero } from '@/components/marketing';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { getComparison, getComparisonSlugs } from '@/content/comparisons';
import { buildBreadcrumbSchema } from '@/lib/constants/schemas';

export const revalidate = false;

export const metadata: Metadata = {
  title: `Compare — ${APP_NAME}`,
  description:
    'See how Jovie compares with the tools musicians already use to share music.',
  alternates: {
    canonical: `${BASE_URL}${APP_ROUTES.COMPARE}`,
  },
  openGraph: {
    title: `Compare — ${APP_NAME}`,
    description:
      'See how Jovie compares with the tools musicians already use to share music.',
    url: `${BASE_URL}${APP_ROUTES.COMPARE}`,
    type: 'website',
  },
};

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: APP_NAME, url: BASE_URL },
  { name: 'Compare', url: `${BASE_URL}${APP_ROUTES.COMPARE}` },
]);

const COMPARISON_LINKS = getComparisonSlugs().flatMap(slug => {
  const data = getComparison(slug);
  if (!data) return [];
  return [
    {
      href: `${APP_ROUTES.COMPARE}/${slug}`,
      label: data.competitor,
      description: data.heroSubheadline,
    },
  ];
});

export default function CompareIndexPage() {
  return (
    <>
      <script type='application/ld+json'>{BREADCRUMB_SCHEMA}</script>

      <MarketingHero variant='left'>
        <p className='text-sm font-medium text-tertiary-token'>Compare</p>
        <h1 className='system-b-marketing-route-title mt-6 max-w-3xl text-primary-token line-clamp-2'>
          Compare Jovie
        </h1>
        <p className='mt-6 max-w-2xl text-lg leading-relaxed text-secondary-token'>
          Side-by-side comparisons of Jovie and the tools musicians already
          know. Pick a product to see how features, fit, and pricing differ.
        </p>
      </MarketingHero>

      <MarketingContainer width='prose' className='pb-20 sm:pb-28'>
        <section aria-labelledby='comparisons-heading'>
          <h2
            id='comparisons-heading'
            className='text-2xl font-semibold tracking-tight text-primary-token line-clamp-2'
          >
            Comparisons
          </h2>
          <ul className='mt-6 grid gap-6 sm:grid-cols-2'>
            {COMPARISON_LINKS.map(comparison => (
              <li key={comparison.href}>
                <Link
                  href={comparison.href}
                  className='text-base font-medium text-primary-token underline decoration-subtle underline-offset-4 transition-colors hover:decoration-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
                >
                  {comparison.label}
                </Link>
                <p className='mt-2 text-sm leading-relaxed text-secondary-token'>
                  {comparison.description}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </MarketingContainer>
    </>
  );
}
