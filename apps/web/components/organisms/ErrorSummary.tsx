'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface ErrorSummaryProps {
  errors: { [key: string]: string };
  title?: string;
  className?: string;
  onFocusField?: (fieldName: string) => void;
}

/**
 * ErrorSummary component for displaying form errors in an accessible way.
 * This component is designed to be focusable when errors occur and helps
 * keyboard-only users understand validation issues.
 */
export function ErrorSummary({
  errors,
  title = 'There is a problem',
  className,
  onFocusField,
}: ErrorSummaryProps) {
  const errorCount = Object.keys(errors).length;
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
        'bg-red-50 dark:bg-red-900/20 border-l-4 border-red-600 dark:border-red-500 p-4 rounded-md mb-6',
        className
      )}
      tabIndex={-1}
      role='alert'
      aria-labelledby='error-summary-title'
    >
      <h2
        id='error-summary-title'
        className='text-lg font-semibold text-red-800 dark:text-red-200 mb-2'
      >
        {title}
      </h2>

      <div className='text-red-700 dark:text-red-300'>
        <p className='mb-2'>
          Please fix the following{' '}
          {errorCount === 1 ? 'error' : `${errorCount} errors`}:
        </p>
        <ul className='list-disc pl-5 space-y-1'>
          {Object.entries(errors).map(([fieldName, errorMessage]) => (
            <li key={fieldName}>
              {onFocusField ? (
                <button
                  type='button'
                  className='underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded'
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
