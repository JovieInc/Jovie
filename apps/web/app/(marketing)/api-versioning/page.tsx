import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingContainer, MarketingHero } from '@/components/marketing';
import { APP_NAME, BASE_URL } from '@/constants/app';
import {
  PUBLIC_ARTIST_API_OPENAPI_URL,
  PUBLIC_ARTIST_API_POLICY_URL,
  PUBLIC_ARTIST_API_REFERENCE_URL,
  PUBLIC_ARTIST_API_VERSION,
} from '@/lib/api/v1/contract';
import { buildBreadcrumbSchema } from '@/lib/constants/schemas';

export const revalidate = false;

const PAGE_URL = PUBLIC_ARTIST_API_POLICY_URL;

export const metadata: Metadata = {
  title: `API Versioning and Deprecation Policy — ${APP_NAME}`,
  description:
    // ui-casing-allow: metadata sentence with API lifecycle terms
    'The canonical lifecycle policy for Jovie’s public artist API: URL versioning, active v1 status, and future Deprecation or Sunset signals.',
  alternates: {
    canonical: PAGE_URL,
  },
  openGraph: {
    title: `API Versioning and Deprecation Policy — ${APP_NAME}`,
    description:
      // ui-casing-allow: metadata sentence with API lifecycle terms
      'The canonical lifecycle policy for Jovie’s public artist API: URL versioning, active v1 status, and future Deprecation or Sunset signals.',
    url: PAGE_URL,
    type: 'article',
  },
};

const BREADCRUMB_SCHEMA = buildBreadcrumbSchema([
  { name: APP_NAME, url: BASE_URL },
  { name: 'API versioning policy', url: PAGE_URL },
]);

export default function ApiVersioningPage() {
  return (
    <>
      <script type='application/ld+json'>{BREADCRUMB_SCHEMA}</script>

      <MarketingHero variant='left'>
        <p className='text-sm font-medium text-tertiary-token'>
          Public API policy
        </p>
        <h1 className='mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-balance text-primary-token sm:text-5xl lg:text-6xl'>
          API Versioning And Deprecation Policy
        </h1>
        <p className='mt-6 max-w-2xl text-lg leading-relaxed text-secondary-token'>
          The canonical lifecycle contract for Jovie&apos;s public artist API.
          It explains how versions change and how genuine retirement will be
          signaled.
        </p>
      </MarketingHero>

      <MarketingContainer width='prose' className='pb-20 sm:pb-28'>
        <div className='space-y-16'>
          <section aria-labelledby='versioning-heading'>
            <h2
              id='versioning-heading'
              className='text-2xl font-semibold tracking-tight text-primary-token'
            >
              Versioning
            </h2>
            <p className='mt-4 text-base leading-relaxed text-secondary-token'>
              Jovie uses URL versioning. The current public artist API is{' '}
              <code>/api/v{PUBLIC_ARTIST_API_VERSION.split('.')[0]}</code>,
              served from <code>{BASE_URL}</code>. Additive fields and
              backward-compatible changes remain within the active version;
              breaking request or response changes receive a new major URL
              version.
            </p>
          </section>

          <section aria-labelledby='lifecycle-heading'>
            <h2
              id='lifecycle-heading'
              className='text-2xl font-semibold tracking-tight text-primary-token'
            >
              Deprecation And Sunset Signals
            </h2>
            <p className='mt-4 text-base leading-relaxed text-secondary-token'>
              Version <code>v1</code> is active and is not deprecated. No
              retirement date is scheduled. Current v1 responses intentionally
              omit <code>Deprecation</code> and <code>Sunset</code> headers; the
              discovery link to this page is policy documentation only and does
              not retire the active version.
            </p>
            <p className='mt-4 text-base leading-relaxed text-secondary-token'>
              Before a genuinely deprecated version is removed, Jovie will
              publish migration guidance on this page and signal the change with
              the RFC 9745 <code>Deprecation</code> header and a{' '}
              <code>Link</code> relation to the guidance. When a dated
              retirement window is announced, responses will also carry an RFC
              8594 <code>Sunset</code> HTTP-date. These signals are emitted only
              for the affected deprecated version.
            </p>
          </section>

          <section aria-labelledby='contract-heading'>
            <h2
              id='contract-heading'
              className='text-2xl font-semibold tracking-tight text-primary-token'
            >
              Machine-readable Contract
            </h2>
            <p className='mt-4 text-base leading-relaxed text-secondary-token'>
              The{' '}
              <Link
                href={PUBLIC_ARTIST_API_OPENAPI_URL}
                className='text-primary-token underline decoration-subtle underline-offset-4 transition-colors hover:decoration-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
              >
                OpenAPI 3.1 contract
              </Link>{' '}
              carries the same versioning policy in its{' '}
              <code>x-jovie-versioning</code> extension. The{' '}
              <Link
                href={PUBLIC_ARTIST_API_REFERENCE_URL}
                className='text-primary-token underline decoration-subtle underline-offset-4 transition-colors hover:decoration-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
              >
                API reference
              </Link>{' '}
              covers request details, rate limits, and examples.
            </p>
          </section>
        </div>
      </MarketingContainer>
    </>
  );
}
