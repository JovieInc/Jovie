'use client';

import { Card, CardContent } from '@jovie/ui';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLastAuthMethod } from '@/hooks/useLastAuthMethod';
import { useLoadingStall } from '@/hooks/useLoadingStall';
import { useSignUpFlow } from '@/hooks/useSignUpFlow';
import { AUTH_STORAGE_KEYS } from '@/lib/auth/constants';
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
    startEmailFlow,
    verifyCode,
    resendCode,
    startOAuth,
    goBack,
  } = useSignUpFlow();

  const router = useRouter();
  const searchParams = useSearchParams();
  const [lastAuthMethod] = useLastAuthMethod();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isClerkStalled = useLoadingStall(isLoaded);

  // Store redirect URL from query params on mount
  useEffect(() => {
    try {
      const redirectUrl = new URL(window.location.href).searchParams.get(
        'redirect_url'
      );
      if (redirectUrl?.startsWith('/') && !redirectUrl.startsWith('//')) {
        window.sessionStorage.setItem(
          AUTH_STORAGE_KEYS.REDIRECT_URL,
          redirectUrl
        );
      }
    } catch {
      // Ignore errors
    }
  }, []);

  // Build sign-in URL with email and redirect preserved
  const buildSignInUrl = useCallback(
    (emailToPass: string) => {
      const signInUrl = new URL('/signin', window.location.origin);
      // Pass email to prefill sign-in form
      if (emailToPass) {
        signInUrl.searchParams.set('email', emailToPass);
      }
      // Preserve original redirect URL
      const redirectUrl = searchParams.get('redirect_url');
      if (redirectUrl?.startsWith('/') && !redirectUrl.startsWith('//')) {
        signInUrl.searchParams.set('redirect_url', redirectUrl);
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
  }, [shouldSuggestSignIn, email, router, buildSignInUrl]);

  // Show loading skeleton while Clerk initializes
  if (!isLoaded) {
    return <AuthLoadingState mode='signup' isStalled={isClerkStalled} />;
  }

  const handleEmailClick = () => {
    clearError();
    setStep('email');
  };

  const handleBack = () => {
    goBack();
  };

  return (
    <Card className='shadow-none border-0 bg-transparent p-0'>
      <CardContent className='space-y-3 p-0'>
        {/* Method selection step */}
        {step === 'method' && (
          <MethodSelector
            onEmailClick={handleEmailClick}
            onGoogleClick={() => startOAuth('google')}
            onSpotifyClick={() => startOAuth('spotify')}
            loadingState={loadingState}
            lastMethod={lastAuthMethod}
            mode='signup'
            error={step === 'method' ? error : null}
          />
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
              onBack={handleBack}
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
              onBack={handleBack}
              mode='signup'
            />
          </AccessibleStepWrapper>
        )}

        {/* Sign in suggestion when account exists - auto-redirects */}
        {shouldSuggestSignIn && step === 'email' && (
          <p className='text-sm text-secondary-token text-center mt-4'>
            {isRedirecting ? (
              <>Redirecting to sign in…</>
            ) : (
              <>
                Account already exists.{' '}
                <Link
                  href={buildSignInUrl(email)}
                  className='text-primary-token hover:underline focus-ring-themed rounded-md'
                >
                  Sign in instead
                </Link>
              </>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
