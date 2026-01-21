'use client';

import * as React from 'react';
import { useCallback, useId, useState } from 'react';
import { AUTH_CLASSES } from '@/lib/auth/constants';
import { AuthBackButton, AuthButton, FormError, OtpInput } from '../atoms';
import { ButtonSpinner } from '../ButtonSpinner';

interface VerificationStepProps {
  /**
   * The email address the code was sent to
   */
  email: string;
  /**
   * Current code value
   */
  code: string;
  /**
   * Called when code changes
   */
  onCodeChange: (code: string) => void;
  /**
   * Called when form is submitted. Returns true if successful.
   */
  onSubmit: (code: string) => Promise<boolean | void>;
  /**
   * Called when resend is requested. Returns true if successful.
   */
  onResend: () => Promise<boolean | void>;
  /**
   * Whether verification is in progress
   */
  isVerifying: boolean;
  /**
   * Whether signup completion (session propagation) is in progress
   */
  isCompleting?: boolean;
  /**
   * Whether resend is in progress
   */
  isResending: boolean;
  /**
   * Error message to display
   */
  error: string | null;
  /**
   * Called when back button is clicked
   */
  onBack: () => void;
  /**
   * Mode - affects copy
   */
  mode: 'signin' | 'signup';
}

/**
 * OTP verification step for auth flows.
 * Shared between sign-in and sign-up forms.
 */
export function VerificationStep({
  email,
  code,
  onCodeChange,
  onSubmit,
  onResend,
  isVerifying,
  isCompleting = false,
  isResending,
  error,
  onBack,
  mode,
}: VerificationStepProps) {
  const [resendSuccess, setResendSuccess] = useState(false);
  const errorId = useId();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (code.length !== 6) {
        return;
      }

      await onSubmit(code);
    },
    [code, onSubmit]
  );

  const handleComplete = useCallback(
    async (completedCode: string) => {
      // Auto-submit when 6 digits entered
      await onSubmit(completedCode);
    },
    [onSubmit]
  );

  const handleResend = useCallback(async () => {
    setResendSuccess(false);
    const result = await onResend();
    // If onResend returns true (success) or void (no explicit return), show success
    if (result !== false) {
      setResendSuccess(true);
      // Clear success message after 3 seconds
      setTimeout(() => setResendSuccess(false), 3000);
    }
  }, [onResend]);

  const isLoading = isVerifying || isResending;

  // Handle Escape key to go back
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onBack && !isLoading) {
        onBack();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onBack, isLoading]);

  return (
    <>
      {/* Back button - rendered outside animated container to maintain fixed viewport positioning */}
      <AuthBackButton onClick={onBack} ariaLabel='Use a different email' />

      <div className={AUTH_CLASSES.stepTransition}>
        <h1 className='text-[18px] leading-[22px] font-medium text-[#1f2023] dark:text-[#e3e4e6] mb-0 text-center'>
          Check your email
        </h1>

        <p
          className='mt-6 mb-8 text-[13px] font-[450] leading-5 text-[#6b6f76] dark:text-[#969799] text-center px-2'
          id='otp-description'
        >
          We&apos;ve sent you a 6-digit{' '}
          {mode === 'signin' ? 'login' : 'verification'} code.{' '}
          {email && (
            <>
              Please check your inbox at{' '}
              <span className='text-[#1f2023] dark:text-[#e3e4e6] font-[450] break-all'>
                {email}
              </span>
              .
            </>
          )}
          {!email && <>Codes expire after 10 minutes.</>}
        </p>

        <form onSubmit={handleSubmit} className='space-y-6'>
          <div>
            <label className='sr-only' htmlFor='otp-input'>
              Verification code
            </label>
            <OtpInput
              value={code}
              onChange={onCodeChange}
              onComplete={handleComplete}
              disabled={isLoading}
              error={!!error}
              errorId={error ? errorId : undefined}
              aria-label='Enter 6-digit verification code'
            />

            <FormError message={error} id={errorId} />

            {resendSuccess && !error && (
              <p className='mt-3 text-sm text-green-600 dark:text-green-400 text-center animate-in fade-in-0 duration-200'>
                New code sent! Check your email.
              </p>
            )}
          </div>

          <AuthButton
            type='submit'
            variant='primary'
            disabled={isLoading || code.length !== 6}
            aria-busy={isVerifying}
            className='touch-manipulation select-none [-webkit-tap-highlight-color:transparent] active:scale-[0.98] transition-transform duration-150'
          >
            {isCompleting ? (
              <>
                <ButtonSpinner />
                <span>Completing signup...</span>
              </>
            ) : isVerifying ? (
              <>
                <ButtonSpinner />
                <span>Verifying...</span>
              </>
            ) : (
              'Verify code'
            )}
          </AuthButton>

          <div className='flex items-center justify-center gap-2 text-[13px] font-[450]'>
            <span className='text-[#6b6f76] dark:text-[#969799]'>
              Didn&apos;t receive it?
            </span>
            <button
              type='button'
              onClick={handleResend}
              disabled={isLoading}
              className='text-[#1f2023] dark:text-[#e3e4e6] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6c78e6]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f5f5] dark:focus-visible:ring-offset-[#090909] rounded-md disabled:opacity-50 disabled:cursor-not-allowed'
            >
              {isResending ? 'Sending...' : 'Resend code'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
