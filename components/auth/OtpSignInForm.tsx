'use client';

import * as Clerk from '@clerk/elements/common';
import * as SignIn from '@clerk/elements/sign-in';
import { useClerk } from '@clerk/nextjs';
import { Card, CardContent } from '@jovie/ui';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthInput, OtpInput } from './atoms';
import { ButtonSpinner } from './ButtonSpinner';

const FIELD_ERROR_CLASSES =
  'mt-2 text-sm text-red-400 text-center animate-in fade-in-0 duration-200';
const SUBMIT_BUTTON_CLASSES =
  'w-full rounded-md bg-[#e8e8e8] hover:bg-white disabled:opacity-70 disabled:cursor-not-allowed text-sm text-[#101012] font-medium py-3 px-4 transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e0f10]';
const SECONDARY_BUTTON_CLASSES =
  'w-full rounded-md border border-white/10 bg-[#17181d] px-4 py-4 text-sm font-medium text-[rgb(227,228,230)] hover:bg-[#1e2027] transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e0f10]';
const STEP_TRANSITION_CLASSES =
  'animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out';
const LINK_CLASSES =
  'w-full text-center text-sm text-secondary hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e0f10] rounded';
const FOOTER_LINK_CLASSES =
  'text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e0f10] rounded';

type AuthMethod = 'email' | 'google' | 'spotify';

const LAST_AUTH_METHOD_STORAGE_KEY = 'jovie.last_auth_method';

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
      className={className ?? 'h-5 w-5'}
      fill='none'
    >
      <path
        d='M12 2.25C6.615 2.25 2.25 6.615 2.25 12C2.25 17.385 6.615 21.75 12 21.75C17.385 21.75 21.75 17.385 21.75 12C21.75 6.615 17.385 2.25 12 2.25Z'
        fill='#ffffff'
        stroke='#0f0f11'
        strokeWidth='0.75'
      />
      <path
        d='M16.845 10.0202C14.01 8.37019 9.34502 8.22019 6.64502 9.04519C6.28502 9.15019 5.91002 8.94019 5.80502 8.58019C5.70002 8.22019 5.91002 7.84519 6.27002 7.74019C9.37502 6.81019 14.535 6.99019 17.67 8.82019C18 9.01519 18.12 9.45019 17.925 9.78019C17.73 10.1102 17.175 10.2152 16.845 10.0202Z'
        fill='#0f0f11'
      />
      <path
        d='M16.68 12.4352C14.295 11.0102 10.665 10.5902 7.665 11.5202C7.32 11.6252 6.945 11.4302 6.84 11.0852C6.735 10.7402 6.93 10.3652 7.275 10.2602C10.68 9.21023 14.82 9.66023 17.55 11.2952C17.865 11.4902 17.97 11.8952 17.775 12.2102C17.58 12.5252 16.995 12.6302 16.68 12.4352Z'
        fill='#0f0f11'
      />
      <path
        d='M16.515 14.7602C14.43 13.5302 11.82 13.2602 8.74502 13.9952C8.40002 14.0702 8.05502 13.8452 7.98002 13.5002C7.90502 13.1552 8.13002 12.8102 8.47502 12.7352C11.85 11.9252 14.775 12.2402 17.19 13.6652C17.49 13.8452 17.595 14.2352 17.415 14.5352C17.235 14.8352 16.815 14.9402 16.515 14.7602Z'
        fill='#0f0f11'
      />
    </svg>
  );
}

export function OtpSignInForm() {
  const clerk = useClerk();
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [lastAuthMethod, setLastAuthMethod] = useState<AuthMethod | null>(null);
  const emailFocusAttemptRef = useRef(0);

  useEffect(() => {
    const lastStrategy = (clerk as unknown as ClerkClientLastAuthStrategyAccess)
      .client?.lastAuthenticationStrategy;

    const fromClerk = authMethodFromClerkLastStrategy(lastStrategy);
    if (fromClerk) {
      setLastAuthMethod(fromClerk);
      return;
    }

    const stored = window.localStorage.getItem(LAST_AUTH_METHOD_STORAGE_KEY);
    if (isAuthMethod(stored)) {
      setLastAuthMethod(stored);
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

  const setLastUsedAuthMethod = useCallback((method: AuthMethod) => {
    window.localStorage.setItem(LAST_AUTH_METHOD_STORAGE_KEY, method);
    setLastAuthMethod(method);
  }, []);

  const orderedMethods = useMemo((): AuthMethod[] => {
    const base: AuthMethod[] = ['spotify', 'google', 'email'];
    if (!lastAuthMethod) return base;
    return [lastAuthMethod, ...base.filter(m => m !== lastAuthMethod)];
  }, [lastAuthMethod]);

  const renderMethodButton = (
    method: AuthMethod,
    isPrimary: boolean
  ): JSX.Element => {
    const className = isPrimary
      ? SUBMIT_BUTTON_CLASSES
      : SECONDARY_BUTTON_CLASSES;

    if (method === 'email') {
      return (
        <div>
          <button
            type='button'
            className={className}
            onClick={() => setIsEmailOpen(true)}
          >
            Continue with email
          </button>
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
              onClick={() => setLastUsedAuthMethod('google')}
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
            onClick={() => setLastUsedAuthMethod('spotify')}
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
          <div role='alert' aria-live='polite' className='sr-only' />
          <Clerk.GlobalError
            role='alert'
            aria-live='polite'
            className='text-destructive'
          />
          <SignIn.Step name='start' aria-label='Choose a sign-in method'>
            <div className={`space-y-4 ${STEP_TRANSITION_CLASSES}`}>
              <h1 className='text-lg font-medium text-[rgb(227,228,230)] mb-0 text-center'>
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
                        className={SECONDARY_BUTTON_CLASSES}
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

                  <button
                    type='button'
                    className={LINK_CLASSES}
                    onClick={() => setIsEmailOpen(false)}
                  >
                    ← Back to login
                  </button>
                </div>
              ) : (
                <div className='pt-4 space-y-3'>
                  {renderMethodButton(orderedMethods[0], true)}
                  {orderedMethods.length > 1 ? (
                    <div className='mt-6 space-y-3'>
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
                        className={SUBMIT_BUTTON_CLASSES}
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

                  <SignIn.Action navigate='start' className={LINK_CLASSES}>
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
