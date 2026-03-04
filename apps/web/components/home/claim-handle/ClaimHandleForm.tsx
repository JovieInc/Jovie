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
  const _shakeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  useEffect(() => {
    return () => {
      // Cleanup if necessary
    };
  }, []);

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
    // The input-adjacent HandleStatusIcon already shows a spinner while checking,
    // so the button only shows a spinner during navigation (post-submit).
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
  }, [navigating, available, handle]);

  return (
    <form onSubmit={onSubmit} className='w-full' noValidate>
      {/* Input row — matches HeroSpotifySearch layout */}
      <div
        className={cn(
          'flex w-full items-center gap-3 rounded-[20px] border p-2',
          'transition-all duration-300',
          'border-(--linear-border-default) bg-(--linear-bg-surface-0) shadow-[inset_0_1px_3px_rgba(0,0,0,0.15),0_0_0_1px_var(--linear-border-subtle)]',
          'focus-within:border-(--linear-text-primary) focus-within:shadow-[0_0_0_1px_var(--linear-text-primary)]',
          available === true &&
            'border-(--linear-success) focus-within:border-(--linear-success) focus-within:shadow-[0_0_0_1px_var(--linear-success)]'
        )}
        style={{ minHeight: 64 }}
      >
        <div className='flex items-center flex-1 min-w-0 px-4 gap-2'>
          <span
            className='shrink-0 select-none'
            style={{
              fontSize: '15px',
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
            placeholder='your-name'
            required
            autoCapitalize='none'
            autoCorrect='off'
            autoComplete='off'
            aria-label='Choose your handle'
            aria-describedby={helperState.text ? 'handle-hint' : undefined}
            className='min-w-0 flex-1 bg-transparent text-sm text-primary-token focus-visible:outline-none placeholder:text-tertiary-token/50'
            style={{
              fontSize: '15px',
              fontWeight: 500,
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
        </div>

        <button
          type='submit'
          className={cn(
            'group shrink-0 inline-flex items-center justify-center gap-1.5 rounded-[14px] px-6 text-[15px] font-medium transition-all duration-300 focus-ring-themed',
            navigating || checkingAvail
              ? 'bg-surface-2 text-tertiary-token cursor-not-allowed'
              : 'bg-[var(--linear-text-primary)] text-[var(--linear-bg-page)] shadow-[0_2px_10px_rgba(255,255,255,0.15)] hover:scale-[1.02] hover:shadow-[0_4px_20px_rgba(255,255,255,0.25)]'
          )}
          style={{ height: 48 }}
        >
          <span className='inline-flex items-center gap-1.5'>
            {buttonContent}
          </span>
        </button>
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
