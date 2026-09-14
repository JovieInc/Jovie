'use client';

import { Button } from '@jovie/ui/atoms/button';
import { Input } from '@jovie/ui/atoms/input';
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

const TURNSTILE_FAILURE_STATUSES = new Set([
  'error',
  'expired',
  'timeout',
  'unsupported',
  'unconfigured',
]);

export function ChangelogEmailSignup({
  source = 'changelog_page',
}: {
  readonly source?: string;
}) {
  const formId = useId();
  const statusRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
  const turnstileFailureActiveRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const turnstileRequired =
    isTurnstileClientConfigured() && !isTurnstileClientBypassed();
  const [turnstileFailed, setTurnstileFailed] = useState(false);

  const settled = status === 'success' || status === 'subscribed';
  const successMessage =
    status === 'subscribed'
      ? "You're already subscribed."
      : 'Check your email to confirm your subscription.';

  useEffect(() => {
    if (settled) statusRef.current?.focus({ preventScroll: true });
    else if (status === 'error' && !turnstileFailed)
      inputRef.current?.focus({ preventScroll: true });
  }, [settled, status, turnstileFailed]);

  const handleTurnstileStateChange = useCallback(
    (state: InvisibleTurnstileState) => {
      if (state.status === 'interactive') {
        return;
      }

      if (!TURNSTILE_FAILURE_STATUSES.has(state.status)) {
        if (state.status === 'verified' || state.status === 'bypassed') {
          if (turnstileFailureActiveRef.current) {
            turnstileFailureActiveRef.current = false;
            setStatus('idle');
            setErrorMessage('');
          }
          setTurnstileFailed(false);
        }
        return;
      }

      turnstileFailureActiveRef.current = true;
      setTurnstileFailed(true);
      setTurnstileToken('');
      setStatus('error');
      setErrorMessage(
        state.message ?? 'Subscription is temporarily unavailable.'
      );
    },
    []
  );

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
      setEmail('');
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
      aria-labelledby={`${formId}-heading`}
      data-pen-source='qKrDn'
      data-visual-state={status}
      className='rounded-2xl bg-surface-1 p-6'
    >
      {/* eslint-disable @jovie/canonical-ui-label-casing -- approved qKrDn sentence-case heading */}
      <h2
        id={`${formId}-heading`}
        className='line-clamp-2 text-2xl font-semibold tracking-tight text-primary-token'
      >
        Get product updates
      </h2>
      {/* eslint-enable @jovie/canonical-ui-label-casing */}
      <p className='mt-4 text-base text-secondary-token'>
        New features and improvements from Jovie.
      </p>
      <div className='mt-4 grid'>
        <form
          onSubmit={handleSubmit}
          data-testid='changelog-subscribe-form'
          aria-hidden={settled || undefined}
          inert={settled}
          className={`col-start-1 row-start-1 grid gap-4 ${settled ? 'invisible pointer-events-none' : ''}`}
        >
          <label
            htmlFor={`${formId}-email`}
            className='text-sm text-primary-token'
          >
            Email Address
          </label>
          <Input
            ref={inputRef}
            id={`${formId}-email`}
            name='email'
            type='email'
            autoComplete='email'
            maxLength={254}
            inputSize='lg'
            // eslint-disable-next-line @jovie/canonical-ui-label-casing -- email placeholder literal
            placeholder='you@email.com'
            value={email}
            onChange={e => {
              setEmail(e.target.value);
              if (status === 'error' && !turnstileFailed) {
                setStatus('idle');
                setErrorMessage('');
              }
            }}
            required
            className='h-11 min-w-0 rounded-lg'
            disabled={status === 'submitting'}
            aria-invalid={
              status === 'error' && !turnstileFailed ? 'true' : undefined
            }
            aria-describedby={`${formId}-consent${status === 'error' ? ` ${formId}-error` : ''}`}
          />
          <div className='flex min-h-11 items-center'>
            <Button
              type='submit'
              size='marketing'
              className='w-full'
              loading={status === 'submitting'}
              disabled={
                status === 'submitting' ||
                turnstileFailed ||
                (turnstileRequired && !turnstileToken)
              }
              aria-describedby={
                status === 'error' ? `${formId}-error` : undefined
              }
            >
              Subscribe
            </Button>
          </div>
          {settled ? null : (
            <InvisibleTurnstile
              onToken={setTurnstileToken}
              onStateChange={handleTurnstileStateChange}
              resetSignal={turnstileResetSignal}
            />
          )}
        </form>
        <div
          ref={statusRef}
          tabIndex={-1}
          role='status'
          aria-live='polite'
          data-testid='changelog-success-message'
          className={
            settled
              ? 'col-start-1 row-start-1 self-center text-sm text-primary-token'
              : 'sr-only'
          }
        >
          {settled
            ? successMessage
            : status === 'submitting'
              ? 'Subscribing…'
              : ''}
        </div>
      </div>
      <p id={`${formId}-consent`} className='mt-4 text-xs text-tertiary-token'>
        Subscribe to Jovie changelog emails. Unsubscribe anytime.
      </p>
      <p
        id={`${formId}-error`}
        className='mt-3 min-h-10 text-sm text-accent-red'
        role={status === 'error' ? 'alert' : undefined}
      >
        {status === 'error' ? errorMessage : ''}
      </p>
    </section>
  );
}
