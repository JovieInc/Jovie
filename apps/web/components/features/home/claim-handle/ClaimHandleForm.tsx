'use client';

import { Button } from '@jovie/ui';
import { ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import { useAuthSafe } from '@/hooks/useClerkSafe';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { HandleStatusIcon } from './HandleStatusIcon';
import type { ClaimHandleFormProps } from './types';
import { useHandleValidation } from './useHandleValidation';
import { HELPER_TONE_CLASSES, useHelperState } from './useHelperState';

export function ClaimHandleForm({
  onHandleChange,
  size = 'default',
  submitButtonTestId,
  hideHelperText = false,
  submitTracking,
}: Readonly<ClaimHandleFormProps>) {
  const isHero = size === 'hero';
  const isHeroLike = size !== 'default';
  const router = useRouter();
  const { isSignedIn } = useAuthSafe();
  const inputRef = useRef<HTMLInputElement>(null);

  const displayDomain = BASE_URL.replace(/^https?:\/\//, '');

  const [handle, setHandle] = useState('');
  const [navigating, setNavigating] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);

  const { handleError, checkingAvail, available, availError } =
    useHandleValidation(handle);

  useEffect(() => {
    onHandleChange?.(handle);
  }, [handle, onHandleChange]);

  useEffect(() => {
    if (available === true && handle) {
      router.prefetch(
        `${APP_ROUTES.START}?handle=${encodeURIComponent(handle.toLowerCase())}`
      );
    }
  }, [available, handle, router]);

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setFormSubmitted(true);

      const normalizedHandle = handle.toLowerCase().trim();

      if (!normalizedHandle) {
        inputRef.current?.focus();
        return;
      }

      try {
        sessionStorage.setItem(
          'pendingClaim',
          JSON.stringify({ handle: normalizedHandle, ts: Date.now() })
        );
      } catch {}

      if (submitTracking) {
        track(submitTracking.eventName, {
          section: submitTracking.section,
          handle: normalizedHandle,
        });
      }

      const target = `${APP_ROUTES.START}?handle=${encodeURIComponent(normalizedHandle)}`;

      setNavigating(true);

      if (!isSignedIn) {
        router.push(
          `${APP_ROUTES.SIGNUP}?redirect_url=${encodeURIComponent(target)}`
        );
        return;
      }

      router.push(target);
    },
    [handle, isSignedIn, router, submitTracking]
  );

  const showChecking = checkingAvail;
  const unavailable = available === false || !!handleError || !!availError;

  const helperState = useHelperState({
    handle,
    handleError,
    checkingAvail,
    available,
    availError,
    displayDomain,
  });

  const helperToneClass = HELPER_TONE_CLASSES[helperState.tone];

  const buttonContent = useMemo((): ReactNode => {
    if (navigating) {
      return (
        <>
          <LoadingSpinner size='sm' tone='inverse' label='Creating' />
          <span>Creating…</span>
        </>
      );
    }
    if (available === true) {
      return (
        <>
          <span>Claim @{handle}</span>
          <ChevronRight className='h-3.5 w-3.5' aria-hidden='true' />
        </>
      );
    }
    return 'Claim';
  }, [navigating, available, handle]);

  const isAvailable = available === true;
  // Only block during navigation — never gate on availability check.
  // Availability is informational; server validates during onboarding.
  const hasClientError = !!handleError;
  const isDisabled = navigating || hasClientError;
  const submitButtonSize = size === 'display' ? 'lg' : 'md';
  const submitButtonClassName = cn(
    'shrink-0 gap-1.5 rounded-lg focus-ring-themed',
    isHero && 'h-10 px-4 text-xs',
    size === 'display' && 'h-16 rounded-xl px-6 text-base sm:px-7',
    !isHeroLike && 'h-9 px-3.5 sm:px-4'
  );

  return (
    <form
      onSubmit={onSubmit}
      className='w-full'
      noValidate
      aria-busy={checkingAvail || navigating}
    >
      {/* Input row */}
      <div
        className={cn(
          'claim-input-row',
          'system-b-claim-handle-row',
          'relative flex w-full items-center gap-2',
          isAvailable && 'claim-input-row--available'
        )}
        data-size={size}
        data-available={isAvailable ? 'true' : 'false'}
      >
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-0',
            isHero ? 'pl-3.5 pr-1.5' : 'pl-3 pr-1'
          )}
        >
          {/* Domain prefix — etched, permanent feel */}
          <span
            className='system-b-claim-handle-domain shrink-0 select-none'
            data-size={size}
          >
            {displayDomain}/
          </span>

          <input
            ref={inputRef}
            id='handle-input'
            type='text'
            value={handle}
            onChange={e => setHandle(e.target.value.toLowerCase())}
            placeholder='You'
            required
            autoCapitalize='none'
            autoCorrect='off'
            autoComplete='off'
            aria-label='Choose Your Handle'
            aria-invalid={unavailable ? 'true' : undefined}
            aria-describedby={helperState.text ? 'handle-hint' : undefined}
            className={cn(
              'system-b-claim-handle-input',
              'min-w-0 flex-1 bg-transparent focus-visible:outline-none',
              isHeroLike
                ? 'placeholder:text-quaternary-token'
                : 'placeholder:text-tertiary-token'
            )}
            data-size={size}
            data-available={isAvailable ? 'true' : 'false'}
          />

          <HandleStatusIcon
            showChecking={showChecking}
            handle={handle}
            available={available}
            handleError={handleError}
            unavailable={unavailable}
          />
        </div>

        <Button
          type='submit'
          disabled={isDisabled}
          data-testid={submitButtonTestId}
          aria-busy={checkingAvail || navigating}
          size={submitButtonSize}
          className={submitButtonClassName}
        >
          <span className='inline-flex items-center gap-1.5 whitespace-nowrap'>
            {buttonContent}
          </span>
        </Button>
      </div>

      {/* Helper text — minimal, surgical */}
      {!hideHelperText && (
        <p
          id='handle-hint'
          data-testid='claim-handle-status'
          className={cn(
            'system-b-claim-handle-helper',
            'mt-2 pl-1 transition-colors duration-slow',
            helperToneClass
          )}
          data-visible={helperState.text ? 'true' : 'false'}
          aria-hidden={helperState.text ? undefined : 'true'}
          aria-live={helperState.tone === 'error' ? 'assertive' : 'polite'}
          role={formSubmitted && handleError ? 'alert' : undefined}
        >
          {helperState.text || ' '}
        </p>
      )}
    </form>
  );
}
