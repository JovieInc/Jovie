'use client';

import { useEffect } from 'react';
import { BillingDashboard } from '@/components/organisms/BillingDashboard';
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

export const metadata = {
  title: 'Billing & Subscription | Jovie',
  description: 'Manage your subscription and billing information',
};
