'use client';

import React from 'react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { AuthButton } from '@/components/auth';

interface HandleValidationState {
  available: boolean;
  checking: boolean;
  error: string | null;
  clientValid: boolean;
  suggestions: string[];
}

interface OnboardingHandleStepProps {
  title: string;
  prompt?: string;
  handleInput: string;
  handleValidation: HandleValidationState;
  stateError: string | null;
  isSubmitting: boolean;
  isTransitioning: boolean;
  ctaDisabledReason: string | null;
  inputRef: React.RefObject<HTMLInputElement>;
  onHandleChange: (value: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
}

/** Error icon (X in circle) */
function ErrorIcon() {
  return (
    <svg viewBox='0 0 20 20' fill='none' aria-hidden='true' className='h-5 w-5'>
      <circle
        cx='10'
        cy='10'
        r='9'
        stroke='currentColor'
        className='text-error'
        strokeWidth='2'
      />
      <path
        d='M6.6 6.6l6.8 6.8M13.4 6.6l-6.8 6.8'
        stroke='currentColor'
        className='text-error'
        strokeWidth='2'
        strokeLinecap='round'
      />
    </svg>
  );
}

/** Success icon (checkmark in circle) */
function SuccessIcon() {
  return (
    <svg viewBox='0 0 20 20' fill='none' aria-hidden='true' className='h-5 w-5'>
      <circle
        cx='10'
        cy='10'
        r='9'
        stroke='currentColor'
        className='text-success'
        strokeWidth='2'
      />
      <path
        d='M6 10.2l2.6 2.6L14 7.4'
        stroke='currentColor'
        className='text-success'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  );
}

/** Determine which validation status icon to show */
function ValidationStatusIcon({
  checking,
  hasError,
  isValid,
}: {
  checking: boolean;
  hasError: boolean;
  isValid: boolean;
}) {
  if (checking) {
    return <LoadingSpinner size='sm' className='text-secondary-token' />;
  }
  if (hasError) {
    return <ErrorIcon />;
  }
  if (isValid) {
    return <SuccessIcon />;
  }
  return null;
}

/** Determine validation status message to display */
function ValidationStatusMessage({
  handleInput,
  stateError,
  checking,
  clientValid,
  available,
  error,
}: {
  handleInput: string;
  stateError: string | null;
  checking: boolean;
  clientValid: boolean;
  available: boolean;
  error: string | null;
}) {
  if (!handleInput || stateError) return null;

  if (checking) {
    return (
      <div className='text-sm text-secondary-token animate-in fade-in slide-in-from-bottom-1 duration-300'>
        Checking…
      </div>
    );
  }

  if (clientValid && available) return null;

  if (error) {
    return (
      <div className='text-error text-sm animate-in fade-in slide-in-from-top-1 duration-300 text-center'>
        Not available
      </div>
    );
  }

  return null;
}

/** Get input container border class */
function getInputBorderClass(hasError: boolean): string {
  return hasError ? 'border-error' : 'border-gray-200 dark:border-[#1f2123]';
}

export function OnboardingHandleStep({
  title,
  prompt,
  handleInput,
  handleValidation,
  stateError,
  isSubmitting,
  isTransitioning,
  ctaDisabledReason,
  inputRef,
  onHandleChange,
  onSubmit,
}: OnboardingHandleStepProps) {
  const hasError = Boolean(stateError || handleValidation.error);
  const isValid =
    Boolean(handleInput) &&
    handleValidation.clientValid &&
    handleValidation.available;

  return (
    <div className='flex flex-col items-center justify-center h-full space-y-5'>
      <div className='text-center space-y-2 max-w-xl px-4'>
        <h1 className='text-lg font-normal text-primary-token text-center'>
          {title}
        </h1>
        {prompt && (
          <p className='text-sm text-secondary-token text-center'>{prompt}</p>
        )}
      </div>

      <div className='w-full max-w-md space-y-6'>
        <form className='space-y-4' onSubmit={onSubmit}>
          <div
            className={[
              'w-full flex items-center gap-2 rounded-[6px] border bg-white dark:bg-[#0f1011] px-4 py-2.5',
              'focus-within:ring-2 focus-within:ring-[#6c78e6]/40 focus-within:ring-offset-2 focus-within:ring-offset-[#f5f5f5] dark:focus-within:ring-offset-[#090909]',
              getInputBorderClass(hasError),
            ].join(' ')}
          >
            <span className='text-sm text-secondary-token whitespace-nowrap'>
              @
            </span>
            <input
              id='handle-input'
              ref={inputRef}
              name='username'
              aria-label='Enter your desired handle'
              type='text'
              value={handleInput}
              onChange={e =>
                onHandleChange(
                  e.target.value
                    .toLowerCase()
                    .replaceAll(/\s+/g, '')
                    .replace(/^@+/, '')
                )
              }
              placeholder='yourhandle'
              autoComplete='username'
              autoCapitalize='none'
              autoCorrect='off'
              spellCheck={false}
              aria-invalid={handleValidation.error ? 'true' : undefined}
              className='min-w-0 flex-1 bg-transparent text-primary-token placeholder:text-tertiary-token focus-visible:outline-none'
            />
            <div className='h-5 w-5 flex items-center justify-center'>
              <ValidationStatusIcon
                checking={handleValidation.checking}
                hasError={hasError}
                isValid={isValid}
              />
            </div>
          </div>

          {/* biome-ignore lint/a11y/useSemanticElements: output element not appropriate for validation status */}
          <div
            className='min-h-[24px] flex flex-col items-center justify-center px-1'
            role='status'
            aria-live='polite'
          >
            <ValidationStatusMessage
              handleInput={handleInput}
              stateError={stateError}
              checking={handleValidation.checking}
              clientValid={handleValidation.clientValid}
              available={handleValidation.available}
              error={handleValidation.error}
            />
          </div>

          <AuthButton
            type='submit'
            disabled={Boolean(ctaDisabledReason) || isTransitioning}
            variant='primary'
          >
            {isSubmitting ? (
              <div className='flex items-center justify-center space-x-2'>
                <LoadingSpinner size='sm' className='text-current' />
                <span>Saving…</span>
              </div>
            ) : (
              'Continue'
            )}
          </AuthButton>

          {/* biome-ignore lint/a11y/useSemanticElements: output element not appropriate for error message */}
          <div
            className='min-h-[40px] flex items-center justify-center text-center text-xs text-secondary-token'
            role='status'
            aria-live='polite'
          >
            {stateError ?? null}
          </div>
        </form>
      </div>
    </div>
  );
}
