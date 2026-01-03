'use client';

import { Card, CardContent } from '@jovie/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLastAuthMethod } from '@/hooks/useLastAuthMethod';
import { useSignUpFlow } from '@/hooks/useSignUpFlow';
import { EmailStep } from './EmailStep';
import { MethodSelector } from './MethodSelector';
import { VerificationStep } from './VerificationStep';

const AUTH_REDIRECT_URL_STORAGE_KEY = 'jovie.auth_redirect_url';

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
        {/* Global error display */}
        <div className='min-h-[24px]' role='alert' aria-live='polite'>
          {error && step === 'method' && (
            <p className='text-destructive text-sm text-center'>{error}</p>
          )}
        </div>

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
          <EmailStep
            email={email}
            onEmailChange={setEmail}
            onSubmit={startEmailFlow}
            isLoading={loadingState.type === 'submitting'}
            error={error}
            onBack={handleBack}
            mode='signup'
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
            mode='signup'
          />
        )}

        {/* Sign in suggestion when account exists - auto-redirects */}
        {shouldSuggestSignIn && step === 'email' && (
          <p className='text-sm text-secondary-token text-center mt-4'>
            {isRedirecting ? (
              <>Redirecting to sign in…</>
            ) : (
              <>
                Account already exists.{' '}
                <a
                  href={buildSignInUrl(email)}
                  className='text-primary-token hover:underline focus-ring-themed rounded-md'
                >
                  Sign in instead
                </a>
              </>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
