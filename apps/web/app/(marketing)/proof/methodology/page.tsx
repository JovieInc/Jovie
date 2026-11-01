import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingContainer } from '@/components/marketing';
import { ProofMethodology } from '@/components/marketing/proof/ProofMethodology';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { marketingOgImage } from '@/data/marketingOgCards';
import { PROOF_METHODOLOGY_COPY } from '@/data/proofMethodologyCopy';
import { listProofStats } from '@/lib/proof-stats/registry';
import { documentTitle } from '@/lib/seo/document-title';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';
import { safeJsonLdStringify } from '@/lib/utils/json-ld';

const PAGE_URL = `${BASE_URL}${APP_ROUTES.PROOF_METHODOLOGY}`;
const TITLE = 'How Jovie Measures Its Numbers';
const DESCRIPTION =
  'Where every public Jovie number comes from: what it counts, how it is rounded, when it is shown and how competitor benchmarks are run.';

export const metadata: Metadata = {
  // Withheld until a proof stat is published (data/marketing/withheldRoutes.ts).
  robots: NOINDEX_ROBOTS,
  title: documentTitle(`${TITLE} - ${APP_NAME}`),
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: `${TITLE} - ${APP_NAME}`,
    description: DESCRIPTION,
    url: PAGE_URL,
    type: 'article',
    images: [marketingOgImage('default')],
  },
};

const PAGE_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: TITLE,
  description: DESCRIPTION,
  url: PAGE_URL,
  mainEntity: {
    '@type': 'TechArticle',
    headline: TITLE,
    description: DESCRIPTION,
    url: PAGE_URL,
    publisher: { '@type': 'Organization', name: APP_NAME, url: BASE_URL },
  },
} as const;

/** Rendered from the proof-stat registry at build time; no live values. */
export default function ProofMethodologyPage() {
  return (
    <MarketingContainer width='prose' className='pt-24 pb-20 sm:pt-28 sm:pb-28'>
      <h1
        data-wrap='editorial-title'
        className='system-b-marketing-route-title text-primary-token text-balance'
      >
        {TITLE}
      </h1>
      <p className='mt-6 text-lg leading-relaxed text-secondary-token text-pretty'>
        Every number on Jovie comes from one list. This page is generated from
        that list.
      </p>
      <ProofMethodology className='mt-16' stats={listProofStats()} />
      <nav
        aria-labelledby='proof-related-heading'
        className='mt-16 border-t border-subtle pt-8'
      >
        <h2
          id='proof-related-heading'
          data-wrap='editorial-title'
          className='text-lg font-medium text-primary-token text-balance'
        >
          {PROOF_METHODOLOGY_COPY.related.heading}
        </h2>
        <ul className='mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm'>
          {PROOF_METHODOLOGY_COPY.related.links.map(link => (
            <li key={link.href}>
              <Link
                href={link.href}
                className='text-secondary-token underline-offset-4 hover:text-primary-token hover:underline'
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <script type='application/ld+json'>
        {safeJsonLdStringify(PAGE_SCHEMA)}
      </script>
    </MarketingContainer>
  );
}
