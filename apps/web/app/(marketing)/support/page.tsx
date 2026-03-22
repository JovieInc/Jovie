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
    <MarketingHero variant='centered' className='items-start text-left'>
      <p className='marketing-kicker'>Support</p>
      <h1 className='marketing-h1-linear mt-6 max-w-[10ch] text-primary-token'>
        We&apos;re here to help.
      </h1>
      <SupportContent />
    </MarketingHero>
  );
}
