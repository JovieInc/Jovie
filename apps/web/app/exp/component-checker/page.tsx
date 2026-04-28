import type { Metadata } from 'next';
import { ComponentCheckerClient } from './ComponentCheckerClient';

export const metadata: Metadata = {
  title: 'Component checker — Jovie',
  description:
    'Full-bleed single-section preview for landing-page components. Toggle category and variant via the floating toolbar.',
  robots: { index: false, follow: false },
};

export default function ComponentCheckerPage() {
  return <ComponentCheckerClient />;
}
