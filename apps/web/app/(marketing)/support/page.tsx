import type { Metadata } from 'next';
import { MarketingHero } from '@/components/marketing';
import { APP_NAME, APP_URL } from '@/constants/app';
import { SupportContent } from './SupportContent';

export const metadata: Metadata = {
  title: `Support - ${APP_NAME}`,
  description:
    'Get help with your Jovie profile. Contact our support team for assistance with setup, troubleshooting, and account management.',
  alternates: {
    canonical: `${APP_URL}/support`,
  },
};

export default function SupportPage() {
  return (
    <MarketingHero variant='centered'>
      <h1 className='marketing-h1-linear text-primary-token'>
        We&apos;re here to help.
      </h1>
      <SupportContent />
    </MarketingHero>
  );
}
