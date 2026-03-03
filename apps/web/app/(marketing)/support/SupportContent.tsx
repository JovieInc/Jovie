'use client';

import { Button } from '@jovie/ui';
import { useEffect } from 'react';
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
      asChild
      className='mt-8'
      aria-label='Send email to support team at support@jov.ie'
      onClick={handleContactClick}
    >
      <a href='mailto:support@jov.ie'>Contact Support</a>
    </Button>
  );
}
