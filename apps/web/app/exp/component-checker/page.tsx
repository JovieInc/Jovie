import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ComponentCheckerClient } from './ComponentCheckerClient';

export const metadata: Metadata = {
  title: 'Component checker — Jovie',
  description:
    'Full-bleed single-section preview for landing-page components. Toggle category and variant via the floating toolbar.',
  robots: { index: false, follow: false },
};

export default function ComponentCheckerPage() {
  // useSearchParams() in ComponentCheckerClient requires a Suspense boundary,
  // otherwise Next.js opts the route out of static prerendering and throws
  // at build time. Fallback is null because the toolbar + variant render
  // fully on the client.
  return (
    <Suspense fallback={null}>
      <ComponentCheckerClient />
    </Suspense>
  );
}
