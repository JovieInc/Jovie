'use client';

import { Button } from '@jovie/ui';
import { useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthInput, FormError, OtpInput } from '@/features/auth/atoms';
import { useAuthSafe } from '@/hooks/useClerkSafe';
import { getClientAuthenticatedAuthEntryRedirect } from '@/lib/auth/access-route-redirect';
import { authClient } from '@/lib/auth/client';
import { AUTH_CLASSES } from '@/lib/auth/constants';
import { logger } from '@/lib/utils/logger';
import type { AuthShellMode } from './AuthShell';

/**
 * Email one-time-code auth flow for the canonical AuthShell (Clerk → Better
 * Auth migration, client-flip commit ⑦).
 *
 * Plan decision 8: `EmailCodeAuthForm` → `emailOtp.sendVerificationOtp` +
 * `signIn.emailOtp`. Email (`emailOtp`) auth is intentionally enabled
 * (founder decision, 2026-06). Password auth remains intentionally unsupported.
 *
 * Plan design rows 17-18:
 * - Row 17: Better Auth `signIn.emailOtp` auto-creates users by default. The
 *   cross-mode nudges ("No account found… create below") are intentionally
 *   retired — waitlist gates downstream; documented product-behavior change.
 * - Row 18: OTP lockout state + timer-gated resend + full code→copy table
 *   (INVALID_OTP, OTP_EXPIRED, MAX_ATTEMPTS lockout with "Request a new
 *   code", send-failure, rate-limited). `allowedAttempts: 5` is set on the
 *   server plugin (better-auth.ts); this form surfaces the lockout state.
 */

type EmailCodeStep = 'email' | 'code' | 'locked';

interface EmailCodeAuthFormProps {
  /** Which auth flow to drive. */
  readonly mode: AuthShellMode;
  /** Where to navigate after the session is finalized. */
  readonly redirectUrl: string;
  /** Optional email prefill (e.g. from `?email=` deep links). */
  readonly initialEmailAddress?: string;
  /**
   * Notifies the parent (`AuthShell`) when the OTP code-entry step becomes
   * active so One Tap can be suppressed (plan design row 20). Called with
   * `true` when the step transitions to `'code'` or `'locked'`, `false` when
   * it transitions back to `'email'`.
   */
  readonly onOtpStepChange?: (active: boolean) => void;
}

// ============================================================================
// Code → copy table (plan design row 18)
// ============================================================================
// Better Auth error codes mapped to user-facing messages. The lockout state
// (MAX_ATTEMPTS) surfaces a "Request a new code" affordance that resets the
// flow back to the email step.

const SEND_ERROR_COPY: Record<string, string> = {
  rate_limit_exceeded: 'Too many requests. Please wait a moment and try again.',
  form_param_format_invalid:
    'That email address doesn’t look right. Check it and try again.',
};

const VERIFY_ERROR_COPY: Record<string, string> = {
  invalid_otp: 'That code is incorrect. Check your email and try again.',
  otp_expired: 'That code has expired. Send a new one and try again.',
  max_attempts_reached:
    'Too many incorrect attempts. Request a new code to try again.',
  rate_limit_exceeded: 'Too many attempts. Please wait a moment and try again.',
};

function readErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as { code?: unknown; message?: unknown };
  if (typeof candidate.code === 'string') return candidate.code;
  if (typeof candidate.message === 'string') {
    // Better Auth errors sometimes carry the code in `message` as
    // `"code: ..."` — fall through to that.
    const match = candidate.message.match(/^([a-z_]+):/i);
    if (match) return match[1].toLowerCase();
  }
  return undefined;
}

function getSendErrorMessage(error: unknown): string {
  const code = readErrorCode(error);
  if (code && SEND_ERROR_COPY[code]) return SEND_ERROR_COPY[code];
  return 'Could not send the code. Please try again.';
}

function getVerifyErrorMessage(error: unknown): string {
  const code = readErrorCode(error);
  if (code && VERIFY_ERROR_COPY[code]) return VERIFY_ERROR_COPY[code];
  return 'Could not verify the code. Please try again.';
}

function isMaxAttemptsError(error: unknown): boolean {
  return readErrorCode(error) === 'max_attempts_reached';
}

// ============================================================================
// Resend cooldown (plan design row 18: timer-gated resend)
// ============================================================================
const RESEND_COOLDOWN_SECONDS = 30;

export function EmailCodeAuthForm({
  mode,
  redirectUrl,
  initialEmailAddress,
  onOtpStepChange,
}: EmailCodeAuthFormProps) {
  const searchParams = useSearchParams();
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuthSafe();
  const [step, setStep] = useState<EmailCodeStep>('email');
  const [emailAddress, setEmailAddress] = useState(initialEmailAddress ?? '');
  const [code, setCode] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isSignUp = mode === 'sign-up';

  const _redirectSignedInVisitor = useCallback(() => {
    const destination = getClientAuthenticatedAuthEntryRedirect(searchParams);
    globalThis.location?.assign(destination);
  }, [searchParams]);

  // Notify the parent when the OTP code-entry/lockout step is active so One
  // Tap can be suppressed (plan design row 20). `'email'` = inactive; `'code'`
  // and `'locked'` = active.
  useEffect(() => {
    onOtpStepChange?.(step !== 'email');
  }, [step, onOtpStepChange]);

  // Clear the cooldown timer on unmount.
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
      }
    };
  }, []);

  const startResendCooldown = useCallback(() => {
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
    }
    cooldownTimerRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          if (cooldownTimerRef.current) {
            clearInterval(cooldownTimerRef.current);
            cooldownTimerRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const sendCode = useCallback(async () => {
    const trimmedEmail = emailAddress.trim();
    if (!trimmedEmail || isPending || (isAuthLoaded && isSignedIn)) {
      return;
    }

    setIsPending(true);
    setErrorMessage(null);

    try {
      // `emailOtp.sendVerificationOtp({ email })` triggers the server-side
      // `sendVerificationOTP` hook (better-auth.ts) which sends the 6-digit
      // code via Resend. In E2E test mode (`E2E_TEST_MODE=1`, test-email
      // pattern only) the server returns the deterministic `424242` and
      // nothing is sent.
      await authClient.emailOtp.sendVerificationOtp({
        email: trimmedEmail,
        type: 'sign-in',
      });

      setCode('');
      setStep('code');
      startResendCooldown();
    } catch (error) {
      setErrorMessage(getSendErrorMessage(error));
      logger.warn(
        'Email OTP send failed',
        {
          mode,
          error: error instanceof Error ? error.message : String(error),
        },
        'EmailCodeAuthForm'
      );
    } finally {
      setIsPending(false);
    }
  }, [
    emailAddress,
    isAuthLoaded,
    isPending,
    isSignedIn,
    mode,
    startResendCooldown,
  ]);

  const verifyCode = useCallback(
    async (submittedCode: string) => {
      if (submittedCode.length < 6 || isPending) return;

      setIsPending(true);
      setErrorMessage(null);

      try {
        // `signIn.emailOtp({ email, otp })` verifies the code and finalizes
        // the session. Auto-creates the user if not existing (plan design
        // row 17 — waitlist gates downstream). On success the session cookie
        // is set and we hard-navigate to `redirectUrl`.
        await authClient.signIn.emailOtp({
          email: emailAddress.trim(),
          otp: submittedCode,
        });

        globalThis.location?.assign(redirectUrl);
      } catch (error) {
        if (isMaxAttemptsError(error)) {
          setStep('locked');
          setErrorMessage(null);
        } else {
          setErrorMessage(getVerifyErrorMessage(error));
        }
        setIsPending(false);
      }
    },
    [emailAddress, isPending, redirectUrl]
  );

  const handleEmailSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void sendCode();
    },
    [sendCode]
  );

  const handleCodeSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void verifyCode(code);
    },
    [code, verifyCode]
  );

  const handleBackToEmail = useCallback(() => {
    setStep('email');
    setCode('');
    setErrorMessage(null);
    setResendCooldown(0);
    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
  }, []);

  const handleResendCode = useCallback(() => {
    if (resendCooldown > 0 || isPending) return;
    void sendCode();
  }, [resendCooldown, isPending, sendCode]);

  const handleRequestNewCode = useCallback(() => {
    setStep('email');
    setCode('');
    setErrorMessage(null);
    setResendCooldown(0);
    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
  }, []);

  if (isAuthLoaded && isSignedIn) {
    return null;
  }

  if (step === 'locked') {
    return (
      <div data-auth-email-code-step='locked' className='flex flex-col gap-3'>
        <p className='text-center text-app text-primary-token'>
          Too many incorrect attempts.
        </p>
        <p className='text-center text-app text-secondary-token'>
          Request a new code to try again.
        </p>
        <Button
          type='button'
          className={AUTH_CLASSES.authCta}
          static
          onClick={handleRequestNewCode}
        >
          Request A New Code
        </Button>
      </div>
    );
  }

  if (step === 'code') {
    return (
      <form
        data-auth-email-code-step='code'
        onSubmit={handleCodeSubmit}
        className='flex flex-col gap-3'
      >
        <p className='text-center text-app text-secondary-token'>
          Enter the code sent to{' '}
          <span className='font-medium text-primary-token'>
            {emailAddress.trim()}
          </span>
        </p>
        <OtpInput
          value={code}
          onChange={setCode}
          onComplete={verifyCode}
          disabled={isPending}
          error={Boolean(errorMessage)}
          errorId='auth-email-code-error'
        />
        <FormError id='auth-email-code-error' message={errorMessage} />
        <Button
          type='submit'
          className={AUTH_CLASSES.authCta}
          static
          disabled={isPending || code.length < 6}
        >
          {isPending ? 'Verifying…' : 'Verify Code'}
        </Button>
        <div className='flex items-center justify-center gap-3'>
          <button
            type='button'
            onClick={handleBackToEmail}
            className='focus-ring-themed rounded-md text-app text-secondary-token underline underline-offset-2'
          >
            Use a different email
          </button>
          {resendCooldown > 0 ? (
            <span className='text-app text-tertiary-token' aria-live='polite'>
              Resend in {resendCooldown}s
            </span>
          ) : (
            <button
              type='button'
              onClick={handleResendCode}
              disabled={isPending}
              className='focus-ring-themed rounded-md text-app text-secondary-token underline underline-offset-2 disabled:opacity-50'
            >
              Resend code
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <form
      data-auth-email-code-step='email'
      onSubmit={handleEmailSubmit}
      className='flex flex-col gap-3'
    >
      <AuthInput
        type='email'
        name='emailAddress'
        autoComplete='email'
        inputMode='email'
        placeholder='Email address'
        aria-label='Email Address'
        value={emailAddress}
        error={Boolean(errorMessage)}
        disabled={isPending}
        onChange={event => setEmailAddress(event.target.value)}
      />
      <FormError message={errorMessage} />
      <Button
        type='submit'
        className={AUTH_CLASSES.authCta}
        static
        disabled={isPending || emailAddress.trim().length === 0}
      >
        {isPending
          ? 'Sending code…'
          : isSignUp
            ? 'Continue with Email'
            : 'Email me a Code'}
      </Button>
    </form>
  );
}
