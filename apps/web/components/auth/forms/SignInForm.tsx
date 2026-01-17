'use client';

import { Card, CardContent } from '@jovie/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { useLastAuthMethod } from '@/hooks/useLastAuthMethod';
import { useSignInFlow } from '@/hooks/useSignInFlow';
import { AUTH_STORAGE_KEYS } from '@/lib/auth/constants';
import { AccessibleStepWrapper } from '../AccessibleStepWrapper';
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
  const [isClerkStalled, setIsClerkStalled] = useState(false);

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

  // Handle email query parameter (e.g., from signup redirect)
  useEffect(() => {
    if (hasHandledEmailParam.current) return;
    const emailParam = searchParams.get('email');
    if (emailParam && emailParam.includes('@')) {
      hasHandledEmailParam.current = true;
      setEmail(emailParam);
      setStep('email');
    }
  }, [searchParams, setEmail, setStep]);

  useEffect(() => {
    if (isLoaded) {
      setIsClerkStalled(false);
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setIsClerkStalled(true);
    }, 4000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [isLoaded]);

  // Show loading skeleton while Clerk initializes
  if (!isLoaded) {
    return (
      <Card className='shadow-none border-0 bg-transparent p-0'>
        <CardContent className='space-y-3 p-0'>
          <div className='space-y-4'>
            <div className='flex items-center justify-center gap-3 text-sm text-secondary-token'>
              <LoadingSpinner size='sm' tone='muted' />
              <span>Loading sign-in</span>
            </div>
            <div className='animate-pulse space-y-4'>
              <div className='h-6 w-48 mx-auto bg-subtle rounded' />
              <div className='h-12 w-full bg-subtle rounded-[--radius-xl]' />
              <div className='h-12 w-full bg-subtle rounded-[--radius-xl]' />
              <div className='h-12 w-full bg-subtle rounded-[--radius-xl]' />
            </div>
            {isClerkStalled ? (
              <div className='rounded-[--radius-xl] border border-subtle bg-surface-0 px-4 py-3 text-[13px] text-secondary-token text-center'>
                <p>Hang tight — sign-in is taking longer than usual.</p>
                <p className='mt-2'>
                  Refresh the page or try again in a minute.
                </p>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
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
              onBack={handleBack}
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
              onBack={handleBack}
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
