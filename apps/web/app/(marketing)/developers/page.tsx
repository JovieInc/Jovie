import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingContainer, MarketingHero } from '@/components/marketing';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { DOCS_URL } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { buildBreadcrumbSchema } from '@/lib/constants/schemas';

export const revalidate = false;

export const metadata: Metadata = {
  title: `Developers — ${APP_NAME}`,
  description:
    'Use Jovie’s public, anonymous, read-only artist API and machine-readable site resources.',
  alternates: {
    canonical: `${BASE_URL}${APP_ROUTES.DEVELOPERS}`,
  },
  openGraph: {
    title: `Developers — ${APP_NAME}`,
    description:
      'Use Jovie’s public, anonymous, read-only artist API and machine-readable site resources.',
    url: `${BASE_URL}${APP_ROUTES.DEVELOPERS}`,
    type: 'website',
  },
};

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: APP_NAME, url: BASE_URL },
  { name: 'Developers', url: `${BASE_URL}${APP_ROUTES.DEVELOPERS}` },
]);

const RESOURCE_LINKS = [
  {
    href: '/api/v1',
    label: 'Public API capability index',
    description:
      'A stable, non-enumerating 200 response describing the anonymous read-only API.',
  },
  {
    href: '/openapi.json',
    label: 'OpenAPI 3.1 contract',
    description: 'The machine-readable contract for the public artist API.',
  },
  {
    href: '/llms.txt',
    label: 'llms.txt',
    description: 'A concise guide to Jovie’s public site and agent surfaces.',
  },
  {
    href: '/llms-full.txt',
    label: 'llms-full.txt',
    description: 'The expanded version of the site guide.',
  },
  {
    href: DOCS_URL,
    label: 'Jovie docs',
    description: 'Product help and getting-started guidance.',
  },
] as const;

export default function DevelopersPage() {
  return (
    <>
      <script type='application/ld+json'>{BREADCRUMB_SCHEMA}</script>

      <MarketingHero variant='left'>
        <p className='text-sm font-medium text-tertiary-token'>Developers</p>
        <h1 className='mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-balance text-primary-token sm:text-5xl lg:text-6xl line-clamp-2'>
          Public artist data, in the open.
        </h1>
        <p className='mt-6 max-w-2xl text-lg leading-relaxed text-secondary-token'>
          Read public artist profiles, releases, events, and merch with
          Jovie&apos;s anonymous, read-only API. Start with the contract, then
          follow the links returned for each artist.
        </p>
        <div className='mt-8 flex flex-wrap gap-3'>
          <Link
            href='/openapi.json'
            className='rounded-full bg-btn-primary px-5 py-3 text-sm font-medium text-btn-primary-foreground transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
          >
            Read the OpenAPI contract
          </Link>
          <Link
            href='/llms.txt'
            className='rounded-full border border-subtle px-5 py-3 text-sm font-medium text-primary-token transition-colors hover:border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
          >
            Read llms.txt
          </Link>
        </div>
      </MarketingHero>

      <MarketingContainer width='prose' className='pb-20 sm:pb-28'>
        <div className='space-y-16'>
          <section aria-labelledby='quickstart-heading'>
            <h2
              id='quickstart-heading'
              className='text-2xl font-semibold tracking-tight text-primary-token line-clamp-2'
            >
              Quickstart
            </h2>
            <p className='mt-4 text-base leading-relaxed text-secondary-token'>
              Fetch one public artist&apos;s structured profile with a normal
              HTTP GET request. Replace <code>{'{username}'}</code> with the
              artist&apos;s public Jovie handle.
            </p>
            <pre className='mt-6 overflow-x-auto rounded-xl border border-subtle bg-surface-0 p-5 text-sm leading-relaxed text-secondary-token'>
              <code>{`curl ${BASE_URL}/api/v1/{username}`}</code>
            </pre>
            <p className='mt-4 text-base leading-relaxed text-secondary-token'>
              The response includes the artist identity plus public releases,
              upcoming events, merch, and related resource links. Unknown or
              non-public artists return a JSON 404 response.
            </p>
          </section>

          <section aria-labelledby='resources-heading'>
            <h2
              id='resources-heading'
              className='text-2xl font-semibold tracking-tight text-primary-token line-clamp-2'
            >
              Machine-readable resources
            </h2>
            <ul className='mt-6 grid gap-6 sm:grid-cols-2'>
              {RESOURCE_LINKS.map(resource => (
                <li key={resource.href}>
                  <Link
                    href={resource.href}
                    className='text-base font-medium text-primary-token underline decoration-subtle underline-offset-4 transition-colors hover:decoration-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
                  >
                    {resource.label}
                  </Link>
                  <p className='mt-2 text-sm leading-relaxed text-secondary-token'>
                    {resource.description}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby='scope-heading'>
            <h2
              id='scope-heading'
              className='text-2xl font-semibold tracking-tight text-primary-token line-clamp-2'
            >
              Public by design
            </h2>
            <p className='mt-4 text-base leading-relaxed text-secondary-token'>
              This page documents Jovie&apos;s public artist surface: anonymous
              GET access to data an artist has made public. It does not add a
              write API, credentials, or a separate developer account. Keep
              private or sensitive information out of requests and use the
              OpenAPI contract as the source of truth.
            </p>
            <p className='mt-4 text-base leading-relaxed text-secondary-token'>
              Profile requests are limited to 100 per client IP in a fixed
              60-second window. Read the{' '}
              <Link
                href={`${DOCS_URL}/docs/api-reference`}
                className='text-primary-token underline decoration-subtle underline-offset-4 transition-colors hover:decoration-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
              >
                API reference
              </Link>{' '}
              for the current RateLimit and Retry-After response contract.
            </p>
            <p className='mt-4 text-base leading-relaxed text-secondary-token'>
              Version v1 is active. A policy Link relation points to lifecycle
              guidance; active v1 responses do not claim Deprecation or Sunset.
            </p>
            <p className='mt-4 text-base leading-relaxed text-secondary-token'>
              For a human-oriented overview, visit{' '}
              <Link
                href={APP_ROUTES.SUPPORT}
                className='text-primary-token underline decoration-subtle underline-offset-4 transition-colors hover:decoration-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
              >
                Support
              </Link>
              .
            </p>
          </section>
        </div>
      </MarketingContainer>
    </>
  );
}
