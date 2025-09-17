'use client';

import { useEffect } from 'react';
import { BillingDashboard } from '@/components/_legacy/BillingDashboard';
import { page } from '@/lib/analytics';

export default function BillingPage() {
  useEffect(() => {
    page('billing_dashboard', {
      page_type: 'billing',
      section: 'dashboard',
    });
  }, []);

  return <BillingDashboard />;
}
