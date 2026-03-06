'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { useAuthPageSetup } from '@/hooks/useAuthPageSetup';
import { useLoadingStall } from '@/hooks/useLoadingStall';
import { useSignUpFlow } from '@/hooks/useSignUpFlow';
import { getOAuthErrorMessage } from '@/lib/auth/clerk-errors';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';
import { AccessibleStepWrapper } from '../AccessibleStepWrapper';
import { AuthLoadingState } from '../AuthLoadingState';
import { EmailStep } from './EmailStep';
import { MethodSelector } from './MethodSelector';
import { VerificationStep } from './VerificationStep';

/**
 * Sign-up form using Clerk Core API.
 * Replaces the old Clerk Elements-based OtpSignUpForm.
 */
export function SignUpForm() {
  const {
    isLoaded,
    step,
    setStep,
    email,
    setEmail,
    code,
    setCode,
    loadingState,
    error,
    clearError,
    shouldSuggestSignIn,
    oauthFailureProvider,
    startEmailFlow,
    verifyCode,
    resendCode,
    startOAuth,
    goBack,
  } = useSignUpFlow();

  const router = useRouter();
  const searchParams = useSearchParams();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isClerkStalled = useLoadingStall(isLoaded);

  // Shared auth page setup (hash cleanup, redirect URL storage)
  useAuthPageSetup();

  // Build sign-in URL with email and redirect preserved
  const buildSignInUrl = useCallback(
    (emailToPass: string) => {
      const signInUrl = new URL(APP_ROUTES.SIGNIN, globalThis.location.origin);
      // Pass email to prefill sign-in form
      if (emailToPass) {
        signInUrl.searchParams.set('email', emailToPass);
      }
      // Preserve original redirect URL (sanitized to strip hash fragments)
      const redirectUrl = searchParams.get('redirect_url');
      const sanitized = sanitizeRedirectUrl(redirectUrl);
      if (sanitized) {
        signInUrl.searchParams.set('redirect_url', sanitized);
      }
      return signInUrl.pathname + signInUrl.search;
    },
    [searchParams]
  );

  // Auto-redirect to sign-in when account already exists
  useEffect(() => {
    if (shouldSuggestSignIn && email && !isRedirecting) {
      setIsRedirecting(true);
      // Small delay so user can see the message before redirecting
      redirectTimerRef.current = setTimeout(() => {
        router.push(buildSignInUrl(email));
      }, 1500);
    }

    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, [shouldSuggestSignIn, email, router, buildSignInUrl, isRedirecting]);

  // Show loading skeleton while Clerk initializes
  if (!isLoaded) {
    return <AuthLoadingState mode='signup' isStalled={isClerkStalled} />;
  }

  const handleEmailClick = () => {
    clearError();
    setStep('email');
  };

  return (
    <div className='w-full'>
      <div className='space-y-3'>
        {/* Method selection step */}
        {step === 'method' && (
          <>
            <MethodSelector
              onEmailClick={handleEmailClick}
              onGoogleClick={startOAuth}
              loadingState={loadingState}
              mode='signup'
              error={step === 'method' && oauthFailureProvider ? null : error}
            />

            {error && oauthFailureProvider && (
              <div
                className='rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-left space-y-3 animate-in fade-in-0 slide-in-from-top-2 duration-300'
                role='alert'
              >
                <p className='text-sm font-medium text-destructive'>
                  {getOAuthErrorMessage(error, 'Google')}
                </p>
                <p className='text-sm text-[#4c515a] dark:text-[#a8aaad]'>
                  Try another sign-up method to keep going right away.
                </p>
                <div className='flex flex-col gap-2 sm:flex-row sm:flex-wrap'>
                  <button
                    type='button'
                    onClick={() => startOAuth('google')}
                    className='text-sm font-medium text-primary-token hover:underline focus-ring-themed rounded-md text-left'
                  >
                    Try Google again
                  </button>
                  <button
                    type='button'
                    onClick={handleEmailClick}
                    className='text-sm font-medium text-primary-token hover:underline focus-ring-themed rounded-md text-left'
                  >
                    Continue with email
                  </button>
                </div>
                <p className='text-xs text-[#6b6f76] dark:text-[#969799]'>
                  Details: {error}
                </p>
              </div>
            )}
          </>
        )}

        {/* Email input step */}
        {step === 'email' && (
          <AccessibleStepWrapper
            currentStep={1}
            totalSteps={2}
            stepTitle='Enter your email'
          >
            <EmailStep
              email={email}
              onEmailChange={setEmail}
              onSubmit={startEmailFlow}
              isLoading={loadingState.type === 'submitting'}
              error={error}
              onBack={goBack}
              mode='signup'
            />
          </AccessibleStepWrapper>
        )}

        {/* Verification step */}
        {step === 'verification' && (
          <AccessibleStepWrapper
            currentStep={2}
            totalSteps={2}
            stepTitle='Enter verification code'
          >
            <VerificationStep
              email={email}
              code={code}
              onCodeChange={setCode}
              onSubmit={verifyCode}
              onResend={resendCode}
              isVerifying={
                loadingState.type === 'verifying' ||
                loadingState.type === 'completing'
              }
              isCompleting={loadingState.type === 'completing'}
              isResending={loadingState.type === 'resending'}
              error={error}
              onBack={goBack}
              mode='signup'
            />
          </AccessibleStepWrapper>
        )}

        {/* Sign in suggestion when account exists - auto-redirects */}
        {shouldSuggestSignIn && step === 'email' && (
          <p className='text-sm text-secondary-token text-center mt-4'>
            {isRedirecting ? (
              <>Redirecting to sign in&hellip;</>
            ) : (
              <>
                Account already exists.{' '}
                <Link
                  href={buildSignInUrl(email)}
                  className='text-primary-token underline focus-ring-themed rounded-md'
                >
                  Sign in instead
                </Link>
              </>
            )}
          </p>
        )}

        {step === 'method' && (
          <p className='mt-4 text-[11px] leading-relaxed text-[#6b6f76] dark:text-[#969799] text-center'>
            By signing up, you agree to our{' '}
            <Link
              href={APP_ROUTES.LEGAL_TERMS}
              className='underline hover:text-[#1f2023] dark:hover:text-[#e3e4e6] focus-ring-themed rounded-md'
            >
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link
              href={APP_ROUTES.LEGAL_PRIVACY}
              className='underline hover:text-[#1f2023] dark:hover:text-[#e3e4e6] focus-ring-themed rounded-md'
            >
              Privacy Policy
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
