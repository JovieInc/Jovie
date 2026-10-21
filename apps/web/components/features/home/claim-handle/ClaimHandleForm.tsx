// @coverage-via apps/web/tests/unit/ClaimHandleForm.test.tsx
'use client';

import { Button, Spinner as LoadingSpinner } from '@jovie/ui';
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
import { BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const navigationRef = useRef(false);

  const displayDomain = BASE_URL.replace(/^https?:\/\//, '');

  const [handle, setHandle] = useState('');
  const [navigating, setNavigating] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [navigationError, setNavigationError] = useState<string | null>(null);

  useEffect(() => {
    const restore = () => {
      navigationRef.current = false;
      setNavigating(false);
      setNavigationError(null);
    };
    globalThis.addEventListener('pageshow', restore);
    return () => globalThis.removeEventListener('pageshow', restore);
  }, []);

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
      if (navigationRef.current) return;
      setFormSubmitted(true);

      const normalizedHandle = handle.toLowerCase().trim();

      if (!normalizedHandle || handleError) {
        inputRef.current?.focus();
        return;
      }

      navigationRef.current = true;
      setNavigating(true);
      setNavigationError(null);

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

      try {
        // One entry contract for new and existing sessions. /start resolves
        // the target before auth/ownership determines the next permitted step.
        router.push(target);
      } catch {
        navigationRef.current = false;
        setNavigating(false);
        setNavigationError("We couldn't open your profile setup. Try again.");
      }
    },
    [handle, handleError, router, submitTracking]
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

  const helperToneClass =
    HELPER_TONE_CLASSES[navigationError ? 'error' : helperState.tone];

  const buttonContent = useMemo((): ReactNode => {
    if (navigating) {
      return (
        <>
          <LoadingSpinner
            size='sm'
            tone='inverse'
            label='Opening Profile Setup'
          />
          <span>Opening…</span>
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
      data-testid='claim-handle-form'
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
            name='handle'
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
              // JOV-INV-019: tailwind-merge collapses focus-visible:outline
              // and focus-visible:outline-2 into the same conflict group and
              // keeps only the last one, so outline-style never actually
              // turns on (outline-width without outline-style paints
              // nothing) — and focus-visible:border-focus had no border
              // width on this bare input to make a color change visible.
              // focus-ring-themed is the shared box-shadow-based ring the
              // rest of the app uses for exactly this reason.
              'min-w-0 flex-1 bg-transparent focus-ring-themed',
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
          role={
            formSubmitted && (handleError || navigationError)
              ? 'alert'
              : undefined
          }
        >
          {navigationError ||
            (navigating ? `Opening setup for @${handle}…` : helperState.text) ||
            ' '}
        </p>
      )}
    </form>
  );
}
