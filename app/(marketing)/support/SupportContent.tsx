'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { page, track } from '@/lib/analytics';

export function SupportContent() {
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
    <Button
      as='a'
      href='mailto:support@jov.ie'
      className='mt-8'
      aria-label='Send email to support team at support@jov.ie'
      onClick={handleContactClick}
    >
      Contact Support
    </Button>
  );
}
