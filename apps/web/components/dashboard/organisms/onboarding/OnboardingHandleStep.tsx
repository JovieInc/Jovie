'use client';

import React from 'react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { AuthButton } from '@/components/auth';
import { FORM_LAYOUT } from '@/lib/auth/constants';

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
  inputRef: React.RefObject<HTMLInputElement | null>;
  onHandleChange: (value: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  isPendingSubmit?: boolean;
}

function ValidationIcon({
  checking,
  hasError,
  isValid,
}: {
  readonly checking: boolean;
  readonly hasError: boolean;
  readonly isValid: boolean;
}) {
  if (checking) {
    return <LoadingSpinner size='sm' className='text-secondary-token' />;
  }

  if (hasError) {
    return (
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
    );
  }

  if (isValid) {
    return (
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
    );
  }

  return null;
}

function ButtonContent({
  isSubmitting,
  isPendingSubmit,
  isChecking,
}: {
  readonly isSubmitting: boolean;
  readonly isPendingSubmit: boolean;
  readonly isChecking: boolean;
}) {
  if (isSubmitting) {
    return (
      <div className='flex items-center justify-center space-x-2'>
        <LoadingSpinner size='sm' className='text-current' />
        <span>Saving…</span>
      </div>
    );
  }

  if (isPendingSubmit && isChecking) {
    return (
      <div className='flex items-center justify-center space-x-2'>
        <LoadingSpinner size='sm' className='text-current' />
        <span>Checking…</span>
      </div>
    );
  }

  return <>Continue</>;
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
  isPendingSubmit = false,
}: OnboardingHandleStepProps) {
  function renderValidationStatus(): React.ReactNode {
    if (!handleInput || stateError) return null;
    if (handleValidation.checking) {
      return (
        <div className='text-sm text-secondary-token animate-in fade-in slide-in-from-bottom-1 duration-300'>
          Checking…
        </div>
      );
    }
    if (handleValidation.clientValid && handleValidation.available) return null;
    if (handleValidation.error) {
      return (
        <div className='text-error text-sm animate-in fade-in slide-in-from-top-1 duration-300 text-center'>
          Not available
        </div>
      );
    }
    return null;
  }

  return (
    <div className='flex flex-col items-center justify-center h-full'>
      <div className={`w-full max-w-md ${FORM_LAYOUT.formContainer}`}>
        <div className={FORM_LAYOUT.headerSection}>
          <h1 className={FORM_LAYOUT.title}>{title}</h1>
          {prompt ? <p className={FORM_LAYOUT.hint}>{prompt}</p> : null}
        </div>

        <form className={FORM_LAYOUT.formInner} onSubmit={onSubmit}>
          <div>
            <div
              className={[
                'w-full flex items-center gap-2 rounded-[6px] border bg-white dark:bg-[#0f1011] px-4 py-2.5',
                'focus-within:ring-2 focus-within:ring-[#6c78e6]/40 focus-within:ring-offset-2 focus-within:ring-offset-[#f5f5f5] dark:focus-within:ring-offset-[#090909]',
                stateError || handleValidation.error
                  ? 'border-error'
                  : 'border-gray-200 dark:border-[#1f2123]',
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
                <ValidationIcon
                  checking={handleValidation.checking}
                  hasError={Boolean(stateError || handleValidation.error)}
                  isValid={
                    Boolean(handleInput) &&
                    handleValidation.clientValid &&
                    handleValidation.available
                  }
                />
              </div>
            </div>

            <output className={FORM_LAYOUT.errorContainer} aria-live='polite'>
              {renderValidationStatus()}
            </output>
          </div>

          <AuthButton
            type='submit'
            disabled={Boolean(ctaDisabledReason) || isTransitioning}
            variant='primary'
          >
            <ButtonContent
              isSubmitting={isSubmitting}
              isPendingSubmit={isPendingSubmit}
              isChecking={handleValidation.checking}
            />
          </AuthButton>
        </form>

        <output className={FORM_LAYOUT.footerHint} aria-live='polite'>
          {stateError ?? null}
        </output>
      </div>
    </div>
  );
}
