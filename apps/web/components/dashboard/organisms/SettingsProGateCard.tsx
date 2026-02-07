'use client';

import { Button } from '@jovie/ui';
import type { ComponentType } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';

export interface SettingsProGateCardProps {
  readonly title: string;
  readonly description: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly onUpgrade: () => void;
  readonly loading: boolean;
  readonly buttonClassName?: string;
}

export function SettingsProGateCard({
  title,
  description,
  icon,
  onUpgrade,
  loading,
  buttonClassName,
}: SettingsProGateCardProps) {
  const Icon = icon;

  return (
    <DashboardCard variant='settings' data-testid='settings-pro-gate-card'>
      <div className='text-center py-4'>
        <Icon className='mx-auto h-12 w-12 text-secondary-token mb-4' />
        <h3 className='text-[14px] font-medium text-primary-token mb-2'>
          {title}
        </h3>
        <p className='text-[13px] text-secondary-token mb-4'>{description}</p>
        <Button
          onClick={onUpgrade}
          loading={loading}
          className={buttonClassName}
          variant='primary'
        >
          Upgrade to Standard
        </Button>
      </div>
    </DashboardCard>
  );
}
