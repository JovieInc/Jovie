import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { cn } from '@/lib/utils';

interface FormStatusProps {
  readonly loading?: boolean;
  readonly error?: string;
  readonly success?: string;
  readonly className?: string;
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
        <div className='flex items-center space-x-2 text-sm text-tertiary-token'>
          <LoadingSpinner size='sm' tone='muted' />
          <span>Processing...</span>
        </div>
      )}

      {trimmedError && (
        <p className='text-sm text-destructive'>{trimmedError}</p>
      )}

      {trimmedSuccess && (
        <p className='text-sm text-success'>{trimmedSuccess}</p>
      )}
    </div>
  );
}
