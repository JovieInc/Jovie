import type { Metadata } from 'next';
import { PageBuilderClient } from './PageBuilderClient';

export const metadata: Metadata = {
  title: 'Page builder — Jovie',
  description:
    'Compose a landing page from registry sections with chrome toggles for header, footer, and final CTA. Becomes the canonical reference for every landing page.',
  robots: { index: false, follow: false },
};

export default function PageBuilderPage() {
  return <PageBuilderClient />;
}
