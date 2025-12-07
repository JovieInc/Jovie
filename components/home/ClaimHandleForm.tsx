'use client';

import { useAuth } from '@clerk/nextjs';
import { Button } from '@jovie/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/atoms/Input';
import { ErrorSummary } from '@/components/organisms/ErrorSummary';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { APP_URL } from '@/constants/app';

interface ClaimHandleFormProps {
  onHandleChange?: (handle: string) => void;
}

export function ClaimHandleForm({ onHandleChange }: ClaimHandleFormProps) {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shakeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Extract domain from APP_URL for display
  const displayDomain = APP_URL.replace(/^https?:\/\//, '');

  const [handle, setHandle] = useState('');
  // Navigating (redirecting after submit)
  const [navigating, setNavigating] = useState(false);
  // Live availability
  const [checkingAvail, setCheckingAvail] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [availError, setAvailError] = useState<string | null>(null);
  // UI micro-interactions
  const [isShaking, setIsShaking] = useState(false);
  const lastQueriedRef = useRef<string>('');
  // Form submission state
  const [formSubmitted, setFormSubmitted] = useState(false);

  // Better handle validation with stricter regex for lowercase a-z, 0-9, hyphen
  const handleError = useMemo(() => {
    if (!handle) return null;
    if (handle.length < 3) return 'Handle must be at least 3 characters';
    if (handle.length > 30) return 'Handle must be less than 30 characters';
    if (!/^[a-z0-9-]+$/.test(handle))
      return 'Handle can only contain lowercase letters, numbers, and hyphens';
    if (handle.startsWith('-') || handle.endsWith('-'))
      return 'Handle cannot start or end with a hyphen';
    return null;
  }, [handle]);

  // Notify parent component about handle changes
  useEffect(() => {
    if (onHandleChange) {
      onHandleChange(handle);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('jovie-hero-handle-change', {
          detail: { handle },
        })
      );
    }
  }, [handle, onHandleChange]);

  // Optimistic prefetch when handle becomes available
  useEffect(() => {
    if (available === true && handle) {
      const target = `/onboarding?handle=${encodeURIComponent(handle.toLowerCase())}`;
      router.prefetch(target);
    }
  }, [available, handle, router]);

  // Debounced live availability check (350-500ms per requirements)
  useEffect(() => {
    setAvailError(null);
    if (!handle || handleError) {
      setAvailable(null);
      setCheckingAvail(false);
      return;
    }

    const value = handle.toLowerCase();
    lastQueriedRef.current = value;
    setCheckingAvail(true);
    const controller = new AbortController();
    const id = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/handle/check?handle=${encodeURIComponent(value)}`,
          { signal: controller.signal }
        );
        const json = await res
          .json()
          .catch(() => ({ available: false, error: 'Parse error' }));
        // Ignore out-of-order responses
        if (lastQueriedRef.current !== value) return;
        if (!res.ok) {
          setAvailable(null);
          setAvailError(json?.error || 'Error checking availability');
        } else {
          setAvailable(Boolean(json?.available));
          setAvailError(null);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (lastQueriedRef.current !== value) return;
        setAvailable(null);
        setAvailError('Network error');
      } finally {
        if (lastQueriedRef.current === value) setCheckingAvail(false);
      }
    }, 450); // 450ms debounce (within 350-500ms requirement)

    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [handle, handleError]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (shakeTimeoutRef.current) {
        clearTimeout(shakeTimeoutRef.current);
      }
    };
  }, []);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormSubmitted(true);

      // Guard: invalid or unavailable or still checking
      if (handleError || checkingAvail || available !== true) {
        // Micro shake for quick feedback
        setIsShaking(true);
        if (shakeTimeoutRef.current) {
          clearTimeout(shakeTimeoutRef.current);
        }
        shakeTimeoutRef.current = setTimeout(() => {
          setIsShaking(false);
          shakeTimeoutRef.current = null;
        }, 180);

        // Focus the input for accessibility
        if (inputRef.current) {
          inputRef.current.focus();
        }

        // Announce error to screen readers
        return;
      }

      // Persist pending claim so onboarding can pick it up
      try {
        sessionStorage.setItem(
          'pendingClaim',
          JSON.stringify({ handle: handle.toLowerCase(), ts: Date.now() })
        );
      } catch {}

      const target = `/onboarding?handle=${encodeURIComponent(
        handle.toLowerCase()
      )}`;

      setNavigating(true);

      // Announce loading state to screen readers
      const loadingMessage = document.getElementById('loading-announcement');
      if (loadingMessage) {
        loadingMessage.textContent = 'Creating your profile. Please wait...';
      }

      if (!isSignedIn) {
        // Send users to waitlist; early access is invite-only
        router.push('/waitlist');
        return;
      }

      router.push(target);
    },
    [available, checkingAvail, handle, handleError, isSignedIn, router]
  );

  // Button state logic with "Create Profile" copy
  const showChecking = checkingAvail;
  const unavailable = available === false || !!handleError || !!availError;
  const canSubmit = available === true && !checkingAvail && !navigating;
  // Previously used a color prop to swap tones; now rely on variant styling only
  const btnDisabled = !canSubmit;

  const fieldId = 'handle-input';
  const helperId = `${fieldId}-hint`;

  // Collect all form errors for the error summary
  const formErrors = useMemo(() => {
    const errors: Record<string, string> = {};

    if (formSubmitted) {
      if (handleError) {
        errors.handle = handleError;
      } else if (availError) {
        errors.handle = availError;
      } else if (available === false) {
        errors.handle = 'Handle already taken';
      }
    }

    return errors;
  }, [formSubmitted, handleError, availError, available]);

  // Status icon to show inside the input
  const StatusIcon = () => {
    if (showChecking) {
      return (
        <LoadingSpinner
          size='sm'
          className='text-zinc-500 dark:text-zinc-400'
        />
      );
    }
    if (!handle) return null;
    if (available === true && !handleError) {
      return (
        <svg
          className='h-4 w-4 text-green-600'
          viewBox='0 0 20 20'
          fill='currentColor'
          aria-hidden='true'
        >
          <path
            fillRule='evenodd'
            d='M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 10-1.214-.882l-3.2 4.4-1.63-1.63a.75.75 0 10-1.06 1.06l2.25 2.25a.75.75 0 001.145-.089l3.71-5.109z'
            clipRule='evenodd'
          />
        </svg>
      );
    }
    if (unavailable) {
      return (
        <svg
          className='h-4 w-4 text-red-600'
          viewBox='0 0 20 20'
          fill='currentColor'
          aria-hidden='true'
        >
          <path
            fillRule='evenodd'
            d='M10 18a8 8 0 100-16 8 8 0 000 16zM7.75 7.75a.75.75 0 011.06 0L10 8.94l1.19-1.19a.75.75 0 111.06 1.06L11.06 10l1.19 1.19a.75.75 0 11-1.06 1.06L10 11.06l-1.19 1.19a.75.75 0 11-1.06-1.06L8.94 10 7.75 8.81a.75.75 0 010-1.06z'
            clipRule='evenodd'
          />
        </svg>
      );
    }
    return null;
  };

  const helperState = useMemo(() => {
    if (!handle) {
      return {
        tone: 'idle' as const,
        text: `Your Jovie profile will live at ${displayDomain}/your-handle`,
      };
    }

    if (handleError) {
      return { tone: 'error' as const, text: handleError };
    }

    if (checkingAvail) {
      return { tone: 'pending' as const, text: 'Checking availability…' };
    }

    if (available === true) {
      return {
        tone: 'success' as const,
        text: `@${handle} is available — tap the button to claim it.`,
      };
    }

    if (available === false) {
      return { tone: 'error' as const, text: 'Handle already taken' };
    }

    if (availError) {
      return { tone: 'error' as const, text: availError };
    }

    return {
      tone: 'idle' as const,
      text: 'Use lowercase letters, numbers, or hyphens (3–30 chars).',
    };
  }, [
    available,
    availError,
    checkingAvail,
    displayDomain,
    handle,
    handleError,
  ]);

  const helperToneClass = {
    idle: 'text-gray-600 dark:text-gray-300',
    pending: 'text-gray-600 dark:text-gray-300',
    success: 'text-emerald-600 dark:text-emerald-400',
    error: 'text-red-600 dark:text-red-400',
  }[helperState.tone];

  const helperAriaLive = helperState.tone === 'error' ? 'assertive' : 'polite';
  return (
    <form ref={formRef} onSubmit={onSubmit} className='space-y-4' noValidate>
      {/* Screen reader announcements */}
      <div
        className='sr-only'
        aria-live='assertive'
        aria-atomic='true'
        id='loading-announcement'
      ></div>

      {/* Error summary for screen readers */}
      <ErrorSummary
        errors={formErrors}
        onFocusField={fieldName => {
          if (fieldName === 'handle' && inputRef.current) {
            inputRef.current.focus();
          }
        }}
      />

      <div className='space-y-2'>
        <label
          htmlFor={fieldId}
          className='text-sm font-semibold text-gray-900 dark:text-white'
        >
          Choose your handle
        </label>

        <div className='relative'>
          <span className='pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-700 dark:text-gray-200'>
            {displayDomain}/
          </span>
          <Input
            ref={inputRef}
            id={fieldId}
            type='text'
            value={handle}
            onChange={e => setHandle(e.target.value.toLowerCase())}
            placeholder='your-handle'
            required
            autoCapitalize='none'
            autoCorrect='off'
            aria-describedby={helperState.text ? helperId : undefined}
            validationState={
              !handle
                ? null
                : unavailable
                  ? 'invalid'
                  : available === true
                    ? 'valid'
                    : checkingAvail
                      ? 'pending'
                      : null
            }
            className={`${isShaking ? 'jv-shake' : ''} ${
              available === true ? 'jv-available' : ''
            } transition-all duration-150 hover:shadow-lg focus-within:shadow-lg`}
            inputClassName='text-[16px] leading-6 tracking-tight font-medium placeholder:text-zinc-400 dark:placeholder:text-zinc-500 pr-12 min-h-[54px] sm:min-h-[56px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 border-2 border-zinc-900/70 dark:border-white/60 bg-white/90 dark:bg-white/10 pl-24 sm:pl-28'
            statusIcon={<StatusIcon />}
          />
        </div>

        {helperState.text && (
          <div id='handle-preview-text' className='min-h-5'>
            <p
              id={helperId}
              className={`text-sm leading-5 transition-colors duration-200 ${helperToneClass}`}
              aria-live={helperAriaLive}
            >
              {helperState.text}
            </p>
          </div>
        )}
      </div>

      {/* Submit button - separate from input for clean UX */}
      <Button
        type='submit'
        variant='primary'
        size='lg'
        className='w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 group h-[54px]! px-6! text-base font-semibold tracking-wide bg-linear-to-br! from-blue-600/95! via-indigo-600/85! to-cyan-500/90! text-white! shadow-[0_18px_35px_rgba(15,23,42,0.25)]'
        disabled={btnDisabled || !handle}
      >
        <span className='inline-flex items-center justify-center gap-2 transition-opacity duration-200'>
          {showChecking ? (
            <>
              <LoadingSpinner size='sm' className='text-white' />
              <span>Checking availability…</span>
            </>
          ) : navigating ? (
            <>
              <LoadingSpinner size='sm' className='text-white' />
              <span>Creating your profile…</span>
            </>
          ) : available === true ? (
            <>
              <span>Claim @{handle}</span>
              <svg
                className='w-4 h-4 transition-transform group-hover:translate-x-1'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M9 5l7 7-7 7'
                />
              </svg>
            </>
          ) : (
            'Request Early Access'
          )}
        </span>
      </Button>

      <style jsx>{`
        .jv-shake {
          animation: jv-shake 150ms ease-in-out;
        }
        @keyframes jv-shake {
          0%,
          100% {
            transform: translateX(0);
          }
          25% {
            transform: translateX(-2px);
          }
          50% {
            transform: translateX(2px);
          }
          75% {
            transform: translateX(-2px);
          }
        }
        .jv-available {
          box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.35);
          animation: jv-available-pulse 900ms ease-out 1;
        }
        @keyframes jv-available-pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4);
          }
          70% {
            box-shadow: 0 0 0 8px rgba(16, 185, 129, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
          }
        }
      `}</style>
    </form>
  );
}
