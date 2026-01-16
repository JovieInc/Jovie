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
  return (
    <div className='flex flex-col items-center justify-center h-full space-y-8'>
      <div className='text-center space-y-3 max-w-xl px-4'>
        <h1 className='text-lg font-medium text-primary-token text-center'>
          {title}
        </h1>
        {prompt ? (
          <p className='text-sm text-secondary-token text-center'>{prompt}</p>
        ) : null}
      </div>

      <div className='w-full max-w-md space-y-6'>
        <form className='space-y-4' onSubmit={onSubmit}>
          <label
            className='text-sm font-medium text-secondary-token'
            htmlFor='handle-input'
          >
            @handle
          </label>
          <div
            className={[
              'w-full flex items-center gap-2 rounded-[6px] border bg-white dark:bg-[#0f1011] px-4 py-3',
              'focus-within:ring-2 focus-within:ring-[#6c78e6]/40 focus-within:ring-offset-2 focus-within:ring-offset-[#f5f5f5] dark:focus-within:ring-offset-[#090909]',
              stateError || handleValidation.error
                ? 'border-error'
                : !stateError && handleValidation.available
                  ? 'border-success'
                  : 'border-[#d7d9de] dark:border-[#2c2e33]',
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
                    .replace(/\s+/g, '')
                    .replace(/^@+/, '')
                )
              }
              placeholder='yourhandle'
              autoComplete='username'
              autoCapitalize='none'
              autoCorrect='off'
              spellCheck={false}
              aria-invalid={handleValidation.error ? 'true' : undefined}
              className='min-w-0 flex-1 bg-transparent text-primary-token placeholder:text-tertiary-token focus:outline-none'
            />
            <div className='h-5 w-5 flex items-center justify-center'>
              {handleValidation.checking ? (
                <LoadingSpinner size='sm' className='text-secondary-token' />
              ) : stateError || handleValidation.error ? (
                <svg
                  viewBox='0 0 20 20'
                  fill='none'
                  aria-hidden='true'
                  className='h-5 w-5'
                >
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
              ) : handleInput &&
                handleValidation.clientValid &&
                handleValidation.available ? (
                <svg
                  viewBox='0 0 20 20'
                  fill='none'
                  aria-hidden='true'
                  className='h-5 w-5'
                >
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
              ) : null}
            </div>
          </div>

          {/* biome-ignore lint/a11y/useSemanticElements: output element not appropriate for validation status */}
          <div
            className='min-h-[24px] flex flex-col items-center justify-center px-1'
            role='status'
            aria-live='polite'
          >
            {handleInput && !stateError ? (
              handleValidation.checking ? (
                <div className='text-sm text-secondary-token animate-in fade-in slide-in-from-bottom-1 duration-300'>
                  Checking…
                </div>
              ) : handleValidation.clientValid && handleValidation.available ? (
                <div className='text-success text-sm font-medium animate-in fade-in slide-in-from-bottom-1 duration-300'>
                  Available
                </div>
              ) : handleValidation.error ? (
                <div className='text-error text-sm animate-in fade-in slide-in-from-top-1 duration-300 text-center'>
                  Not available
                </div>
              ) : null
            ) : null}
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
