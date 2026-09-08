'use client';

import { Button } from '@jovie/ui/atoms/button';
import { Input } from '@jovie/ui/atoms/input';
import { type FormEvent, useCallback, useRef, useState } from 'react';
import {
  InvisibleTurnstile,
  type InvisibleTurnstileState,
  isTurnstileClientBypassed,
  isTurnstileClientConfigured,
} from '@/components/atoms/InvisibleTurnstile';

type Status = 'idle' | 'submitting' | 'success' | 'error';
type CompactVisualState = 'expanded' | 'submitting' | 'success' | 'error';

const TURNSTILE_FAILURE_STATUSES = new Set([
  'error',
  'expired',
  'timeout',
  'unsupported',
  'unconfigured',
]);

function getCompactVisualState(status: Status): CompactVisualState {
  if (status === 'success') return 'success';
  if (status === 'submitting') return 'submitting';
  if (status === 'error') return 'error';
  return 'expanded';
}

export function ChangelogEmailSignup() {
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

  const visualState = getCompactVisualState(status);

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
          source: 'changelog_page',
        }),
      });

      const data = (await res.json()) as { message?: string; error?: string };

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      setStatus('success');
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
    <div
      id='changelog-subscribe'
      className='rounded-2xl border border-subtle bg-surface-1 p-6 md:p-8'
    >
      {/* eslint-disable-next-line @jovie/canonical-ui-label-casing -- sentence-case marketing heading */}
      <h3 className='text-lg font-semibold tracking-tight'>
        Get the good stuff
      </h3>
      <p className='mb-5 mt-2 text-sm text-secondary-token'>
        Occasional meaningful updates — not every deploy.
      </p>

      <div role='status' aria-live='polite' className='sr-only'>
        {status === 'success'
          ? 'Check your email to confirm your subscription!'
          : ''}
      </div>

      <div data-ui='cta-reveal' data-visual-state={visualState}>
        <div className='cta-reveal-shell'>
          <form
            onSubmit={handleSubmit}
            data-testid='changelog-subscribe-form'
            className='cta-reveal-panel cta-reveal-panel--form'
          >
            <div className='grid gap-2 p-1 sm:grid-cols-[minmax(0,1fr)_auto]'>
              <Input
                ref={inputRef}
                type='email'
                inputSize='lg'
                // eslint-disable-next-line @jovie/canonical-ui-label-casing -- natural aria-label phrasing
                aria-label='Email address for product updates'
                // eslint-disable-next-line @jovie/canonical-ui-label-casing -- email placeholder literal
                placeholder='you@example.com'
                value={email}
                onChange={e => {
                  setEmail(e.target.value);
                  if (status === 'error' && !turnstileFailed) {
                    setStatus('idle');
                    setErrorMessage('');
                  }
                }}
                required
                className='min-w-0 border-transparent bg-transparent shadow-none hover:border-transparent focus-visible:border-transparent'
                disabled={status === 'submitting'}
                aria-invalid={
                  status === 'error' && !turnstileFailed ? 'true' : undefined
                }
                aria-describedby={
                  status === 'error' ? 'changelog-subscribe-status' : undefined
                }
              />

              <Button
                type='submit'
                size='lg'
                loading={status === 'submitting'}
                disabled={
                  status === 'submitting' ||
                  turnstileFailed ||
                  (turnstileRequired && !turnstileToken)
                }
                aria-describedby={
                  status === 'error' ? 'changelog-subscribe-status' : undefined
                }
              >
                Subscribe
              </Button>
            </div>
            {status === 'success' ? null : (
              <InvisibleTurnstile
                onToken={setTurnstileToken}
                onStateChange={handleTurnstileStateChange}
                resetSignal={turnstileResetSignal}
              />
            )}
          </form>

          <div className='cta-reveal-panel cta-reveal-panel--status p-1'>
            <div
              data-testid='changelog-success-message'
              className='flex min-h-12 items-center justify-center rounded-full bg-surface-1 px-5 text-center text-sm font-medium text-primary-token'
            >
              Check your email to confirm your subscription!
            </div>
          </div>
        </div>

        <p
          id='changelog-subscribe-status'
          className='cta-reveal-support mt-3 text-sm text-accent-red'
          role={status === 'error' ? 'alert' : undefined}
        >
          {status === 'error' ? errorMessage : ''}
        </p>
      </div>
    </div>
  );
}
