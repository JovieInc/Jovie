'use client';

import { useAuth } from '@clerk/nextjs';
import { Button, Input } from '@jovie/ui';
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
import { ErrorSummary } from '@/components/organisms/ErrorSummary';
import { BASE_URL } from '@/constants/app';
import { cn } from '@/lib/utils';
import { ClaimHandleStyles } from './ClaimHandleStyles';
import { HandleStatusIcon } from './HandleStatusIcon';
import type { ClaimHandleFormProps } from './types';
import { useHandleValidation } from './useHandleValidation';
import { HELPER_TONE_CLASSES, useHelperState } from './useHelperState';

const getFormErrors = ({
  formSubmitted,
  handleError,
  availError,
  available,
}: {
  formSubmitted: boolean;
  handleError: string | null;
  availError: string | null;
  available: boolean | null;
}) => {
  const errors: Record<string, string> = {};

  if (!formSubmitted) {
    return errors;
  }

  if (handleError) {
    errors.handle = handleError;
  } else if (availError) {
    errors.handle = availError;
  } else if (available === false) {
    errors.handle = 'Handle already taken';
  }

  return errors;
};

const getValidationState = ({
  handle,
  unavailable,
  available,
  checkingAvail,
}: {
  handle: string;
  unavailable: boolean;
  available: boolean | null;
  checkingAvail: boolean;
}) => {
  if (!handle) return null;
  if (unavailable) return 'invalid';
  if (available === true) return 'valid';
  if (checkingAvail) return 'pending';
  return null;
};

const getInputClassName = ({
  isShaking,
  available,
}: {
  isShaking: boolean;
  available: boolean | null;
}) =>
  cn(
    isShaking && 'jv-shake',
    available === true && 'jv-available',
    'transition-all duration-150 hover:shadow-lg focus-within:shadow-lg'
  );

const getButtonContent = ({
  showChecking,
  navigating,
  available,
  handle,
}: {
  showChecking: boolean;
  navigating: boolean;
  available: boolean | null;
  handle: string;
}): ReactNode => {
  if (showChecking) {
    return (
      <>
        <LoadingSpinner size='sm' className='text-white' />
        <span>Checking availability…</span>
      </>
    );
  }

  if (navigating) {
    return (
      <>
        <LoadingSpinner size='sm' className='text-white' />
        <span>Creating your profile…</span>
      </>
    );
  }

  if (available === true) {
    return (
      <>
        <span>Claim @{handle}</span>
        <ChevronRight
          className='w-4 h-4 transition-transform group-hover:translate-x-1'
          aria-hidden='true'
        />
      </>
    );
  }

  return 'Request Early Access';
};

export function ClaimHandleForm({
  onHandleChange,
}: Readonly<ClaimHandleFormProps>) {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shakeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const displayDomain = BASE_URL.replace(/^https?:\/\//, '');

  const [handle, setHandle] = useState('');
  const [navigating, setNavigating] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);

  const { handleError, checkingAvail, available, availError } =
    useHandleValidation(handle);

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

      if (handleError || checkingAvail || available !== true) {
        setIsShaking(true);
        if (shakeTimeoutRef.current) {
          clearTimeout(shakeTimeoutRef.current);
        }
        shakeTimeoutRef.current = setTimeout(() => {
          setIsShaking(false);
          shakeTimeoutRef.current = null;
        }, 180);

        if (inputRef.current) {
          inputRef.current.focus();
        }
        return;
      }

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

      const loadingMessage = document.getElementById('loading-announcement');
      if (loadingMessage) {
        loadingMessage.textContent = 'Creating your profile. Please wait...';
      }

      if (!isSignedIn) {
        router.push('/waitlist');
        return;
      }

      router.push(target);
    },
    [available, checkingAvail, handle, handleError, isSignedIn, router]
  );

  const showChecking = checkingAvail;
  const unavailable = available === false || !!handleError || !!availError;
  const canSubmit = available === true && !checkingAvail && !navigating;
  const btnDisabled = !canSubmit;

  const fieldId = 'handle-input';
  const helperId = `${fieldId}-hint`;

  const formErrors = useMemo(() => {
    return getFormErrors({
      formSubmitted,
      handleError,
      availError,
      available,
    });
  }, [formSubmitted, handleError, availError, available]);

  const helperState = useHelperState({
    handle,
    handleError,
    checkingAvail,
    available,
    availError,
    displayDomain,
  });

  const helperToneClass = HELPER_TONE_CLASSES[helperState.tone];
  const helperAriaLive = helperState.tone === 'error' ? 'assertive' : 'polite';

  return (
    <form ref={formRef} onSubmit={onSubmit} className='space-y-4' noValidate>
      <div
        className='sr-only'
        aria-live='assertive'
        aria-atomic='true'
        id='loading-announcement'
      ></div>

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
            validationState={getValidationState({
              handle,
              unavailable,
              available,
              checkingAvail,
            })}
            className={cn(
              getInputClassName({ isShaking, available }),
              'text-[16px] leading-6 tracking-tight font-medium placeholder:text-zinc-400 dark:placeholder:text-zinc-500 pr-12 min-h-[54px] sm:min-h-[56px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 border-2 border-zinc-900/70 dark:border-white/60 bg-white/90 dark:bg-white/10 pl-24 sm:pl-28'
            )}
            statusIcon={
              <HandleStatusIcon
                showChecking={showChecking}
                handle={handle}
                available={available}
                handleError={handleError}
                unavailable={unavailable}
              />
            }
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

      <Button
        type='submit'
        variant='primary'
        size='lg'
        className='w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 group h-[54px]! px-6! text-base font-semibold tracking-wide bg-linear-to-br! from-blue-600/95! via-indigo-600/85! to-cyan-500/90! text-white! shadow-[0_18px_35px_rgba(15,23,42,0.25)]'
        disabled={btnDisabled || !handle}
      >
        <span className='inline-flex items-center justify-center gap-2 transition-opacity duration-200'>
          {getButtonContent({
            showChecking,
            navigating,
            available,
            handle,
          })}
        </span>
      </Button>

      <ClaimHandleStyles />
    </form>
  );
}
