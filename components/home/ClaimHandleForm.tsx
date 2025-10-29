'use client';

import { useAuth } from '@clerk/nextjs';
import { Button, Input } from '@jovie/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { FormField } from '@/components/molecules/FormField';
import { ErrorSummary } from '@/components/organisms/ErrorSummary';
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
  const [copied, setCopied] = useState(false);
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
    setCopied(false);
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
        // Send users to sign up; include redirect to onboarding with handle
        router.push(`/sign-up?redirect_url=${encodeURIComponent(target)}`);
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

  const previewTone = showChecking
    ? 'text-gray-500 dark:text-gray-400'
    : available === true
      ? 'text-green-600 dark:text-green-500'
      : unavailable
        ? 'text-red-600 dark:text-red-400'
        : 'text-gray-500 dark:text-gray-400';

  const helperText = (() => {
    if (handleError) return handleError;
    if (availError) return availError;
    if (available === false) return 'Handle already taken';
    return undefined;
  })();

  const onCopyPreview = async () => {
    try {
      await navigator.clipboard.writeText(`${displayDomain}/${handle}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

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

      <FormField
        label='Choose your handle'
        error={formSubmitted ? helperText : undefined}
        helpText='Your unique identifier for your profile URL'
        id='handle-input'
        required
      >
        <Input
          ref={inputRef}
          type='text'
          value={handle}
          onChange={e => setHandle(e.target.value.toLowerCase())}
          placeholder='your-handle'
          required
          autoCapitalize='none'
          autoCorrect='off'
          variant={
            !handle
              ? 'default'
              : unavailable
                ? 'error'
                : available === true
                  ? 'success'
                  : 'default' // 'pending' state not supported, use default
          }
          className={`${isShaking ? 'jv-shake' : ''} ${available === true ? 'jv-available' : ''} transition-all duration-150 hover:shadow-lg focus-within:shadow-lg text-[16px] leading-6 tracking-tight font-medium placeholder:text-zinc-400 dark:placeholder:text-zinc-500 pr-12 min-h-[48px]`}
          statusIcon={<StatusIcon />}
        />
      </FormField>

      {/* Submit button - separate from input for clean UX */}
      <Button
        type='submit'
        variant='primary'
        size='lg'
        className='w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg active:scale-[0.98] transform-gpu group'
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
            'Enter your handle'
          )}
        </span>
      </Button>

      {/* Compact URL preview under button */}
      <div className='min-h-[1.25rem]' id='handle-preview-text'>
        {handle ? (
          <div className='flex items-center justify-between text-xs'>
            <p
              onClick={available ? onCopyPreview : undefined}
              className={`${previewTone} select-none transition-colors duration-200 ${
                available
                  ? 'cursor-pointer hover:text-green-700 dark:hover:text-green-400 active:scale-[0.98] touch-manipulation'
                  : ''
              } truncate`}
              title={
                available ? (copied ? 'Copied!' : 'Click to copy') : undefined
              }
              role={available ? 'button' : undefined}
              tabIndex={available ? 0 : undefined}
              onKeyDown={
                available
                  ? e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onCopyPreview();
                      }
                    }
                  : undefined
              }
              aria-label={
                available
                  ? `Copy profile URL ${displayDomain}/${handle}`
                  : undefined
              }
            >
              <span className='text-gray-400 dark:text-gray-500'>
                {displayDomain}/
              </span>
              <span className='font-semibold text-current'>{handle}</span>
            </p>
            {available && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition-all duration-200 ${
                  available
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                    : ''
                }`}
              >
                {copied ? (
                  <>
                    <svg
                      className='w-3 h-3'
                      fill='currentColor'
                      viewBox='0 0 20 20'
                      aria-hidden='true'
                    >
                      <path
                        fillRule='evenodd'
                        d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z'
                        clipRule='evenodd'
                      />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg
                      className='w-3 h-3'
                      fill='currentColor'
                      viewBox='0 0 20 20'
                      aria-hidden='true'
                    >
                      <path
                        fillRule='evenodd'
                        d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z'
                        clipRule='evenodd'
                      />
                    </svg>
                    Available
                  </>
                )}
              </span>
            )}
          </div>
        ) : (
          <p className='text-xs text-gray-400 dark:text-gray-500'>
            <span className='text-gray-400 dark:text-gray-500'>
              {displayDomain}/
            </span>
            <span className='text-gray-400 dark:text-gray-500'>
              your-handle
            </span>
          </p>
        )}
      </div>

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
