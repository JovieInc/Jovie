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
  const shakeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const displayDomain = BASE_URL.replace(/^https?:\/\//, '');

  const [handle, setHandle] = useState('');
  const [navigating, setNavigating] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
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

  useEffect(() => {
    return () => {
      if (shakeTimeoutRef.current) clearTimeout(shakeTimeoutRef.current);
    };
  }, []);

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setFormSubmitted(true);

      if (handleError || checkingAvail || available !== true) {
        setIsShaking(true);
        if (shakeTimeoutRef.current) clearTimeout(shakeTimeoutRef.current);
        shakeTimeoutRef.current = setTimeout(() => {
          setIsShaking(false);
          shakeTimeoutRef.current = null;
        }, 180);
        inputRef.current?.focus();
        return;
      }

      try {
        sessionStorage.setItem(
          'pendingClaim',
          JSON.stringify({ handle: handle.toLowerCase(), ts: Date.now() })
        );
      } catch {}

      const target = `/onboarding?handle=${encodeURIComponent(handle.toLowerCase())}`;
      setNavigating(true);

      if (!isSignedIn) {
        router.push(`/signup?redirect_url=${encodeURIComponent(target)}`);
        return;
      }

      router.push(target);
    },
    [available, checkingAvail, handle, handleError, isSignedIn, router]
  );

  const showChecking = checkingAvail;
  const unavailable = available === false || !!handleError || !!availError;
  const canSubmit = available === true && !checkingAvail && !navigating;

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
    if (showChecking) {
      return (
        <>
          <div className='h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent motion-reduce:animate-none' />
          <span>Checking…</span>
        </>
      );
    }
    if (navigating) {
      return (
        <>
          <div className='h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent motion-reduce:animate-none' />
          <span>Creating…</span>
        </>
      );
    }
    if (available === true) {
      return (
        <>
          <span>Claim @{handle}</span>
          <ChevronRight
            className='h-4 w-4 transition-transform group-hover:translate-x-0.5'
            aria-hidden='true'
          />
        </>
      );
    }
    return 'Claim handle';
  }, [showChecking, navigating, available, handle]);

  return (
    <form onSubmit={onSubmit} className='w-full' noValidate>
      {/* Input row — matches HeroSpotifySearch layout */}
      <div
        className={cn(
          'flex w-full items-center gap-3 rounded-xl border px-4 py-3',
          'transition-all duration-200',
          'border-strong bg-surface-0 hover:border-focus',
          isShaking && 'jv-shake',
          available === true && 'border-[var(--linear-success)]'
        )}
        style={{ minHeight: 48 }}
      >
        <span
          className='shrink-0 select-none'
          style={{
            fontSize: '13px',
            fontWeight: 510,
            color: 'var(--linear-text-tertiary)',
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
          placeholder='your-handle'
          required
          autoCapitalize='none'
          autoCorrect='off'
          autoComplete='off'
          aria-label='Choose your handle'
          aria-describedby={helperState.text ? 'handle-hint' : undefined}
          className='min-w-0 flex-1 bg-transparent text-sm text-primary-token focus-visible:outline-none'
          style={{
            fontSize: '14px',
            fontWeight: 450,
            letterSpacing: '-0.01em',
          }}
        />

        <HandleStatusIcon
          showChecking={showChecking}
          handle={handle}
          available={available}
          handleError={handleError}
          unavailable={unavailable}
        />

        {handle && (
          <button
            type='submit'
            disabled={!canSubmit}
            className={cn(
              'group shrink-0 inline-flex items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors focus-ring-themed',
              canSubmit
                ? 'bg-btn-primary text-btn-primary-foreground'
                : 'bg-btn-primary/50 text-btn-primary-foreground/60 cursor-not-allowed'
            )}
            style={{ height: 32 }}
          >
            <span className='inline-flex items-center gap-1.5'>
              {buttonContent}
            </span>
          </button>
        )}
      </div>

      {/* Helper text */}
      {helperState.text && (
        <p
          id='handle-hint'
          className={cn(
            'mt-2 text-sm transition-colors duration-200',
            helperToneClass
          )}
          aria-live={helperState.tone === 'error' ? 'assertive' : 'polite'}
          style={{
            fontSize: '13px',
            lineHeight: '20px',
            letterSpacing: '-0.01em',
          }}
        >
          {helperState.text}
        </p>
      )}

      {/* Error summary for form validation */}
      {formSubmitted && handleError && (
        <p
          className='mt-1.5'
          style={{
            fontSize: '12px',
            color: 'var(--linear-warning)',
          }}
          role='alert'
        >
          {handleError}
        </p>
      )}
    </form>
  );
}
