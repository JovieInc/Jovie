import { Metadata } from 'next';
import { MarketingHeader } from '@/components/site/MarketingHeader';
import { MarketingFooter } from '@/components/site/MarketingFooter';
import { YtOptimizerPage } from './YtOptimizerPage';

export const metadata: Metadata = {
  title: 'YouTube Channel Optimizer — Increase Views by 30%+',
  description:
    'AI-powered YouTube optimization. We optimize your titles, thumbnails, and descriptions to increase views. $30 paid trial with money-back guarantee.',
  openGraph: {
    title: 'YouTube Channel Optimizer — Increase Views by 30%+',
    description:
      'AI-powered YouTube optimization. We optimize your titles, thumbnails, and descriptions to increase views. $30 paid trial with money-back guarantee.',
    type: 'website',
  },
};

export default function Page() {
  return (
    <>
      <MarketingHeader />
      <YtOptimizerPage />
      <MarketingFooter />
    </>
  );
}
