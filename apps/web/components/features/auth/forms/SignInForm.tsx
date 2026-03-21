'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import { useAuthPageSetup } from '@/hooks/useAuthPageSetup';
import { useLoadingStall } from '@/hooks/useLoadingStall';
import { useSignInFlow } from '@/hooks/useSignInFlow';
import { AccessibleStepWrapper } from '../AccessibleStepWrapper';
import { AuthLoadingState } from '../AuthLoadingState';
import { MethodSelector } from './MethodSelector';

function AuthStepLoading() {
  return (
    <div
      aria-hidden='true'
      className='rounded-[28px] border border-subtle/60 bg-surface-0 p-6 shadow-sm'
    >
      <div className='space-y-3'>
        <div className='mx-auto h-8 w-44 skeleton rounded-md' />
        <div className='h-12 w-full skeleton rounded-xl' />
        <div className='h-12 w-full skeleton rounded-xl' />
      </div>
    </div>
  );
}

const EmailStep = dynamic(
  () => import('./EmailStep').then(mod => mod.EmailStep),
  { loading: () => <AuthStepLoading /> }
);

const VerificationStep = dynamic(
  () => import('./VerificationStep').then(mod => mod.VerificationStep),
  { loading: () => <AuthStepLoading /> }
);

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

  const hasHandledEmailParam = useRef(false);
  const isClerkStalled = useLoadingStall(isLoaded);

  // Shared auth page setup (hash cleanup, redirect URL storage)
  useAuthPageSetup();

  // Handle email query parameter (e.g., from signup redirect)
  useEffect(() => {
    if (hasHandledEmailParam.current) return;
    const emailParam = new URL(globalThis.location.href).searchParams.get(
      'email'
    );
    if (emailParam?.includes('@')) {
      hasHandledEmailParam.current = true;
      setEmail(emailParam);
      setStep('email');
    }
  }, [setEmail, setStep]);

  // Show loading skeleton while Clerk initializes
  if (!isLoaded) {
    return <AuthLoadingState mode='signin' isStalled={isClerkStalled} />;
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
          <MethodSelector
            onEmailClick={handleEmailClick}
            onGoogleClick={startOAuth}
            loadingState={loadingState}
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
            No account found with that email.
          </p>
        )}
      </div>
    </div>
  );
}
