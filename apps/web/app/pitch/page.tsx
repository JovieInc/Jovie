import type { Metadata } from 'next';
import { InvestorBrief } from '@/components/features/pitch/InvestorBrief';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const revalidate = false;

export const metadata: Metadata = {
  title: 'Jovie — Investor Brief',
  description: 'Jovie investor brief and product walkthrough.',
  robots: NOINDEX_ROBOTS,
};

export default function PitchPage() {
  return <InvestorBrief />;
}
