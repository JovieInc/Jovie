'use client';

import { Card, CardContent } from '@jovie/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useAuthPageSetup } from '@/hooks/useAuthPageSetup';
import { useLastAuthMethod } from '@/hooks/useLastAuthMethod';
import { useLoadingStall } from '@/hooks/useLoadingStall';
import { useSignInFlow } from '@/hooks/useSignInFlow';
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

  // Shared auth page setup (hash cleanup, redirect URL storage)
  useAuthPageSetup();

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
