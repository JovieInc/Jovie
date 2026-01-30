'use client';

import { Card, CardContent } from '@jovie/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useLastAuthMethod } from '@/hooks/useLastAuthMethod';
import { useLoadingStall } from '@/hooks/useLoadingStall';
import { useSignInFlow } from '@/hooks/useSignInFlow';
import { AUTH_STORAGE_KEYS, sanitizeRedirectUrl } from '@/lib/auth/constants';
import { AccessibleStepWrapper } from '../AccessibleStepWrapper';
import { AuthLoadingState } from '../AuthLoadingState';
import { EmailStep } from './EmailStep';
import { MethodSelector } from './MethodSelector';
import { VerificationStep } from './VerificationStep';

/**
 * Sign-in form using Clerk Core API.
 * Replaces the old Clerk Elements-based OtpSignInForm.
 */
export function SignInForm() {
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
    shouldSuggestSignUp,
    startEmailFlow,
    verifyCode,
    resendCode,
    startOAuth,
    goBack,
  } = useSignInFlow();

  const searchParams = useSearchParams();
  const [lastAuthMethod] = useLastAuthMethod();
  const hasHandledEmailParam = useRef(false);
  const isClerkStalled = useLoadingStall(isLoaded);

  // Handle password-related hash fragments that Clerk may add
  // Since Jovie is passwordless, we strip these invalid hashes
  useEffect(() => {
    const hash = globalThis.location.hash;
    const passwordHashFragments = [
      '#reset-password',
      '#/reset-password',
      '#forgot-password',
      '#/forgot-password',
      '#set-password',
      '#/set-password',
    ];

    if (passwordHashFragments.some(fragment => hash.startsWith(fragment))) {
      // Clear the hash from the URL without triggering a reload
      globalThis.history.replaceState(
        null,
        '',
        globalThis.location.pathname + globalThis.location.search
      );
    }
  }, []);

  // Store redirect URL from query params on mount
  useEffect(() => {
    try {
      const redirectUrl = new URL(globalThis.location.href).searchParams.get(
        'redirect_url'
      );
      const sanitized = sanitizeRedirectUrl(redirectUrl);
      if (sanitized) {
        globalThis.sessionStorage.setItem(
          AUTH_STORAGE_KEYS.REDIRECT_URL,
          sanitized
        );
      }
    } catch {
      // Ignore errors
    }
  }, []);

  // Handle email query parameter (e.g., from signup redirect)
  useEffect(() => {
    if (hasHandledEmailParam.current) return;
    const emailParam = searchParams.get('email');
    if (emailParam?.includes('@')) {
      hasHandledEmailParam.current = true;
      setEmail(emailParam);
      setStep('email');
    }
  }, [searchParams, setEmail, setStep]);

  // Show loading skeleton while Clerk initializes
  if (!isLoaded) {
    return <AuthLoadingState mode='signin' isStalled={isClerkStalled} />;
  }

  const handleEmailClick = () => {
    clearError();
    setStep('email');
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
            mode='signin'
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
              onBack={goBack}
              mode='signin'
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
              isVerifying={loadingState.type === 'verifying'}
              isResending={loadingState.type === 'resending'}
              error={error}
              onBack={goBack}
              mode='signin'
            />
          </AccessibleStepWrapper>
        )}

        {/* Sign up suggestion when account not found */}
        {shouldSuggestSignUp && step === 'email' && (
          <p className='text-[13px] font-[450] text-[#6b6f76] dark:text-[#969799] text-center mt-4'>
            No account found.{' '}
            <Link
              href='/signup'
              className='text-[#1f2023] dark:text-[#e3e4e6] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6c78e6]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f5f5] dark:focus-visible:ring-offset-[#090909] rounded-md'
            >
              Sign up instead
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
