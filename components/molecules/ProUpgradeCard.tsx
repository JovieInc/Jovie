'use client';

import { Button } from '@jovie/ui';
import * as React from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';

interface ProUpgradeCardProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  isLoading?: boolean;
  onUpgrade: () => void;
  className?: string;
}

export function ProUpgradeCard({
  title,
  description,
  icon: Icon,
  isLoading = false,
  onUpgrade,
  className,
}: ProUpgradeCardProps) {
  return (
    <DashboardCard variant='settings' className={className}>
      <div className='text-center py-4'>
        <Icon className='mx-auto h-12 w-12 text-secondary mb-4' />
        <h3 className='text-lg font-medium text-primary mb-2'>{title}</h3>
        <p className='text-sm text-secondary mb-4'>{description}</p>
        <Button onClick={onUpgrade} disabled={isLoading} variant='primary'>
          {isLoading ? 'Loading...' : 'Upgrade to Pro'}
        </Button>
      </div>
    </DashboardCard>
  );
}
