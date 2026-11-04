import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { DemoVideoPage } from '@/features/demo/DemoVideoPage';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const revalidate = false;

export const metadata: Metadata = {
  title: 'Demo Video',
  description: 'Watch the Jovie product demo video.',
  robots: NOINDEX_ROBOTS,
};

export default function ProductDemoVideoPage() {
  if (!FEATURE_FLAGS.SHOW_PRODUCT_DEMO_VIDEO) {
    redirect(APP_ROUTES.PRODUCT);
  }
  return <DemoVideoPage />;
}
