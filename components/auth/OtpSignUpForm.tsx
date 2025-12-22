'use client';

import * as Clerk from '@clerk/elements/common';
import * as SignUp from '@clerk/elements/sign-up';
import { useClerk } from '@clerk/nextjs';
import { Card, CardContent } from '@jovie/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AuthBackButton,
  AuthButton,
  AuthGoogleIcon,
  AuthInput,
  AuthSpotifyIcon,
  authButtonVariants,
  OtpInput,
} from './atoms';
import { ButtonSpinner } from './ButtonSpinner';

const FIELD_ERROR_CLASSES =
  'mt-3 text-sm text-destructive text-center animate-in fade-in-0 slide-in-from-top-1 duration-200';
const STEP_TRANSITION_CLASSES =
  'animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out';

// Mobile-optimized OAuth button classes with proper touch targets
const OAUTH_BUTTON_MOBILE_CLASSES =
  'touch-manipulation select-none [-webkit-tap-highlight-color:transparent] active:scale-[0.98] transition-transform duration-150';

const submitButtonClassName = authButtonVariants({ variant: 'primary' });
const secondaryButtonClassName = authButtonVariants({ variant: 'secondary' });

type AuthMethod = 'email' | 'google' | 'spotify';

const LAST_AUTH_METHOD_STORAGE_KEY = 'jovie.last_auth_method';
const AUTH_REDIRECT_URL_STORAGE_KEY = 'jovie.auth_redirect_url';

interface ClerkClientLastAuthStrategyAccess {
  client?: {
    lastAuthenticationStrategy?: string | null;
  };
}

function isAuthMethod(value: string | null): value is AuthMethod {
  return value === 'email' || value === 'google' || value === 'spotify';
}

function authMethodFromClerkLastStrategy(
  lastStrategy: string | null | undefined
): AuthMethod | null {
  if (!lastStrategy) return null;
  if (lastStrategy === 'oauth_spotify') return 'spotify';
  if (lastStrategy === 'oauth_google') return 'google';
  if (lastStrategy.startsWith('oauth_')) return null;

  if (lastStrategy.includes('email')) return 'email';
  if (lastStrategy.includes('google')) return 'google';
  return null;
}

export function OtpSignUpForm() {
  const clerk = useClerk();
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [lastAuthMethod, setLastAuthMethod] = useState<AuthMethod | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const emailFocusAttemptRef = useRef(0);

  useEffect(() => {
    try {
      const redirectUrl = new URL(window.location.href).searchParams.get(
        'redirect_url'
      );
      if (
        redirectUrl &&
        redirectUrl.startsWith('/') &&
        !redirectUrl.startsWith('//')
      ) {
        window.sessionStorage.setItem(
          AUTH_REDIRECT_URL_STORAGE_KEY,
          redirectUrl
        );
      }
    } catch {
      // Ignore sessionStorage access errors
    }
  }, []);

  useEffect(() => {
    const lastStrategy = (clerk as unknown as ClerkClientLastAuthStrategyAccess)
      .client?.lastAuthenticationStrategy;

    const fromClerk = authMethodFromClerkLastStrategy(lastStrategy);
    if (fromClerk) {
      setLastAuthMethod(fromClerk);
      return;
    }

    try {
      const stored = window.localStorage.getItem(LAST_AUTH_METHOD_STORAGE_KEY);
      if (isAuthMethod(stored)) {
        setLastAuthMethod(stored);
      }
    } catch {
      // Ignore localStorage access errors
    }
  }, [clerk]);

  useEffect(() => {
    if (!isEmailOpen) return;

    // AuthInput does not forward refs. Focus the underlying email input once it exists.
    emailFocusAttemptRef.current += 1;
    const attempt = emailFocusAttemptRef.current;

    const timer = window.setTimeout(() => {
      if (emailFocusAttemptRef.current !== attempt) return;
      const container = document.getElementById('auth-form');
      const emailInput = container?.querySelector<HTMLInputElement>(
        'input[type="email"]'
      );
      emailInput?.focus();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isEmailOpen]);

  const persistLastUsedAuthMethod = useCallback((method: AuthMethod) => {
    try {
      window.localStorage.setItem(LAST_AUTH_METHOD_STORAGE_KEY, method);
    } catch {
      // Ignore localStorage access errors
    }
  }, []);

  const setLastUsedAuthMethod = useCallback(
    (method: AuthMethod) => {
      persistLastUsedAuthMethod(method);
      setLastAuthMethod(method);
    },
    [persistLastUsedAuthMethod]
  );

  const orderedMethods = useMemo((): AuthMethod[] => {
    const base: AuthMethod[] = ['google', 'email', 'spotify'];
    if (!lastAuthMethod) return base;
    return [
      lastAuthMethod,
      ...base.filter(method => method !== lastAuthMethod),
    ];
  }, [lastAuthMethod]);

  const renderMethodButton = (
    method: AuthMethod,
    isPrimary: boolean
  ): JSX.Element => {
    const isGooglePrimary = method === 'google' && isPrimary;
    const className = isPrimary
      ? isGooglePrimary
        ? authButtonVariants({ variant: 'oauthPrimary' })
        : authButtonVariants({ variant: 'primaryLight' })
      : secondaryButtonClassName;

    if (method === 'email') {
      return (
        <div>
          <AuthButton
            variant={isPrimary ? 'primaryLight' : 'secondary'}
            onClick={() => {
              setLastUsedAuthMethod('email');
              setIsEmailOpen(true);
            }}
          >
            Continue with email
          </AuthButton>
        </div>
      );
    }

    if (method === 'google') {
      return (
        <Clerk.Loading scope='provider:google'>
          {isLoading => (
            <Clerk.Connection
              name='google'
              className={`${className} ${OAUTH_BUTTON_MOBILE_CLASSES}`}
              disabled={isLoading}
              aria-busy={isLoading}
              onClickCapture={() => persistLastUsedAuthMethod('google')}
            >
              {isLoading ? (
                <>
                  <ButtonSpinner />
                  <span>Opening Google...</span>
                </>
              ) : (
                <>
                  <AuthGoogleIcon />
                  <span>Continue with Google</span>
                </>
              )}
            </Clerk.Connection>
          )}
        </Clerk.Loading>
      );
    }

    return (
      <Clerk.Loading scope='provider:spotify'>
        {isLoading => (
          <Clerk.Connection
            name='spotify'
            className={`${className} ${OAUTH_BUTTON_MOBILE_CLASSES}`}
            disabled={isLoading}
            aria-busy={isLoading}
            onClickCapture={() => persistLastUsedAuthMethod('spotify')}
          >
            {isLoading ? (
              <>
                <ButtonSpinner />
                <span>Opening Spotify...</span>
              </>
            ) : (
              <>
                <AuthSpotifyIcon />
                <span>Continue with Spotify</span>
              </>
            )}
          </Clerk.Connection>
        )}
      </Clerk.Loading>
    );
  };

  return (
    <SignUp.Root routing='path' path='/signup'>
      <Card className='shadow-none border-0 bg-transparent p-0'>
        <CardContent className='space-y-3 p-0'>
          {/* Fixed height container to prevent layout shift when error appears */}
          <div className='min-h-[24px]' role='alert' aria-live='polite'>
            <Clerk.GlobalError className='text-sm text-destructive text-center' />
          </div>

          <SignUp.Step name='start' aria-label='Choose a sign-up method'>
            <div className={`space-y-4 ${STEP_TRANSITION_CLASSES}`}>
              {isEmailOpen ? (
                <div className='space-y-5 sm:space-y-4'>
                  <Clerk.Field name='emailAddress'>
                    <Clerk.Label className='sr-only'>Email Address</Clerk.Label>
                    <AuthInput
                      type='email'
                      placeholder='Enter your email address'
                      autoComplete='email'
                      enterKeyHint='send'
                      onChange={e => setUserEmail(e.target.value)}
                    />
                    <Clerk.FieldError className={FIELD_ERROR_CLASSES} />
                  </Clerk.Field>

                  <p className='text-[15px] leading-relaxed text-secondary-token text-center px-2'>
                    We&apos;ll send a 6-digit code to verify your email.
                  </p>

                  <Clerk.Loading>
                    {isLoading => (
                      <SignUp.Action
                        submit
                        className={`${secondaryButtonClassName} ${OAUTH_BUTTON_MOBILE_CLASSES}`}
                        disabled={isLoading}
                        aria-busy={isLoading}
                        onClick={() => setLastUsedAuthMethod('email')}
                      >
                        {isLoading ? (
                          <>
                            <ButtonSpinner />
                            <span>Sending code...</span>
                          </>
                        ) : (
                          'Continue with email'
                        )}
                      </SignUp.Action>
                    )}
                  </Clerk.Loading>

                  <AuthBackButton
                    onClick={() => setIsEmailOpen(false)}
                    ariaLabel='Back to sign-up'
                  />
                </div>
              ) : (
                <div className='pt-6 space-y-3 sm:space-y-3'>
                  {renderMethodButton(orderedMethods[0], true)}
                  {orderedMethods.length > 1 ? (
                    <div className='mt-6 sm:mt-8 space-y-3'>
                      {orderedMethods.slice(1).map(method => (
                        <div key={method}>
                          {renderMethodButton(method, false)}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </SignUp.Step>

          <SignUp.Step
            name='verifications'
            aria-label='Verify your email with code'
          >
            <SignUp.Strategy name='email_code'>
              <div className={STEP_TRANSITION_CLASSES}>
                {/* Mobile-optimized heading */}
                <h1 className='text-xl sm:text-[20px] leading-7 sm:leading-6 font-medium text-primary-token mb-0 text-center'>
                  Check your email
                </h1>

                <p
                  className='mt-6 mb-10 sm:mb-12 text-[15px] leading-relaxed text-secondary-token text-center px-2'
                  id='otp-description'
                >
                  We&apos;ve sent you a 6-digit verification code.{' '}
                  {userEmail && (
                    <>
                      Please check your inbox at{' '}
                      <span className='text-primary-token font-medium break-all'>
                        {userEmail}
                      </span>
                      .
                    </>
                  )}
                  {!userEmail && <>Codes expire after 10 minutes.</>}
                </p>

                {/* OTP input with extra top margin for progress dots */}
                <div className='space-y-5 sm:space-y-4 pt-4 sm:pt-0'>
                  <Clerk.Field name='code'>
                    <Clerk.Label className='sr-only'>
                      Verification code
                    </Clerk.Label>
                    <OtpInput
                      autoSubmit
                      aria-label='Enter 6-digit verification code'
                    />
                    <Clerk.FieldError className={FIELD_ERROR_CLASSES} />
                  </Clerk.Field>

                  <Clerk.Loading>
                    {isLoading => (
                      <SignUp.Action
                        submit
                        className={`${submitButtonClassName} ${OAUTH_BUTTON_MOBILE_CLASSES}`}
                        disabled={isLoading}
                        aria-busy={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <ButtonSpinner />
                            <span>Verifying...</span>
                          </>
                        ) : (
                          'Verify code'
                        )}
                      </SignUp.Action>
                    )}
                  </Clerk.Loading>

                  <div className='relative'>
                    <SignUp.Action
                      navigate='start'
                      className='sr-only'
                      id='signup-navigate-start'
                    >
                      Use a different email
                    </SignUp.Action>
                    <AuthBackButton
                      onClick={() => {
                        document
                          .getElementById('signup-navigate-start')
                          ?.click();
                      }}
                      ariaLabel='Use a different email'
                    />
                  </div>
                </div>
              </div>
            </SignUp.Strategy>
          </SignUp.Step>
        </CardContent>
      </Card>
    </SignUp.Root>
  );
}
