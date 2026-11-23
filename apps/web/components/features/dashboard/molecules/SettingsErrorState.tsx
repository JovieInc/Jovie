'use client';

import { Button } from '@jovie/ui';
import { AlertCircle } from 'lucide-react';

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
    <div className='flex flex-col items-center justify-center gap-2 px-6 py-8 text-center'>
      <AlertCircle className='h-6 w-6 text-destructive' aria-hidden />
      <p className='text-app font-caption text-primary-token'>{title}</p>
      <p className='text-app text-secondary-token'>{message}</p>
      {onRetry ? (
        <Button variant='ghost' size='sm' onClick={onRetry}>
          Try Again
        </Button>
      ) : null}
    </div>
  );
}
