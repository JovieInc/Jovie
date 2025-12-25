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
      email: 'support@meetjovie.com',
      source: 'support_page',
    });
  };

  return (
    <Button
      asChild
      className='mt-8'
      aria-label='Send email to support team at support@meetjovie.com'
      onClick={handleContactClick}
    >
      <a href='mailto:support@meetjovie.com'>Contact Support</a>
    </Button>
  );
}
