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
  const trimmedError = error?.trim() ?? '';
  const trimmedSuccess = success?.trim() ?? '';

  // Render nothing when there's no loading state and no meaningful messages
  if (!loading && !trimmedError && !trimmedSuccess) return null;

  return (
    <div className={cn('space-y-2', className)}>
      {loading && (
        <div className='flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400'>
          <LoadingSpinner size='sm' tone='muted' />
          <span>Processing...</span>
        </div>
      )}

      {trimmedError && (
        <p className='text-sm text-red-600 dark:text-red-400'>{trimmedError}</p>
      )}

      {trimmedSuccess && (
        <p className='text-sm text-green-600 dark:text-green-400'>
          {trimmedSuccess}
        </p>
      )}
    </div>
  );
}
