import type { Metadata } from 'next';
import { MarketingContainer } from '@/components/marketing';
import { ProofMethodology } from '@/components/marketing/proof/ProofMethodology';
import { APP_NAME, BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { listProofStats } from '@/lib/proof-stats/registry';
import { documentTitle } from '@/lib/seo/document-title';

const PAGE_URL = `${BASE_URL}${APP_ROUTES.PROOF_METHODOLOGY}`;
const TITLE = 'How Jovie Measures Its Numbers';
const DESCRIPTION =
  'Where every public Jovie number comes from: what it counts, how it is rounded, when it is shown and how competitor benchmarks are run.';

export const metadata: Metadata = {
  title: documentTitle(`${TITLE} - ${APP_NAME}`),
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: `${TITLE} - ${APP_NAME}`,
    description: DESCRIPTION,
    url: PAGE_URL,
    type: 'article',
  },
};

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
    </MarketingContainer>
  );
}
