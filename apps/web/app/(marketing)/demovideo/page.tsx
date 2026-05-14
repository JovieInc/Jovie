import type { Metadata } from 'next';
import { DemoVideoPage } from '@/features/demo/DemoVideoPage';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const revalidate = false;

export const metadata: Metadata = {
  title: 'Demo Video',
  description: 'Watch the Jovie product demo video.',
  robots: NOINDEX_ROBOTS,
};

export default function ProductDemoVideoPage() {
  return <DemoVideoPage />;
}
