'use client';

// @coverage-via apps/web/tests/components/forms.test.tsx
import { useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/utils';

interface ErrorSummaryProps {
  readonly errors: { [key: string]: string };
  readonly title?: string;
  readonly className?: string;
  readonly onFocusField?: (fieldName: string) => void;
}

/**
 * ErrorSummary component for displaying form errors in an accessible way.
 * This component is designed to be focusable when errors occur and helps
 * keyboard-only users understand validation issues.
 */
export function ErrorSummary({
  errors,
  title = 'Resolve Form Errors',
  className,
  onFocusField,
}: Readonly<ErrorSummaryProps>) {
  const errorCount = Object.keys(errors).length;
  const titleId = useId();
  const summaryRef = useRef<HTMLDivElement>(null);

  // Focus the error summary when errors are present
  useEffect(() => {
    if (errorCount > 0 && summaryRef.current) {
      summaryRef.current.focus();
    }
  }, [errorCount]);

  // If no errors, don't render anything
  if (errorCount === 0) {
    return null;
  }

  return (
    <div
      ref={summaryRef}
      className={cn(
        'mb-4 rounded-md border border-error/20 bg-error-subtle p-3 text-app text-error',
        className
      )}
      tabIndex={-1}
      role='alert'
      aria-live='assertive'
      aria-atomic='true'
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className='text-app font-medium text-error'>
        {title}
      </h2>

      <div>
        <p className='mt-1 text-app text-error'>
          Please fix the following{' '}
          {errorCount === 1 ? 'error' : `${errorCount} errors`}:
        </p>
        <ul className='mt-2 list-disc space-y-1 pl-5'>
          {Object.entries(errors).map(([fieldName, errorMessage]) => (
            <li key={fieldName}>
              {onFocusField ? (
                <button
                  type='button'
                  className='focus-ring-themed rounded-sm text-left text-error underline underline-offset-2 hover:text-error'
                  onClick={() => onFocusField(fieldName)}
                >
                  {errorMessage}
                </button>
              ) : (
                <span>{errorMessage}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
