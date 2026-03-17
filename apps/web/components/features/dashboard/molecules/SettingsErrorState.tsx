'use client';

import { Button } from '@jovie/ui';
import { AlertCircle } from 'lucide-react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';

interface SettingsErrorStateProps {
  readonly title?: string;
  readonly message?: string;
  readonly onRetry?: () => void;
}

export function SettingsErrorState({
  title = 'Something went wrong',
  message = 'Failed to load this section.',
  onRetry,
}: SettingsErrorStateProps) {
  return (
    <ContentSurfaceCard className='overflow-hidden'>
      <div className='px-4 py-3'>
        <ContentSurfaceCard className='flex flex-col items-center justify-center gap-2 bg-(--linear-bg-surface-0) px-6 py-8 text-center'>
          <AlertCircle className='h-6 w-6 text-destructive' aria-hidden />
          <p className='text-[13px] font-[510] text-primary-token'>{title}</p>
          <p className='text-[13px] text-secondary-token'>{message}</p>
          {onRetry ? (
            <Button variant='ghost' size='sm' onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </ContentSurfaceCard>
      </div>
    </ContentSurfaceCard>
  );
}
