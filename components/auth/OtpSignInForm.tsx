'use client';

import * as Clerk from '@clerk/elements/common';
import * as SignIn from '@clerk/elements/sign-in';
import { useClerk } from '@clerk/nextjs';
import { Card, CardContent } from '@jovie/ui';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthButton, AuthInput, authButtonVariants, OtpInput } from './atoms';
import { ButtonSpinner } from './ButtonSpinner';

const FIELD_ERROR_CLASSES =
  'mt-2 text-sm text-red-400 text-center animate-in fade-in-0 duration-200';
const STEP_TRANSITION_CLASSES =
  'animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out';
const FOOTER_LINK_CLASSES =
  'text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e0f10] rounded-md';

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

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox='0 0 24 24'
      aria-hidden='true'
      className={className ?? 'h-4 w-4'}
      fill='none'
    >
      <path
        d='M21.6 12.2727C21.6 11.6182 21.5455 11 21.4364 10.4H12V14.2818H17.4C17.1636 15.5091 16.4727 16.5455 15.4364 17.2V19.7182H18.6727C20.5636 17.9636 21.6 15.3182 21.6 12.2727Z'
        fill='currentColor'
      />
      <path
        d='M12 22C14.7 22 16.9636 21.1091 18.6727 19.7182L15.4364 17.2C14.5455 17.8 13.4091 18.1636 12 18.1636C9.4 18.1636 7.2 16.4091 6.4 14.0364H3.07273V16.6273C4.77273 19.9727 8.23636 22 12 22Z'
        fill='currentColor'
      />
      <path
        d='M6.4 14.0364C6.2 13.4364 6.09091 12.8 6.09091 12.1455C6.09091 11.4909 6.2 10.8545 6.4 10.2545V7.66364H3.07273C2.36364 9.07273 2 10.6727 2 12.1455C2 13.6182 2.36364 15.2182 3.07273 16.6273L6.4 14.0364Z'
        fill='currentColor'
      />
      <path
        d='M12 6.12727C13.5455 6.12727 14.9273 6.65455 16.0182 7.69091L18.7455 4.96364C16.9636 3.29091 14.7 2.29091 12 2.29091C8.23636 2.29091 4.77273 4.31818 3.07273 7.66364L6.4 10.2545C7.2 7.88182 9.4 6.12727 12 6.12727Z'
        fill='currentColor'
      />
    </svg>
  );
}

function SpotifyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox='0 0 24 24'
      aria-hidden='true'
      className={className ?? 'h-4 w-4'}
      fill='currentColor'
    >
      <path d='M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.48.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.32 11.28-1.08 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z' />
    </svg>
  );
}

export function OtpSignInForm() {
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
      // Ignore localStorage access errors (e.g., blocked in private mode)
    }
  }, [clerk]);

  useEffect(() => {
    if (!isEmailOpen) return;

    // AuthInput does not forward refs. Focus the underlying email input once it exists.
    // (Keeps design unchanged while restoring type safety.)
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
    return [lastAuthMethod, ...base.filter(m => m !== lastAuthMethod)];
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
                  <GoogleIcon />
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
                <SpotifyIcon />
                <span>Continue with Spotify</span>
              </>
            )}
          </Clerk.Connection>
        )}
      </Clerk.Loading>
    );
  };

  return (
    <SignIn.Root routing='path' path='/signin'>
      <Card className='shadow-none border-0 bg-transparent p-0'>
        <CardContent className='space-y-3 p-0'>
          <div className='min-h-[24px]' role='alert' aria-live='polite'>
            <Clerk.GlobalError className='text-destructive' />
          </div>
          <SignIn.Step name='start' aria-label='Choose a sign-in method'>
            <div className={`space-y-4 ${STEP_TRANSITION_CLASSES}`}>
              <h1 className='text-[18px] leading-6 font-medium text-[rgb(227,228,230)] mb-0 text-center'>
                {isEmailOpen ? "What's your email address?" : 'Log in to Jovie'}
              </h1>

              {isEmailOpen ? (
                <div className='pt-4 space-y-4'>
                  <Clerk.Field name='identifier'>
                    <Clerk.Label className='sr-only'>Email Address</Clerk.Label>
                    <AuthInput
                      type='email'
                      placeholder='Enter your email address'
                    />
                    <Clerk.FieldError className={FIELD_ERROR_CLASSES} />
                  </Clerk.Field>

                  <Clerk.Loading>
                    {isLoading => (
                      <SignIn.Action
                        submit
                        className={secondaryButtonClassName}
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
                      </SignIn.Action>
                    )}
                  </Clerk.Loading>

                  <AuthButton
                    variant='link'
                    className='text-center'
                    onClick={() => setIsEmailOpen(false)}
                  >
                    ← Back to login
                  </AuthButton>
                </div>
              ) : (
                <div className='pt-6 space-y-3'>
                  {renderMethodButton(orderedMethods[0], true)}

                  {lastAuthMethod ? (
                    <p className='-mt-1 text-xs text-[#6b6f76] text-center'>
                      You used{' '}
                      {lastAuthMethod === 'google'
                        ? 'Google'
                        : lastAuthMethod === 'spotify'
                          ? 'Spotify'
                          : 'email'}{' '}
                      last time
                    </p>
                  ) : null}

                  {orderedMethods.length > 1 ? (
                    <div className='mt-8 space-y-3'>
                      {orderedMethods.slice(1).map(method => (
                        <div key={method}>
                          {renderMethodButton(method, false)}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <p className='mt-10 text-sm text-[#6b6f76] text-center'>
                    Don&apos;t have access?{' '}
                    <Link href='/waitlist' className={FOOTER_LINK_CLASSES}>
                      Join the waitlist
                    </Link>
                  </p>
                </div>
              )}
            </div>
          </SignIn.Step>

          <SignIn.Step
            name='verifications'
            aria-label='Verify your email with code'
          >
            <SignIn.Strategy name='email_code'>
              <div className={STEP_TRANSITION_CLASSES}>
                <h1 className='text-lg font-medium text-[rgb(227,228,230)] mb-0 text-center'>
                  Check your email
                </h1>

                <p
                  className='mt-6 mb-12 text-sm text-secondary text-center'
                  id='otp-description'
                >
                  We sent a 6-digit code to your email
                </p>

                <div className='space-y-4'>
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
                      <SignIn.Action
                        submit
                        className={submitButtonClassName}
                        disabled={isLoading}
                        aria-busy={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <ButtonSpinner />
                            <span>Verifying...</span>
                          </>
                        ) : (
                          'Continue code'
                        )}
                      </SignIn.Action>
                    )}
                  </Clerk.Loading>

                  <SignIn.Action
                    navigate='start'
                    className={`${linkButtonClassName} text-center`}
                  >
                    ← Use a different email
                  </SignIn.Action>
                </div>
              </div>
            </SignIn.Strategy>
          </SignIn.Step>
        </CardContent>
      </Card>
    </SignIn.Root>
  );
}
