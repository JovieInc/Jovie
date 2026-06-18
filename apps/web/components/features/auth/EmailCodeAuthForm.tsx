'use client';

import { useSignIn, useSignUp } from '@clerk/nextjs';
import type { FormEvent } from 'react';
import { useCallback, useState } from 'react';
import {
  AuthButton,
  AuthInput,
  FormError,
  OtpInput,
} from '@/features/auth/atoms';
import type { AuthShellMode } from './AuthShell';

/**
 * Email one-time-code auth flow for the canonical AuthShell.
 *
 * Email (`email_code`) auth is intentionally enabled on the Clerk instance
 * (founder decision, 2026-06 — supersedes the SSO-only contract from
 * JOV-2446/JOV-2778). This form is the app-owned UI for that strategy:
 * email entry → six-digit code → session finalize. Password auth remains
 * intentionally unsupported; no password field may ever mount here.
 *
 * Uses the same Clerk resource API style as the SSO buttons in AuthShell:
 * methods return `{ error }` instead of throwing.
 */

type EmailCodeStep = 'email' | 'code';

interface EmailCodeAuthFormProps {
  /** Which Clerk flow to drive. */
  readonly mode: AuthShellMode;
  /** Where to navigate after the session is finalized. */
  readonly redirectUrl: string;
  /** Optional email prefill (e.g. from `?email=` deep links). */
  readonly initialEmailAddress?: string;
}

interface ClerkErrorLike {
  readonly code?: string;
  readonly message?: string;
}

function readClerkError(error: unknown): ClerkErrorLike {
  if (!error || typeof error !== 'object') return {};

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    errors?: ReadonlyArray<{ code?: unknown; message?: unknown }>;
  };
  const first = Array.isArray(candidate.errors)
    ? candidate.errors[0]
    : undefined;
  const code = first?.code ?? candidate.code;
  const message = first?.message ?? candidate.message;

  return {
    code: typeof code === 'string' ? code : undefined,
    message: typeof message === 'string' ? message : undefined,
  };
}

function getSendErrorMessage(mode: AuthShellMode, error: unknown): string {
  const { code } = readClerkError(error);

  if (mode === 'sign-in' && code === 'form_identifier_not_found') {
    return 'No account found for this email. Create your account below to get started.';
  }
  if (mode === 'sign-up' && code === 'form_identifier_exists') {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (code === 'form_param_format_invalid') {
    return 'That email address doesn’t look right. Check it and try again.';
  }

  return mode === 'sign-up'
    ? 'Could not start sign-up. Please try again.'
    : 'Could not send the code. Please try again.';
}

function getVerifyErrorMessage(error: unknown): string {
  const { code } = readClerkError(error);

  if (code === 'form_code_incorrect') {
    return 'That code is incorrect. Check your email and try again.';
  }
  if (code === 'verification_expired') {
    return 'That code has expired. Send a new one and try again.';
  }

  return 'Could not verify the code. Please try again.';
}

export function EmailCodeAuthForm({
  mode,
  redirectUrl,
  initialEmailAddress,
}: EmailCodeAuthFormProps) {
  const signInState = useSignIn();
  const signUpState = useSignUp();
  const [step, setStep] = useState<EmailCodeStep>('email');
  const [emailAddress, setEmailAddress] = useState(initialEmailAddress ?? '');
  const [code, setCode] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isSignUp = mode === 'sign-up';
  const signIn = signInState.signIn;
  const signUp = signUpState.signUp;
  const isReady = isSignUp ? Boolean(signUp) : Boolean(signIn);

  const sendCode = useCallback(async () => {
    const trimmedEmail = emailAddress.trim();
    if (!trimmedEmail || isPending || !isReady) return;

    setIsPending(true);
    setErrorMessage(null);

    try {
      if (isSignUp) {
        if (!signUp) throw new Error('Missing Clerk sign-up resource');
        const created = await signUp.create({
          emailAddress: trimmedEmail,
          legalAccepted: true,
        });
        if (created.error) throw created.error;
        const sent = await signUp.verifications.sendEmailCode();
        if (sent.error) throw sent.error;
      } else {
        if (!signIn) throw new Error('Missing Clerk sign-in resource');
        const sent = await signIn.emailCode.sendCode({
          emailAddress: trimmedEmail,
        });
        if (sent.error) throw sent.error;
      }

      setCode('');
      setStep('code');
    } catch (error) {
      setErrorMessage(getSendErrorMessage(mode, error));
    } finally {
      setIsPending(false);
    }
  }, [emailAddress, isPending, isReady, isSignUp, mode, signIn, signUp]);

  const verifyCode = useCallback(
    async (submittedCode: string) => {
      if (submittedCode.length < 6 || isPending) return;

      setIsPending(true);
      setErrorMessage(null);

      try {
        if (isSignUp) {
          if (!signUp) throw new Error('Missing Clerk sign-up resource');
          const verified = await signUp.verifications.verifyEmailCode({
            code: submittedCode,
          });
          if (verified.error) throw verified.error;
          const finalized = await signUp.finalize();
          if (finalized.error) throw finalized.error;
        } else {
          if (!signIn) throw new Error('Missing Clerk sign-in resource');
          const verified = await signIn.emailCode.verifyCode({
            code: submittedCode,
          });
          if (verified.error) throw verified.error;
          const finalized = await signIn.finalize();
          if (finalized.error) throw finalized.error;
        }

        globalThis.location?.assign(redirectUrl);
      } catch (error) {
        setErrorMessage(getVerifyErrorMessage(error));
        setIsPending(false);
      }
    },
    [isPending, isSignUp, redirectUrl, signIn, signUp]
  );

  const handleEmailSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void sendCode();
    },
    [sendCode]
  );

  const handleCodeSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void verifyCode(code);
    },
    [code, verifyCode]
  );

  const handleBackToEmail = useCallback(() => {
    setStep('email');
    setCode('');
    setErrorMessage(null);
  }, []);

  if (step === 'code') {
    return (
      <form
        data-auth-email-code-step='code'
        onSubmit={handleCodeSubmit}
        className='flex flex-col gap-3'
      >
        <p className='text-center text-app text-secondary-token'>
          Enter the code sent to{' '}
          <span className='font-medium text-primary-token'>
            {emailAddress.trim()}
          </span>
        </p>
        <OtpInput
          value={code}
          onChange={setCode}
          onComplete={verifyCode}
          disabled={isPending}
          error={Boolean(errorMessage)}
          errorId='auth-email-code-error'
        />
        <FormError id='auth-email-code-error' message={errorMessage} />
        <AuthButton type='submit' disabled={isPending || code.length < 6}>
          {isPending ? 'Verifying…' : 'Verify Code'}
        </AuthButton>
        <button
          type='button'
          onClick={handleBackToEmail}
          className='focus-ring-themed mx-auto rounded-md text-app text-secondary-token underline underline-offset-2'
        >
          Use a different email
        </button>
      </form>
    );
  }

  return (
    <form
      data-auth-email-code-step='email'
      onSubmit={handleEmailSubmit}
      className='flex flex-col gap-3'
    >
      <AuthInput
        type='email'
        name='emailAddress'
        autoComplete='email'
        inputMode='email'
        placeholder='Email address'
        aria-label='Email Address'
        value={emailAddress}
        error={Boolean(errorMessage)}
        disabled={isPending}
        onChange={event => setEmailAddress(event.target.value)}
      />
      <FormError message={errorMessage} />
      <AuthButton
        type='submit'
        disabled={isPending || !isReady || emailAddress.trim().length === 0}
      >
        {isPending
          ? 'Sending code…'
          : isSignUp
            ? 'Continue with Email'
            : 'Email me a Code'}
      </AuthButton>
    </form>
  );
}
