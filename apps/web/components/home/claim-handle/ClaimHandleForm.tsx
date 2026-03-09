'use client';

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
import { useAuthSafe } from '@/hooks/useClerkSafe';
import { cn } from '@/lib/utils';
import { HandleStatusIcon } from './HandleStatusIcon';
import type { ClaimHandleFormProps } from './types';
import { useHandleValidation } from './useHandleValidation';
import { HELPER_TONE_CLASSES, useHelperState } from './useHelperState';

export function ClaimHandleForm({
  onHandleChange,
}: Readonly<ClaimHandleFormProps>) {
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
        `/onboarding?handle=${encodeURIComponent(handle.toLowerCase())}`
      );
    }
  }, [available, handle, router]);

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setFormSubmitted(true);

      // Store handle state if it exists, otherwise just direct to signup
      if (handle) {
        try {
          sessionStorage.setItem(
            'pendingClaim',
            JSON.stringify({ handle: handle.toLowerCase(), ts: Date.now() })
          );
        } catch {}
      }

      const target = handle
        ? `/onboarding?handle=${encodeURIComponent(handle.toLowerCase())}`
        : '/signup';

      setNavigating(true);

      if (!isSignedIn) {
        router.push(`/signup?redirect_url=${encodeURIComponent(target)}`);
        return;
      }

      router.push(target);
    },
    [handle, isSignedIn, router]
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
          <ChevronRight
            className='h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5'
            aria-hidden='true'
          />
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

  return (
    <form onSubmit={onSubmit} className='w-full' noValidate>
      {/* Input row */}
      <div
        className={cn(
          'claim-input-row',
          'relative flex w-full items-center gap-2 rounded-[14px] p-1.5',
          'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          isAvailable && 'claim-input-row--available'
        )}
        style={{
          minHeight: 52,
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${isAvailable ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.06)'}`,
          boxShadow: [
            'inset 0 1px 2px rgba(0,0,0,0.2)',
            isAvailable
              ? '0 0 20px rgba(74,222,128,0.06)'
              : '0 1px 2px rgba(0,0,0,0.1)',
          ].join(', '),
        }}
      >
        <div className='flex items-center flex-1 min-w-0 pl-3.5 pr-1 gap-0'>
          {/* Domain prefix — etched, permanent feel */}
          <span
            className='shrink-0 select-none font-mono'
            style={{
              fontSize: '13px',
              fontWeight: 400,
              color: 'var(--linear-text-quaternary)',
              letterSpacing: '-0.02em',
              opacity: 0.7,
            }}
          >
            {displayDomain}/
          </span>

          <input
            ref={inputRef}
            id='handle-input'
            type='text'
            value={handle}
            onChange={e => setHandle(e.target.value.toLowerCase())}
            placeholder='your-name'
            required
            autoCapitalize='none'
            autoCorrect='off'
            autoComplete='off'
            aria-label='Choose your handle'
            aria-describedby={helperState.text ? 'handle-hint' : undefined}
            className='min-w-0 flex-1 bg-transparent focus-visible:outline-none placeholder:opacity-40 placeholder:text-[var(--linear-text-tertiary)]'
            style={{
              fontSize: '13px',
              fontWeight: 450,
              letterSpacing: '-0.01em',
              color: isAvailable
                ? 'rgb(74,222,128)'
                : 'var(--linear-text-primary)',
            }}
          />

          <HandleStatusIcon
            showChecking={showChecking}
            handle={handle}
            available={available}
            handleError={handleError}
            unavailable={unavailable}
          />
        </div>

        <button
          type='submit'
          disabled={isDisabled}
          className={cn(
            'group shrink-0 inline-flex items-center justify-center gap-1.5 rounded-[10px] px-4 sm:px-5 transition-all duration-200 focus-ring-themed',
            isDisabled
              ? 'cursor-not-allowed opacity-40'
              : 'hover:brightness-110 active:scale-[0.98]'
          )}
          style={{
            height: 36,
            fontSize: '13px',
            fontWeight: 500,
            letterSpacing: '-0.01em',
            background: isDisabled
              ? 'rgba(255,255,255,0.06)'
              : 'rgb(237,238,238)',
            color: isDisabled ? 'var(--linear-text-quaternary)' : 'rgb(8,9,10)',
            boxShadow: isDisabled
              ? 'none'
              : '0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
          }}
        >
          <span className='inline-flex items-center gap-1.5 whitespace-nowrap'>
            {buttonContent}
          </span>
        </button>
      </div>

      {/* Helper text — minimal, surgical */}
      {helperState.text && (
        <p
          id='handle-hint'
          className={cn(
            'mt-2.5 pl-1 transition-colors duration-200',
            helperToneClass
          )}
          aria-live={helperState.tone === 'error' ? 'assertive' : 'polite'}
          style={{
            fontSize: '11px',
            lineHeight: '16px',
            letterSpacing: '0.01em',
            fontWeight: 400,
          }}
        >
          {helperState.text}
        </p>
      )}

      {/* Error summary for form validation */}
      {formSubmitted && handleError && (
        <p
          className='mt-1.5 pl-1'
          style={{
            fontSize: '11px',
            color: 'var(--linear-warning)',
            fontWeight: 400,
          }}
          role='alert'
        >
          {handleError}
        </p>
      )}
    </form>
  );
}
