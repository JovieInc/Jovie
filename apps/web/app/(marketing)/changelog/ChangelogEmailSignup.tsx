'use client';

import { Button } from '@jovie/ui/atoms/button';
import { InlineSubscribe } from '@jovie/ui/atoms/inline-subscribe';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import {
  InvisibleTurnstile,
  type InvisibleTurnstileState,
  isTurnstileClientBypassed,
  isTurnstileClientConfigured,
} from '@/components/atoms/InvisibleTurnstile';

type Status = 'idle' | 'submitting' | 'success' | 'subscribed' | 'error';
type ResendState = 'idle' | 'sending' | 'sent' | 'error';

export interface ChangelogEmailSignupCopy {
  readonly idleHeading: string;
  readonly buttonLabel: string;
  readonly consent: string;
  readonly successHeading: string;
  readonly successDescription: string;
  readonly subscribedHeading: string;
  readonly subscribedDescription: string;
}

const DEFAULT_COPY: ChangelogEmailSignupCopy = {
  idleHeading: 'Get updates',
  buttonLabel: 'Subscribe',
  consent: 'Unsubscribe anytime.',
  successHeading: 'Check your email',
  successDescription:
    'Confirm your subscription to receive Jovie changelog emails.',
  subscribedHeading: 'Jovie changelog',
  subscribedDescription: 'This email already receives the Jovie changelog.',
};

const TURNSTILE_FAILURE_STATUSES = new Set([
  'error',
  'expired',
  'timeout',
  'unsupported',
  'unconfigured',
]);

export function ChangelogEmailSignup({
  source = 'changelog_page',
  initialEmail = '',
  copy = DEFAULT_COPY,
  marketingSection = false,
  deferSecurityCheck = false,
}: {
  readonly source?: string;
  readonly initialEmail?: string;
  readonly copy?: ChangelogEmailSignupCopy;
  readonly marketingSection?: boolean;
  /**
   * Load the Cloudflare check only after the visitor touches the form.
   * Footer signups sit on pages whose job is something else (pricing, claim
   * funnel); loading a vendor iframe that polls forever on every view costs
   * LCP/INP and keeps the page from ever reaching network idle.
   */
  readonly deferSecurityCheck?: boolean;
}) {
  const formId = useId();
  const [securityCheckArmed, setSecurityCheckArmed] = useState(
    !deferSecurityCheck
  );
  const statusRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState(initialEmail);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [resendState, setResendState] = useState<ResendState>('idle');
  const [resendMessage, setResendMessage] = useState('');
  const latestStatusRef = useRef<Status>('idle');
  const focusEmailOnIdleRef = useRef(false);

  useEffect(() => {
    latestStatusRef.current = status;
  }, [status]);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
  const turnstileFailureActiveRef = useRef(false);
  const emailEditedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const turnstileRequired =
    isTurnstileClientConfigured() && !isTurnstileClientBypassed();
  const [turnstileFailed, setTurnstileFailed] = useState(false);
  const [turnstileRetryable, setTurnstileRetryable] = useState(false);

  const settled = status === 'success' || status === 'subscribed';
  const heading = settled
    ? status === 'subscribed'
      ? copy.subscribedHeading
      : copy.successHeading
    : copy.idleHeading;
  const description = settled
    ? status === 'subscribed'
      ? copy.subscribedDescription
      : copy.successDescription
    : '';
  const successMessage = `${heading}. ${description}`;

  useEffect(() => {
    if (settled) statusRef.current?.focus({ preventScroll: true });
    else if (status === 'idle' && focusEmailOnIdleRef.current) {
      focusEmailOnIdleRef.current = false;
      inputRef.current?.focus({ preventScroll: true });
    } else if (status === 'error' && !turnstileFailed)
      inputRef.current?.focus({ preventScroll: true });
  }, [settled, status, turnstileFailed]);

  useEffect(() => {
    if (initialEmail && !emailEditedRef.current) {
      setEmail(initialEmail);
    }
  }, [initialEmail]);

  const handleTurnstileStateChange = useCallback(
    (state: InvisibleTurnstileState) => {
      if (state.status === 'interactive') {
        return;
      }

      if (!TURNSTILE_FAILURE_STATUSES.has(state.status)) {
        if (state.status === 'verified' || state.status === 'bypassed') {
          if (turnstileFailureActiveRef.current) {
            turnstileFailureActiveRef.current = false;
            if (latestStatusRef.current !== 'success') {
              setStatus('idle');
              setErrorMessage('');
            }
          }
          setTurnstileFailed(false);
          setTurnstileRetryable(false);
          if (latestStatusRef.current === 'success') {
            setResendState('idle');
            setResendMessage('');
          }
        }
        return;
      }

      if (latestStatusRef.current === 'success') {
        // Keep the confirmation-required panel; surface the failure on the
        // resend path instead of collapsing back to the form error state.
        setTurnstileFailed(true);
        setTurnstileRetryable(
          state.status === 'error' ||
            state.status === 'expired' ||
            state.status === 'timeout'
        );
        setTurnstileToken('');
        setResendState('error');
        setResendMessage(
          state.message ?? 'Security check unavailable. Please try again.'
        );
        return;
      }

      turnstileFailureActiveRef.current = true;
      setTurnstileFailed(true);
      setTurnstileRetryable(
        state.status === 'error' ||
          state.status === 'expired' ||
          state.status === 'timeout'
      );
      setTurnstileToken('');
      setStatus('error');
      setErrorMessage(
        state.message ?? 'Subscription is temporarily unavailable.'
      );
    },
    []
  );

  function retryTurnstile() {
    turnstileFailureActiveRef.current = false;
    setTurnstileFailed(false);
    setTurnstileRetryable(false);
    if (latestStatusRef.current !== 'success') {
      setStatus('idle');
      setErrorMessage('');
    } else {
      setResendState('idle');
      setResendMessage('');
    }
    setTurnstileResetSignal(signal => signal + 1);
  }

  function handleChangeEmail() {
    focusEmailOnIdleRef.current = true;
    emailEditedRef.current = true;
    setEmail(submittedEmail);
    setStatus('idle');
    setErrorMessage('');
    setResendState('idle');
    setResendMessage('');
  }

  async function handleResend() {
    if (status !== 'success' || !submittedEmail) return;
    if (resendState === 'sending') return;

    if (turnstileRequired && !turnstileToken) {
      setResendState('error');
      setResendMessage('Security check is still loading. Please try again.');
      return;
    }

    setResendState('sending');
    setResendMessage('');

    try {
      const res = await fetch('/api/changelog/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: submittedEmail,
          turnstileToken,
          source,
        }),
      });

      const data = (await res.json()) as {
        state?: 'confirmation_required' | 'subscribed';
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      if (data.state === 'subscribed') {
        setStatus('subscribed');
        return;
      }

      if (data.state !== 'confirmation_required') {
        throw new Error('Confirmation could not be sent. Please try again.');
      }

      setResendState('sent');
      setResendMessage(`Confirmation email sent again to ${submittedEmail}.`);
    } catch (err) {
      setResendState('error');
      setResendMessage(
        err instanceof Error ? err.message : 'Something went wrong'
      );
    } finally {
      setTurnstileToken('');
      setTurnstileResetSignal(signal => signal + 1);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (status === 'submitting' || settled) return;

    if (!email.trim()) {
      inputRef.current?.focus({ preventScroll: true });
      return;
    }

    if (turnstileRequired && !turnstileToken) {
      setStatus('error');
      setErrorMessage('Security check is still loading. Please try again.');
      return;
    }

    setStatus('submitting');
    setErrorMessage('');

    try {
      const res = await fetch('/api/changelog/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          turnstileToken,
          source,
        }),
      });

      const data = (await res.json()) as {
        state?: 'confirmation_required' | 'subscribed';
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      if (
        data.state !== 'subscribed' &&
        data.state !== 'confirmation_required'
      ) {
        throw new Error(
          'Subscription could not be confirmed. Please try again.'
        );
      }
      setStatus(data.state === 'subscribed' ? 'subscribed' : 'success');
      setSubmittedEmail(
        data.state === 'confirmation_required' ? email.trim() : ''
      );
      setResendState('idle');
      setResendMessage('');
      setEmail('');
      // The token was consumed by this submission; issue a fresh one so a
      // resend or corrected-address submit can pass server verification.
      setTurnstileToken('');
      setTurnstileResetSignal(signal => signal + 1);
    } catch (err) {
      setStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'Something went wrong'
      );
      setTurnstileResetSignal(signal => signal + 1);
    }
  }

  return (
    <section
      id={source === 'changelog_page' ? 'changelog-subscribe' : undefined}
      data-testid={marketingSection ? 'marketing-section-capture' : undefined}
      data-marketing-owner={
        marketingSection
          ? 'apps/web/app/(marketing)/changelog/ChangelogEmailSignup.tsx'
          : undefined
      }
      data-marketing-variant={marketingSection ? 'email-only' : undefined}
      data-marketing-occurrence={
        marketingSection ? 'product-updates' : undefined
      }
      aria-labelledby={`${formId}-heading`}
      data-pen-source='qKrDn'
      data-visual-state={status}
      className='mx-auto flex w-full max-w-md flex-col items-center gap-3 text-center'
    >
      <h2
        id={`${formId}-heading`}
        className='line-clamp-2 text-lg font-medium tracking-tight text-primary-token'
      >
        {heading}
      </h2>
      {settled ? (
        <p className='text-sm text-secondary-token'>{description}</p>
      ) : null}
      <div className='grid w-full'>
        <form
          onSubmit={handleSubmit}
          onFocusCapture={() => setSecurityCheckArmed(true)}
          onPointerDownCapture={() => setSecurityCheckArmed(true)}
          data-testid='changelog-subscribe-form'
          aria-hidden={settled || undefined}
          inert={settled}
          className={`col-start-1 row-start-1 grid ${settled ? 'invisible pointer-events-none' : ''}`}
        >
          <InlineSubscribe
            inputId={`${formId}-email`}
            inputRef={inputRef}
            ariaLabel='Email address'
            buttonLabel={copy.buttonLabel}
            value={email}
            onValueChange={value => {
              emailEditedRef.current = true;
              setEmail(value);
              if (status === 'error' && !turnstileFailed) {
                setStatus('idle');
                setErrorMessage('');
              }
            }}
            loading={status === 'submitting'}
            pending={status === 'submitting'}
            unavailable={turnstileFailed}
            invalid={status === 'error' && !turnstileFailed}
            describedBy={`${formId}-consent${status === 'error' ? ` ${formId}-error` : ''}`}
          />
          {status === 'subscribed' || !securityCheckArmed ? null : (
            <InvisibleTurnstile
              onToken={setTurnstileToken}
              onStateChange={handleTurnstileStateChange}
              resetSignal={turnstileResetSignal}
            />
          )}
        </form>
        {status === 'success' ? (
          <div
            data-testid='changelog-confirmation-sent'
            className='col-start-1 row-start-1 flex flex-col gap-4'
          >
            <p className='text-sm text-primary-token'>
              We sent a confirmation link to{' '}
              <span className='break-all font-medium'>{submittedEmail}</span>.
            </p>
            <div className='flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2'>
              <Button
                type='button'
                size='marketing'
                onClick={handleResend}
                loading={resendState === 'sending'}
                disabled={
                  resendState === 'sending' ||
                  (turnstileRequired && !turnstileToken)
                }
              >
                Resend Confirmation
              </Button>
              <Button
                type='button'
                variant='link'
                size='sm'
                onClick={handleChangeEmail}
              >
                Use A Different Email
              </Button>
            </div>
            {resendMessage ? (
              <p
                role={resendState === 'error' ? 'alert' : undefined}
                className={
                  resendState === 'error'
                    ? 'text-sm text-accent-red'
                    : 'text-sm text-secondary-token'
                }
              >
                {resendMessage}
              </p>
            ) : null}
          </div>
        ) : null}
        <div
          ref={statusRef}
          tabIndex={-1}
          role='status'
          aria-live='polite'
          data-testid='changelog-success-message'
          className='sr-only'
        >
          {settled
            ? `${successMessage}${
                status === 'success' && resendMessage ? ` ${resendMessage}` : ''
              }`
            : status === 'submitting'
              ? 'Subscribing…'
              : ''}
        </div>
      </div>
      {settled ? null : (
        <p id={`${formId}-consent`} className='text-xs text-tertiary-token'>
          {copy.consent}
        </p>
      )}
      <p
        id={`${formId}-error`}
        className='min-h-5 text-sm text-accent-red'
        role={status === 'error' ? 'alert' : undefined}
      >
        {status === 'error' ? errorMessage : ''}
      </p>
      <div className='min-h-6'>
        {turnstileFailed && turnstileRetryable ? (
          <Button
            type='button'
            variant='link'
            size='sm'
            onClick={retryTurnstile}
          >
            Retry Security Check
          </Button>
        ) : null}
      </div>
    </section>
  );
}
