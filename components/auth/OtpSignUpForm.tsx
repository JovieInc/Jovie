'use client';

import * as Clerk from '@clerk/elements/common';
import * as SignUp from '@clerk/elements/sign-up';
import { useClerk } from '@clerk/nextjs';
import { Card, CardContent } from '@jovie/ui';
import * as Sentry from '@sentry/nextjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { logger } from '@/lib/utils/logger';
import {
  AuthButton,
  AuthGoogleIcon,
  AuthInput,
  AuthSpotifyIcon,
  authButtonVariants,
  OtpInput,
} from './atoms';
import { ButtonSpinner } from './ButtonSpinner';

const FIELD_ERROR_CLASSES =
  'mt-2 text-sm text-destructive text-center animate-in fade-in-0 duration-200';
const STEP_TRANSITION_CLASSES =
  'animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out';

const submitButtonClassName = authButtonVariants({ variant: 'primary' });
const secondaryButtonClassName = authButtonVariants({ variant: 'secondary' });
const linkButtonClassName = authButtonVariants({ variant: 'link' });

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
              className={className}
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
            className={className}
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
                <>
                  <Clerk.Field name='emailAddress'>
                    <Clerk.Label className='sr-only'>Email Address</Clerk.Label>
                    <AuthInput
                      type='email'
                      placeholder='Email Address'
                      autoComplete='email'
                    />
                    <Clerk.FieldError className={FIELD_ERROR_CLASSES} />
                  </Clerk.Field>

                  <p className='text-sm text-secondary text-center'>
                    We&apos;ll send a 6-digit code to verify your email.
                  </p>

                  <Clerk.Loading>
                    {isLoading => (
                      <SignUp.Action
                        submit
                        className={secondaryButtonClassName}
                        disabled={isLoading}
                        aria-busy={isLoading}
                        onClick={() => {
                          Sentry.startSpan(
                            { op: 'ui.auth.submit', name: 'Sign up send code' },
                            span => {
                              span.setAttribute('method', 'email');
                            }
                          );
                          logger.info(
                            logger.fmt`Sign up code requested`,
                            { method: 'email' },
                            'auth'
                          );
                          setLastUsedAuthMethod('email');
                        }}
                      >
                        {isLoading ? (
                          <>
                            <ButtonSpinner />
                            <span>Sending code...</span>
                          </>
                        ) : (
                          'Send code'
                        )}
                      </SignUp.Action>
                    )}
                  </Clerk.Loading>

                  <AuthButton
                    variant='link'
                    className='text-center'
                    onClick={() => setIsEmailOpen(false)}
                  >
                    ← Back
                  </AuthButton>
                </>
              ) : (
                <div className='pt-6 space-y-3'>
                  {renderMethodButton(orderedMethods[0], true)}
                  {orderedMethods.length > 1 ? (
                    <div className='mt-8 space-y-3'>
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
              <div className={`space-y-4 ${STEP_TRANSITION_CLASSES}`}>
                <p
                  className='text-sm text-secondary text-center'
                  id='otp-description'
                >
                  We sent a 6-digit code to your email.
                  <br />
                  Codes expire after 10 minutes.
                </p>

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
                      className={submitButtonClassName}
                      disabled={isLoading}
                      aria-busy={isLoading}
                      onClick={() => {
                        Sentry.startSpan(
                          { op: 'ui.auth.submit', name: 'Sign up verify code' },
                          span => {
                            span.setAttribute('method', 'email_code');
                          }
                        );
                        logger.info(
                          logger.fmt`Sign up verification submitted`,
                          { method: 'email_code' },
                          'auth'
                        );
                      }}
                    >
                      {isLoading ? (
                        <>
                          <ButtonSpinner />
                          <span>Verifying...</span>
                        </>
                      ) : (
                        'Verify Code'
                      )}
                    </SignUp.Action>
                  )}
                </Clerk.Loading>

                <SignUp.Action
                  navigate='start'
                  className={`${linkButtonClassName} text-center`}
                >
                  ← Use a different email
                </SignUp.Action>
              </div>
            </SignUp.Strategy>
          </SignUp.Step>
        </CardContent>
      </Card>
    </SignUp.Root>
  );
}
