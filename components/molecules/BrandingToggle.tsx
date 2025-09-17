'use client';

import { SparklesIcon } from '@heroicons/react/24/outline';
import * as React from 'react';
import { SettingsToggle } from '@/components/atoms/SettingsToggle';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';

interface BrandingToggleProps {
  hideBranding: boolean;
  onToggle: (enabled: boolean) => void;
  isLoading?: boolean;
  className?: string;
}

export function BrandingToggle({
  hideBranding,
  onToggle,
  isLoading = false,
  className,
}: BrandingToggleProps) {
  return (
    <DashboardCard variant='settings' className={className}>
      <div className='flex items-start justify-between'>
        <div className='flex-1'>
          <h3 className='text-lg font-medium text-primary mb-2'>
            Hide Jovie Branding
          </h3>
          <p className='text-sm text-secondary max-w-md'>
            When enabled, Jovie branding will be removed from your profile page,
            giving your fans a fully custom experience.
          </p>
        </div>

        <div className='ml-6'>
          <SettingsToggle
            enabled={hideBranding}
            onToggle={onToggle}
            disabled={isLoading}
            label='Hide Jovie branding'
          />
        </div>
      </div>

      {hideBranding && (
        <div className='mt-4 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg'>
          <div className='flex items-start gap-3'>
            <SparklesIcon className='h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0' />
            <div>
              <p className='text-sm font-medium text-green-800 dark:text-green-200'>
                Branding Hidden
              </p>
              <p className='text-xs text-green-600 dark:text-green-400 mt-1'>
                Your profile now shows a completely custom experience without
                Jovie branding.
              </p>
            </div>
          </div>
        </div>
      )}
    </DashboardCard>
  );
}
