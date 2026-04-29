import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getAppFlagValue } from '@/lib/flags/server';
import { PageBuilderClient } from './PageBuilderClient';

export const metadata: Metadata = {
  title: 'Page builder — Jovie',
  description:
    'Compose a landing page from registry sections with chrome toggles for header, footer, and final CTA. Becomes the canonical reference for every landing page.',
  robots: { index: false, follow: false },
};

export default async function PageBuilderPage() {
  const designV1Enabled = await getAppFlagValue('DESIGN_V1');

  // useSearchParams() in PageBuilderClient requires a Suspense boundary,
  // otherwise Next.js opts the entire route out of static prerendering and
  // throws at build time. Fallback is null because the toolbar + composed
  // page render fully on the client immediately.
  return (
    <Suspense fallback={null}>
      <PageBuilderClient designV1Enabled={designV1Enabled} />
    </Suspense>
  );
}
