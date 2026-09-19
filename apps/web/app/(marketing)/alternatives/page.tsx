import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingContainer, MarketingHero } from '@/components/marketing';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { getAlternative, getAlternativeSlugs } from '@/content/alternatives';
import { buildBreadcrumbSchema } from '@/lib/constants/schemas';

export const revalidate = false;

export const metadata: Metadata = {
  title: `Alternatives — ${APP_NAME}`,
  description:
    'Find a musician-first alternative to generic link-in-bio tools, with smart links and release workflows instead of a list of links.',
  alternates: {
    canonical: `${BASE_URL}${APP_ROUTES.ALTERNATIVES}`,
  },
  openGraph: {
    title: `Alternatives — ${APP_NAME}`,
    description:
      'Find a musician-first alternative to generic link-in-bio tools, with smart links and release workflows instead of a list of links.',
    url: `${BASE_URL}${APP_ROUTES.ALTERNATIVES}`,
    type: 'website',
  },
};

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: APP_NAME, url: BASE_URL },
  { name: 'Alternatives', url: `${BASE_URL}${APP_ROUTES.ALTERNATIVES}` },
]);

const ALTERNATIVE_LINKS = getAlternativeSlugs().flatMap(slug => {
  const data = getAlternative(slug);
  if (!data) return [];
  return [
    {
      href: `${APP_ROUTES.ALTERNATIVES}/${slug}`,
      label: data.category,
      description: data.heroSubheadline,
    },
  ];
});

export default function AlternativesIndexPage() {
  return (
    <>
      <script type='application/ld+json'>{BREADCRUMB_SCHEMA}</script>

      <MarketingHero variant='left'>
        <p className='text-sm font-medium text-tertiary-token'>Alternatives</p>
        <h1 className='system-b-marketing-route-title mt-6 max-w-3xl text-primary-token line-clamp-2'>
          Alternatives For Musicians
        </h1>
        <p className='mt-6 max-w-2xl text-lg leading-relaxed text-secondary-token'>
          Jovie is a musician-first alternative to generic link-in-bio tools.
          Start with the comparison that matches the product you already use.
        </p>
      </MarketingHero>

      <MarketingContainer width='prose' className='pb-20 sm:pb-28'>
        <section aria-labelledby='alternatives-heading'>
          <h2
            id='alternatives-heading'
            className='text-2xl font-semibold tracking-tight text-primary-token line-clamp-2'
          >
            Choose A Starting Point
          </h2>
          <ul className='mt-6 grid gap-6 sm:grid-cols-2'>
            {ALTERNATIVE_LINKS.map(alternative => (
              <li key={alternative.href}>
                <Link
                  href={alternative.href}
                  className='text-base font-medium text-primary-token underline decoration-subtle underline-offset-4 transition-colors hover:decoration-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
                >
                  {alternative.label}
                </Link>
                <p className='mt-2 text-sm leading-relaxed text-secondary-token'>
                  {alternative.description}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </MarketingContainer>
    </>
  );
}
