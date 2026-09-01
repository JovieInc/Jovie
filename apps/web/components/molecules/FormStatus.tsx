import { Spinner as LoadingSpinner } from '@jovie/ui';
import { cn } from '@/lib/utils';

interface FormStatusProps {
  readonly loading?: boolean;
  readonly error?: string;
  readonly success?: string;
  readonly className?: string;
}

function getStatusState({
  loading,
  error,
  success,
}: {
  readonly loading: boolean;
  readonly error: string;
  readonly success: string;
}) {
  if (loading) {
    return 'loading';
  }

  if (error) {
    return 'error';
  }

  if (success) {
    return 'success';
  }

  return 'idle';
}

export function FormStatus({
  loading = false,
  error,
  success,
  className,
}: FormStatusProps) {
  const trimmedError = error?.trim() ?? '';
  const trimmedSuccess = success?.trim() ?? '';
  const state = getStatusState({
    loading,
    error: trimmedError,
    success: trimmedSuccess,
  });

  return (
    <div
      className={cn('min-h-5 space-y-1 text-app', className)}
      data-slot='form-status'
      data-state={state}
      aria-live='polite'
      aria-atomic='true'
    >
      {loading && (
        <div className='flex items-center gap-2 text-app text-tertiary-token'>
          <LoadingSpinner size='sm' tone='muted' />
          <span>Processing...</span>
        </div>
      )}

      {trimmedError && (
        <p className='font-medium text-error' role='alert'>
          {trimmedError}
        </p>
      )}

      {trimmedSuccess && (
        <output className='font-medium text-success'>
          {trimmedSuccess}
        </output>
      )}
    </div>
  );
}
