import React from 'react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { cn } from '@/lib/utils';

interface FormStatusProps {
  loading?: boolean;
  error?: string;
  success?: string;
  className?: string;
}

export function FormStatus({
  loading = false,
  error,
  success,
  className,
}: FormStatusProps) {
  if (!loading && !error && !success) return null;

  return (
    <div className={cn('space-y-2', className)}>
      {loading && (
        <div className='flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400'>
          <LoadingSpinner size='sm' />
          <span>Processing...</span>
        </div>
      )}

      {error && error.trim() !== '' && (
        <p className='text-sm text-red-600 dark:text-red-400'>{error}</p>
      )}

      {success && success.trim() !== '' && (
        <p className='text-sm text-green-600 dark:text-green-400'>{success}</p>
      )}
    </div>
  );
}
