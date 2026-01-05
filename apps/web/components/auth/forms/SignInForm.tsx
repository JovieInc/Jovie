'use client';

import { Card, CardContent } from '@jovie/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useLastAuthMethod } from '@/hooks/useLastAuthMethod';
import { useSignInFlow } from '@/hooks/useSignInFlow';
import { EmailStep } from './EmailStep';
import { MethodSelector } from './MethodSelector';
import { VerificationStep } from './VerificationStep';

const AUTH_REDIRECT_URL_STORAGE_KEY = 'jovie.auth_redirect_url';

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

  // Store redirect URL from query params on mount
  useEffect(() => {
    try {
      const redirectUrl = new URL(window.location.href).searchParams.get(
        'redirect_url'
      );
      if (redirectUrl?.startsWith('/') && !redirectUrl.startsWith('//')) {
        window.sessionStorage.setItem(
          AUTH_REDIRECT_URL_STORAGE_KEY,
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

  // Show loading skeleton while Clerk initializes
  if (!isLoaded) {
    return (
      <Card className='shadow-none border-0 bg-transparent p-0'>
        <CardContent className='space-y-3 p-0'>
          <div className='animate-pulse space-y-4'>
            <div className='h-6 w-48 mx-auto bg-subtle rounded' />
            <div className='h-12 w-full bg-subtle rounded-xl' />
            <div className='h-12 w-full bg-subtle rounded-xl' />
            <div className='h-12 w-full bg-subtle rounded-xl' />
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
          <EmailStep
            email={email}
            onEmailChange={setEmail}
            onSubmit={startEmailFlow}
            isLoading={loadingState.type === 'submitting'}
            error={error}
            onBack={handleBack}
            mode='signin'
          />
        )}

        {/* Verification step */}
        {step === 'verification' && (
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
        )}

        {/* Sign up suggestion when account not found */}
        {shouldSuggestSignUp && step === 'email' && (
          <p className='text-sm text-secondary-token text-center mt-4'>
            No account found.{' '}
            <Link
              href='/signup'
              className='text-primary-token hover:underline focus-ring-themed rounded-md'
            >
              Sign up instead
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
