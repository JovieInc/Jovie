'use client';

import { ArrowRight, Check } from 'lucide-react';
import React from 'react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { AUTH_SURFACE } from '@/lib/auth/constants';
import { cn } from '@/lib/utils';

interface HandleValidationState {
  readonly available: boolean;
  readonly checking: boolean;
  readonly error: string | null;
  readonly clientValid: boolean;
  readonly suggestions: string[];
}

interface OnboardingHandleStepProps {
  readonly title: string;
  readonly prompt?: string;
  readonly handleInput: string;
  readonly isHydrated: boolean;
  readonly isReservedHandle?: boolean;
  readonly handleValidation: HandleValidationState;
  readonly stateError: string | null;
  readonly isSubmitting: boolean;
  readonly isTransitioning: boolean;
  readonly ctaDisabledReason: string | null;
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly onHandleChange: (value: string) => void;
  readonly onSubmit: (e?: React.FormEvent) => void;
  readonly onSuggestionClick?: (value: string) => void;
  readonly isPendingSubmit?: boolean;
  readonly autoSubmitClaimed?: boolean;
}

function SubmitButtonIcon({
  isLoading,
  checking,
  autoSubmitClaimed,
}: Readonly<{
  isLoading: boolean;
  checking: boolean;
  autoSubmitClaimed: boolean;
}>) {
  if (isLoading || checking) {
    return <LoadingSpinner size='sm' className='text-current' />;
  }
  if (autoSubmitClaimed) {
    return (
      <Check
        aria-hidden='true'
        className='size-4 animate-in zoom-in duration-300'
      />
    );
  }
  return <ArrowRight aria-hidden='true' className='size-4' />;
}

export function OnboardingHandleStep({
  title,
  prompt,
  handleInput,
  isHydrated,
  isReservedHandle = false,
  handleValidation,
  stateError,
  isSubmitting,
  isTransitioning,
  ctaDisabledReason,
  inputRef,
  onHandleChange,
  onSubmit,
  onSuggestionClick,
  isPendingSubmit = false,
  autoSubmitClaimed = false,
}: OnboardingHandleStepProps) {
  const disabledReasonId = 'handle-step-disabled-reason';
  const isLoading =
    isSubmitting || (isPendingSubmit && handleValidation.checking);
  const hasError = Boolean(stateError || handleValidation.error);

  const canSubmit = !ctaDisabledReason && !isTransitioning && !isLoading;

  return (
    <div className='mx-auto flex w-full max-w-2xl flex-col gap-6'>
      <div className='space-y-3'>
        <h1 className='text-3xl font-semibold tracking-[-0.04em] text-primary-token sm:text-[2.7rem]'>
          {title}
        </h1>
        {prompt ? (
          <p className='max-w-xl text-sm leading-6 text-secondary-token sm:text-mid'>
            {prompt}
          </p>
        ) : null}
      </div>

      <form onSubmit={onSubmit} className='space-y-4'>
        <fieldset disabled={!isHydrated} className='min-w-0 space-y-4'>
          {/* Inline input with claim button */}
          <div
            className={cn(
              'flex items-center gap-2 rounded-full border px-2 py-1.5 transition-[background-color,border-color,box-shadow] duration-200',
              'border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_94%,var(--linear-bg-surface-0))]',
              'hover:border-default hover:bg-surface-0',
              'focus-within:border-(--linear-border-focus) focus-within:bg-surface-0 focus-within:ring-2 focus-within:ring-(--linear-border-focus)/16',
              hasError && 'border-destructive/60'
            )}
          >
            <span className='pl-3 text-mid font-semibold whitespace-nowrap text-secondary-token'>
              jov.ie/
            </span>
            <input
              id='handle-input'
              ref={inputRef}
              name='username'
              aria-label='Claim your handle'
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
              placeholder='yourname'
              autoComplete='username'
              autoCapitalize='none'
              autoCorrect='off'
              spellCheck={false}
              aria-invalid={hasError ? 'true' : undefined}
              className='min-w-0 flex-1 bg-transparent text-mid font-semibold tracking-[-0.02em] text-primary-token placeholder:text-tertiary-token placeholder:opacity-60 focus-visible:outline-none'
            />
            <button
              data-testid='onboarding-handle-submit'
              type='submit'
              disabled={!canSubmit}
              aria-describedby={
                ctaDisabledReason ? disabledReasonId : undefined
              }
              className={cn(
                'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-[background-color,opacity] duration-200',
                'bg-accent text-white hover:bg-accent-hover',
                'disabled:cursor-not-allowed disabled:opacity-40'
              )}
            >
              <SubmitButtonIcon
                isLoading={isLoading}
                checking={handleValidation.checking}
                autoSubmitClaimed={autoSubmitClaimed}
              />
            </button>
          </div>

          {/* Validation feedback + suggestions — tight under input */}
          <output
            data-testid='onboarding-handle-validation-status'
            className='min-h-[20px] flex flex-col items-start gap-2'
            aria-live='polite'
          >
            {autoSubmitClaimed && handleInput ? (
              <span className='text-success text-[13px] animate-in fade-in slide-in-from-top-1 duration-300'>
                jov.ie/{handleInput} is yours.
              </span>
            ) : null}
            {!(autoSubmitClaimed && handleInput) &&
            (stateError ||
              (hasError && handleInput && !handleValidation.checking)) ? (
              <span
                data-testid='handle-unavailable'
                className='text-error text-[13px] animate-in fade-in slide-in-from-top-1 duration-300'
              >
                {stateError || handleValidation.error}
              </span>
            ) : null}
            {handleValidation.suggestions.length > 0 && (
              <div className='flex flex-wrap items-center gap-2'>
                <span className='text-xs text-tertiary-token'>Try:</span>
                {handleValidation.suggestions.map(suggestion => (
                  <button
                    key={suggestion}
                    type='button'
                    onClick={() =>
                      onSuggestionClick
                        ? onSuggestionClick(suggestion)
                        : onHandleChange(suggestion)
                    }
                    className={AUTH_SURFACE.pillOption}
                  >
                    jov.ie/{suggestion}
                  </button>
                ))}
              </div>
            )}
          </output>
        </fieldset>
      </form>
      <span id={disabledReasonId} className='sr-only' aria-live='polite'>
        {ctaDisabledReason ?? ''}
      </span>
    </div>
  );
}
