'use client';

import { Button } from '@jovie/ui';
import { AlertCircle } from 'lucide-react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';

interface SettingsErrorStateProps {
  readonly message?: string;
  readonly onRetry?: () => void;
}

export function SettingsErrorState({
  message = 'Failed to load this section.',
  onRetry,
}: SettingsErrorStateProps) {
  return (
    <DashboardCard variant='settings'>
      <div className='flex flex-col items-center justify-center gap-2 py-8'>
        <AlertCircle className='h-6 w-6 text-destructive' />
        <p className='text-sm text-secondary-token'>{message}</p>
        {onRetry && (
          <Button variant='ghost' size='sm' onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </DashboardCard>
  );
}
