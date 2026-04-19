'use client';

type ClaimHandleSize = 'default' | 'hero' | 'display';

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
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { HandleStatusIcon } from './HandleStatusIcon';
import type { ClaimHandleFormProps } from './types';
import { useHandleValidation } from './useHandleValidation';
import { HELPER_TONE_CLASSES, useHelperState } from './useHelperState';

function getInputRowStyleHero(isAvailable: boolean) {
  return {
    minHeight: 56,
    background:
      'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.018) 100%)',
    border: `1px solid ${isAvailable ? 'rgba(74,222,128,0.22)' : 'rgba(255,255,255,0.08)'}`,
    boxShadow: isAvailable
      ? '0 12px 30px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.04), 0 0 16px rgba(74,222,128,0.05)'
      : '0 12px 30px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.04)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
  };
}

function getInputRowStyle(size: ClaimHandleSize, isAvailable: boolean) {
  if (size === 'hero') return getInputRowStyleHero(isAvailable);

  const isDisplay = size === 'display';
  const isHeroLike = size !== 'default';
  let borderColor = 'rgba(255,255,255,0.06)';
  if (isAvailable) borderColor = 'rgba(74,222,128,0.25)';
  else if (isHeroLike) borderColor = 'rgba(255,255,255,0.1)';

  const heroShadow = [
    '0 14px 38px rgba(0,0,0,0.18)',
    'inset 0 1px 0 rgba(255,255,255,0.04)',
    isAvailable
      ? '0 0 18px rgba(74,222,128,0.06)'
      : '0 1px 4px rgba(0,0,0,0.18)',
  ].join(', ');

  const defaultShadow = [
    'inset 0 1px 2px rgba(0,0,0,0.2)',
    isAvailable
      ? '0 0 20px rgba(74,222,128,0.06)'
      : '0 1px 2px rgba(0,0,0,0.1)',
  ].join(', ');

  let minHeight = 52;
  if (isDisplay) minHeight = 88;
  else if (isHeroLike) minHeight = 58;

  return {
    minHeight,
    background: isHeroLike
      ? 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.024) 100%)'
      : 'rgba(255,255,255,0.03)',
    border: `${isDisplay ? 1.5 : 1}px solid ${borderColor}`,
    boxShadow: isHeroLike ? heroShadow : defaultShadow,
  };
}

function getDomainPrefixStyle(size: ClaimHandleSize) {
  if (size === 'display') {
    return {
      fontSize: '28px',
      fontWeight: 510,
      letterSpacing: '-0.04em',
      color: 'var(--linear-text-quaternary)',
      fontFamily: 'inherit',
    } as const;
  }
  if (size === 'hero') {
    return {
      fontSize: '15px',
      fontWeight: 450,
      letterSpacing: '-0.016em',
      color: 'var(--linear-text-tertiary)',
      fontFamily: 'inherit',
    } as const;
  }
  return {
    fontSize: '13px',
    fontWeight: 400,
    color: 'var(--linear-text-tertiary)',
    letterSpacing: '-0.02em',
    fontFamily: 'monospace',
  } as const;
}

function getInputStyle(size: ClaimHandleSize, isAvailable: boolean) {
  const isHero = size === 'hero';
  const isDisplay = size === 'display';
  const color = isAvailable ? 'rgb(74,222,128)' : 'var(--linear-text-primary)';
  if (isDisplay) {
    return {
      fontSize: '28px',
      fontWeight: 510,
      letterSpacing: '-0.04em',
      color,
    };
  }
  if (isHero) {
    return {
      fontSize: '16px',
      fontWeight: 510,
      letterSpacing: '-0.022em',
      color,
    };
  }
  return { fontSize: '13px', fontWeight: 450, letterSpacing: '-0.01em', color };
}

function getButtonStyle(size: ClaimHandleSize, isDisabled: boolean) {
  const isHero = size === 'hero';
  const isDisplay = size === 'display';
  if (isHero) {
    return {
      height: 38,
      fontSize: '12px',
      fontWeight: 510,
      letterSpacing: '-0.005em',
      background:
        'linear-gradient(180deg, rgba(244,245,246,0.96) 0%, rgba(228,230,232,0.92) 100%)',
      color: isDisabled ? 'var(--linear-text-quaternary)' : 'rgb(8,9,10)',
      boxShadow: isDisabled
        ? 'none'
        : '0 6px 18px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.34)',
      border: isDisabled
        ? '1px solid transparent'
        : '1px solid rgba(255,255,255,0.12)',
    };
  }
  return {
    height: isDisplay ? 64 : 36,
    fontSize: isDisplay ? '16px' : '13px',
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
  submitButtonTestId,
  hideHelperText = false,
  submitTracking,
}: Readonly<ClaimHandleFormProps>) {
  const isHero = size === 'hero';
  const isDisplay = size === 'display';
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
        `/onboarding?handle=${encodeURIComponent(handle.toLowerCase())}`
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

      const target = `/onboarding?handle=${encodeURIComponent(normalizedHandle)}`;

      setNavigating(true);

      if (!isSignedIn) {
        router.push(`/signup?redirect_url=${encodeURIComponent(target)}`);
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
          <ChevronRight
            className='h-3.5 w-3.5 transition-transform duration-slow group-hover:translate-x-0.5'
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

  const inputRowStyle = getInputRowStyle(size, isAvailable);
  const inputStyle = getInputStyle(size, isAvailable);
  const buttonStyle = getButtonStyle(size, isDisabled);

  let sizeRoundingClass = 'rounded-xl p-1';
  if (isDisplay) sizeRoundingClass = 'rounded-[1.4rem] p-1.5 sm:p-2';
  else if (isHero) sizeRoundingClass = 'rounded-[1rem] p-[0.35rem]';

  let buttonRoundingClass = 'rounded-lg px-3.5 sm:px-4';
  if (isDisplay) buttonRoundingClass = 'rounded-[1rem] px-6 sm:px-7';
  else if (isHero) buttonRoundingClass = 'rounded-[0.8rem] px-4';

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
          'relative flex w-full items-center gap-2 transition-all duration-slower ease-[cubic-bezier(0.16,1,0.3,1)]',
          sizeRoundingClass,
          isAvailable && 'claim-input-row--available'
        )}
        style={inputRowStyle}
      >
        {isHeroLike && (
          <div
            aria-hidden='true'
            className='pointer-events-none absolute inset-x-2 top-0 h-px rounded-full'
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(255,255,255,0.2) 20%, rgba(255,255,255,0.24) 50%, rgba(255,255,255,0.18) 80%, transparent)',
            }}
          />
        )}

        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-0',
            isHero ? 'pl-3.5 pr-1.5' : 'pl-3 pr-1'
          )}
        >
          {/* Domain prefix — etched, permanent feel */}
          <span
            className='shrink-0 select-none'
            style={getDomainPrefixStyle(size)}
          >
            {displayDomain}/
          </span>

          <input
            ref={inputRef}
            id='handle-input'
            type='text'
            value={handle}
            onChange={e => setHandle(e.target.value.toLowerCase())}
            placeholder='you'
            required
            autoCapitalize='none'
            autoCorrect='off'
            autoComplete='off'
            aria-label='Choose your handle'
            aria-invalid={unavailable ? 'true' : undefined}
            aria-describedby={helperState.text ? 'handle-hint' : undefined}
            className={`min-w-0 flex-1 bg-transparent focus-visible:outline-none ${isHeroLike ? 'placeholder:text-quaternary-token' : 'placeholder:text-tertiary-token'}`}
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
          data-testid={submitButtonTestId}
          aria-busy={checkingAvail || navigating}
          className={cn(
            'group shrink-0 inline-flex items-center justify-center gap-1.5 transition-all duration-slow focus-ring-themed',
            buttonRoundingClass,
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
      {!hideHelperText && helperState.text && (
        <p
          id='handle-hint'
          data-testid='claim-handle-status'
          className={cn(
            'mt-2 pl-1 transition-colors duration-slow',
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
      {!hideHelperText && formSubmitted && handleError && (
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
