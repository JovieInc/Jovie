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

function getInputRowStyle(isHero: boolean, isAvailable: boolean) {
  const borderColor = isAvailable
    ? 'rgba(74,222,128,0.25)'
    : isHero
      ? 'rgba(255,255,255,0.1)'
      : 'rgba(255,255,255,0.06)';

  const heroShadow = [
    '0 20px 50px rgba(0,0,0,0.22)',
    'inset 0 1px 3px rgba(0,0,0,0.25)',
    isAvailable
      ? '0 0 24px rgba(74,222,128,0.08)'
      : '0 2px 8px rgba(0,0,0,0.2)',
  ].join(', ');

  const defaultShadow = [
    'inset 0 1px 2px rgba(0,0,0,0.2)',
    isAvailable
      ? '0 0 20px rgba(74,222,128,0.06)'
      : '0 1px 2px rgba(0,0,0,0.1)',
  ].join(', ');

  return {
    minHeight: isHero ? 68 : 52,
    background: isHero
      ? 'linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.032) 100%)'
      : 'rgba(255,255,255,0.03)',
    border: `1px solid ${borderColor}`,
    boxShadow: isHero ? heroShadow : defaultShadow,
  };
}

function getInputStyle(isHero: boolean, isAvailable: boolean) {
  const color = isAvailable ? 'rgb(74,222,128)' : 'var(--linear-text-primary)';
  return isHero
    ? { fontSize: '19px', fontWeight: 510, letterSpacing: '-0.03em', color }
    : { fontSize: '13px', fontWeight: 450, letterSpacing: '-0.01em', color };
}

function getButtonStyle(isHero: boolean, isDisabled: boolean) {
  return {
    height: isHero ? 50 : 36,
    fontSize: isHero ? '14px' : '13px',
    fontWeight: 510,
    letterSpacing: '-0.01em',
    background: isDisabled
      ? 'rgba(255,255,255,0.06)'
      : 'linear-gradient(180deg, rgb(244,245,246) 0%, rgb(228,230,232) 100%)',
    color: isDisabled ? 'var(--linear-text-quaternary)' : 'rgb(8,9,10)',
    boxShadow: isDisabled
      ? 'none'
      : '0 10px 24px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.4)',
    border: isDisabled
      ? '1px solid transparent'
      : '1px solid rgba(255,255,255,0.18)',
  };
}

export function ClaimHandleForm({
  onHandleChange,
  size = 'default',
}: Readonly<ClaimHandleFormProps>) {
  const isHero = size === 'hero';
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

  const inputRowStyle = getInputRowStyle(isHero, isAvailable);
  const inputStyle = getInputStyle(isHero, isAvailable);
  const buttonStyle = getButtonStyle(isHero, isDisabled);

  return (
    <form onSubmit={onSubmit} className='w-full' noValidate>
      {/* Input row */}
      <div
        className={cn(
          'claim-input-row',
          'relative flex w-full items-center gap-2 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          isHero ? 'rounded-2xl p-1.5 sm:p-2' : 'rounded-[14px] p-1.5',
          isAvailable && 'claim-input-row--available'
        )}
        style={inputRowStyle}
      >
        {isHero && (
          <>
            <div
              aria-hidden='true'
              className='pointer-events-none absolute inset-x-2 top-0 h-px rounded-full'
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(255,255,255,0.2) 20%, rgba(255,255,255,0.24) 50%, rgba(255,255,255,0.18) 80%, transparent)',
              }}
            />
            <div
              aria-hidden='true'
              className='pointer-events-none absolute inset-y-2 right-[5rem] hidden w-px sm:block'
              style={{
                background:
                  'linear-gradient(180deg, transparent, rgba(255,255,255,0.08), transparent)',
              }}
            />
          </>
        )}

        <div className='flex items-center flex-1 min-w-0 pl-3.5 pr-1 gap-0'>
          {/* Domain prefix — etched, permanent feel */}
          <span
            className='shrink-0 select-none'
            style={
              isHero
                ? {
                    fontSize: '19px',
                    fontWeight: 510,
                    letterSpacing: '-0.03em',
                    color: 'var(--linear-text-quaternary)',
                    fontFamily: 'inherit',
                  }
                : {
                    fontSize: '13px',
                    fontWeight: 400,
                    color: 'var(--linear-text-tertiary)',
                    letterSpacing: '-0.02em',
                    fontFamily: 'monospace',
                  }
            }
          >
            {displayDomain}/
          </span>

          <input
            ref={inputRef}
            id='handle-input'
            type='text'
            value={handle}
            onChange={e => setHandle(e.target.value.toLowerCase())}
            placeholder={isHero ? 'you' : 'your-name'}
            required
            autoCapitalize='none'
            autoCorrect='off'
            autoComplete='off'
            aria-label='Choose your handle'
            aria-describedby={helperState.text ? 'handle-hint' : undefined}
            className={`min-w-0 flex-1 bg-transparent focus-visible:outline-none ${isHero ? 'placeholder:text-[var(--linear-text-quaternary)]' : 'placeholder:text-[var(--linear-text-tertiary)]'}`}
            style={inputStyle}
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
            'group shrink-0 inline-flex items-center justify-center gap-1.5 transition-all duration-200 focus-ring-themed',
            isHero ? 'rounded-[14px] px-6' : 'rounded-[10px] px-4 sm:px-5',
            isDisabled
              ? 'cursor-not-allowed opacity-40'
              : 'hover:brightness-110 active:scale-[0.98]'
          )}
          style={buttonStyle}
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
