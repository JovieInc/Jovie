import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
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
        <div className='flex items-center space-x-2 text-sm text-secondary-token'>
          <LoadingSpinner size='sm' tone='muted' />
          <span>Processing...</span>
        </div>
      )}

      {trimmedError && <p className='text-sm text-error'>{trimmedError}</p>}

      {trimmedSuccess && (
        <p className='text-sm text-success'>{trimmedSuccess}</p>
      )}
    </div>
  );
}
