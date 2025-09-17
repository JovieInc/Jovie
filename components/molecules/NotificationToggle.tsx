'use client';

import * as React from 'react';
import { SettingsToggle } from '@/components/atoms/SettingsToggle';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';

interface NotificationToggleProps {
  marketingEmails: boolean;
  onToggle: (enabled: boolean) => void;
  isLoading?: boolean;
  className?: string;
}

export function NotificationToggle({
  marketingEmails,
  onToggle,
  isLoading = false,
  className,
}: NotificationToggleProps) {
  return (
    <DashboardCard variant='settings' className={className}>
      <div className='flex items-start justify-between'>
        <div className='flex-1'>
          <h3 className='text-lg font-medium text-primary mb-2'>
            Marketing Emails
          </h3>
          <p className='text-sm text-secondary max-w-md'>
            Receive updates about new features, tips, and promotional offers
            from Jovie.
          </p>
        </div>

        <div className='ml-6'>
          <SettingsToggle
            enabled={marketingEmails}
            onToggle={onToggle}
            disabled={isLoading}
            label='Toggle marketing emails'
          />
        </div>
      </div>
    </DashboardCard>
  );
}
