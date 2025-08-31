'use client';

import type { Metadata } from 'next';
import { useEffect } from 'react';
import { Container } from '@/components/site/Container';
import { Button } from '@/components/ui/Button';
import { APP_NAME } from '@/constants/app';
import { track, page } from '@/lib/analytics';

export const runtime = 'edge';

export const metadata: Metadata = {
  title: `Support - ${APP_NAME}`,
  description: 'Get help with your Jovie profile. Contact our support team for assistance with setup, troubleshooting, and account management.',
};

export default function SupportPage() {
  useEffect(() => {
    // Track page view
    page('Support Page', {
      path: '/support',
    });
  }, []);

  const handleContactClick = () => {
    // Track email click event
    track('Support Email Clicked', {
      email: 'support@jov.ie',
      source: 'support_page',
    });
  };

  return (
    <Container className='py-24 text-center'>
      <h1 className='text-5xl font-bold tracking-tight text-gray-900 dark:text-white'>
        We're here to help.
      </h1>
      <Button 
        as='a' 
        href='mailto:support@jov.ie' 
        className='mt-8'
        aria-label='Send email to support team at support@jov.ie'
        onClick={handleContactClick}
      >
        Contact Support
      </Button>
    </Container>
  );
}
