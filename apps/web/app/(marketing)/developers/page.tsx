import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import '@/components/marketing/MarketingRouteHero.css';
import { MarketingContainer, MarketingHero } from '@/components/marketing';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { DOCS_URL } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { buildBreadcrumbSchema } from '@/lib/constants/schemas';

export const revalidate = false;

export const metadata: Metadata = {
  title: `Developers - ${APP_NAME}`,
  description:
    'Jovie’s public, anonymous, read-only profile API pairs with machine-readable site resources.',
  alternates: {
    canonical: `${BASE_URL}${APP_ROUTES.DEVELOPERS}`,
  },
  openGraph: {
    title: `Developers - ${APP_NAME}`,
    description:
      'Jovie’s public, anonymous, read-only profile API pairs with machine-readable site resources.',
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
    label: 'Public API Capability Index',
    description:
      'A stable, non-enumerating 200 response describing the anonymous read-only API.',
  },
  {
    href: '/openapi.json',
    // "OpenAPI" is a fixed technical spec name the casing linter can't
    // validate; kept identical to the matching, test-pinned link text on
    // /api-versioning (ui-casing-allow: fixed technical spec name)
    label: 'OpenAPI 3.1 contract',
    description: 'The machine-readable contract for the public profile API.',
  },
  {
    href: '/cli',
    // ui-casing-allow: existing link label; MCP is the product acronym
    label: 'Jovie CLI and MCP server',
    description:
      'Anonymous `jovie` commands for agents: read public profile data and create claimable profiles.',
  },
  {
    href: '/api-versioning',
    label: 'API Versioning And Deprecation Policy',
    description:
      // "Deprecation" and "Sunset" are the literal RFC 9745/8594 HTTP header
      // names (ui-casing-allow: literal HTTP header names)
      'Active v1 lifecycle boundary, additive versus breaking changes, and future Deprecation and Sunset signals.',
  },
  {
    href: '/llms.txt',
    label: 'llms.txt', // ui-casing-allow: literal, case-sensitive filename; also asserted verbatim by page.test.tsx
    description: 'A concise guide to Jovie’s public site and agent surfaces.',
  },
  {
    href: '/llms-full.txt',
    label: 'llms-full.txt', // ui-casing-allow: literal, case-sensitive filename; also asserted verbatim by page.test.tsx
    description: 'The expanded version of the site guide.',
  },
  {
    href: `${DOCS_URL}/docs/developers`,
    label: 'Jovie Docs',
    description: 'Product help and getting-started guidance.',
  },
] as const;

export default function DevelopersPage() {
  return (
    <>
      <script type='application/ld+json'>{BREADCRUMB_SCHEMA}</script>

      <MarketingHero
        variant='unstyled'
        headingId='developers-hero-heading'
        testId='developers-hero'
        className='marketing-hero-dock marketing-hero-dock--inset relative w-full overflow-hidden pt-20 pb-16 sm:pt-24 sm:pb-24 lg:pt-28 lg:pb-32'
      >
        <div className='marketing-route-hero__media' aria-hidden='true'>
          <Image
            src='/images/hero/developers-hero.webp'
            alt=''
            fill
            sizes='100vw'
            priority
          />
        </div>
        <div className='marketing-route-hero__scrim' aria-hidden='true' />
        <div
          className='marketing-route-hero__accent marketing-route-hero__accent--purple'
          aria-hidden='true'
        />
        <MarketingContainer
          width='page'
          className='marketing-route-hero__content'
        >
          <p className='text-sm font-medium text-tertiary-token'>Developers</p>
          <h1
            id='developers-hero-heading'
            className='system-b-marketing-route-title mt-6 max-w-3xl text-primary-token line-clamp-2'
          >
            {/* ui-casing-allow: marketing headline, sentence case per DESIGN.md */}
            Public profile data, in the open.
          </h1>
          <p className='mt-6 max-w-2xl text-lg leading-relaxed text-secondary-token'>
            Read public profiles, releases, events, and merch with Jovie&apos;s
            anonymous, read-only API. Start with the contract, then follow the
            links returned for each profile.
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
        </MarketingContainer>
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
              Fetch one public creator&apos;s structured profile with a normal
              HTTP GET request. Replace <code>{'{username}'}</code> with the
              creator&apos;s public Jovie handle.
            </p>
            <pre className='mt-6 overflow-x-auto rounded-xl border border-subtle bg-surface-0 p-5 text-sm leading-relaxed text-secondary-token'>
              <code>{`curl ${BASE_URL}/api/v1/{username}`}</code>
            </pre>
            <p className='mt-4 text-base leading-relaxed text-secondary-token'>
              The response includes the profile identity plus public releases,
              upcoming events, merch, and related resource links. Unknown or
              non-public profiles return a JSON 404 response.
            </p>
          </section>

          <section aria-labelledby='agent-quickstart-heading'>
            <h2
              id='agent-quickstart-heading'
              className='text-2xl font-semibold tracking-tight text-primary-token line-clamp-2'
            >
              {/* ui-casing-allow: marketing headline, sentence case per DESIGN.md */}
              Agent quickstart
            </h2>
            <p className='mt-4 text-base leading-relaxed text-secondary-token'>
              Start from the same profile endpoint as the quickstart above, then
              follow the resource links in the response. Every surface below is
              anonymous and read-only; owner-only tools require authenticated
              profile ownership and are never part of this quickstart.
            </p>
            <p className='mt-4 text-base leading-relaxed text-secondary-token'>
              For agent context, read{' '}
              <Link
                href='/llms.txt'
                className='text-primary-token underline decoration-subtle underline-offset-4 transition-colors hover:decoration-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
              >
                /llms.txt
              </Link>{' '}
              or a specific profile&apos;s <code>{'{username}/llms.txt'}</code>,
              and run the same jobs from a terminal with the{' '}
              <Link
                href={APP_ROUTES.CLI}
                className='text-primary-token underline decoration-subtle underline-offset-4 transition-colors hover:decoration-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
              >
                /cli
              </Link>
              .
            </p>
          </section>

          <section aria-labelledby='resources-heading'>
            <h2
              id='resources-heading'
              className='text-2xl font-semibold tracking-tight text-primary-token line-clamp-2'
            >
              {/* ui-casing-allow: marketing headline, sentence case per DESIGN.md */}
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
              {/* ui-casing-allow: marketing headline, sentence case per DESIGN.md */}
              Public by design
            </h2>
            <p className='mt-4 text-base leading-relaxed text-secondary-token'>
              This page documents Jovie&apos;s public profile surface: anonymous
              GET access to data a creator has made public. It does not add a
              write API, credentials, or a separate developer account. Keep
              private or sensitive information out of requests and use the
              OpenAPI contract as the source of truth.
            </p>
            <p className='mt-4 text-base leading-relaxed text-secondary-token'>
              Profile requests are limited to 100 per client IP in a fixed
              60-second window. Read the{' '}
              <Link
                href={`${DOCS_URL}/docs/developers/api-reference`}
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
