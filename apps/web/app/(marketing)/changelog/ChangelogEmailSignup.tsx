'use client';

import { Button } from '@jovie/ui/atoms/button';
import { Input } from '@jovie/ui/atoms/input';
import { ArrowRight, Mail } from 'lucide-react';
import {
  type FocusEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  InvisibleTurnstile,
  isTurnstileClientBypassed,
  isTurnstileClientConfigured,
} from '@/components/atoms/InvisibleTurnstile';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

type Status = 'idle' | 'submitting' | 'success' | 'error';
type RevealVisualState =
  | 'collapsed'
  | 'expanded'
  | 'submitting'
  | 'success'
  | 'error';

function getRevealVisualState(
  status: Status,
  isExpanded: boolean
): RevealVisualState {
  if (status === 'success') return 'success';
  if (!isExpanded) return 'collapsed';
  if (status === 'submitting') return 'submitting';
  if (status === 'error') return 'error';
  return 'expanded';
}

export function ChangelogEmailSignup() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
  const shellRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const turnstileRequired =
    isTurnstileClientConfigured() && !isTurnstileClientBypassed();

  const visualState = getRevealVisualState(status, isExpanded);

  useEffect(() => {
    if (!isExpanded || status === 'success') return;

    const timeoutId = globalThis.setTimeout(
      () => {
        inputRef.current?.focus({ preventScroll: true });
      },
      prefersReducedMotion ? 0 : 60
    );

    return () => globalThis.clearTimeout(timeoutId);
  }, [isExpanded, prefersReducedMotion, status]);

  function expandComposer() {
    setIsExpanded(true);
  }

  function collapseComposerIfEmpty() {
    if (status === 'submitting' || status === 'success') return;
    if (email.trim()) return;

    setIsExpanded(false);
    setErrorMessage('');
    setStatus('idle');
  }

  function handleShellBlurCapture(_event: FocusEvent<HTMLDivElement>) {
    globalThis.setTimeout(() => {
      const activeElement = document.activeElement;
      if (shellRef.current?.contains(activeElement)) {
        return;
      }

      collapseComposerIfEmpty();
    }, 0);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!email.trim()) {
      expandComposer();
      inputRef.current?.focus({ preventScroll: true });
      return;
    }

    if (turnstileRequired && !turnstileToken) {
      setStatus('error');
      setErrorMessage('Security check is still loading. Please try again.');
      setIsExpanded(true);
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
      setTurnstileResetSignal(signal => signal + 1);
      setIsExpanded(true);
    } catch (err) {
      setStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'Something went wrong'
      );
      setTurnstileResetSignal(signal => signal + 1);
      setIsExpanded(true);
    }
  }

  return (
    <div
      id='changelog-subscribe'
      className='rounded-2xl border border-subtle bg-surface-1 p-8 md:p-10'
    >
      <div className='mb-3 flex items-center gap-3'>
        <Mail className='h-5 w-5 opacity-50' />
        {/* eslint-disable-next-line @jovie/canonical-ui-label-casing -- sentence-case marketing heading */}
        <h3 className='text-lg font-semibold tracking-tight'>
          Stay in the loop
        </h3>
      </div>
      <p className='mb-6 text-sm opacity-60'>
        Get notified when we ship something new. No spam, just product updates.
      </p>

      <div role='status' aria-live='polite' className='sr-only'>
        {status === 'success'
          ? 'Check your email to confirm your subscription!'
          : ''}
      </div>

      <div
        ref={shellRef}
        data-ui='cta-reveal'
        data-visual-state={visualState}
        onBlurCapture={handleShellBlurCapture}
      >
        <div className='cta-reveal-shell'>
          <div className='cta-reveal-panel cta-reveal-panel--cta'>
            <button
              type='button'
              data-testid='changelog-reveal-button'
              onClick={expandComposer}
              className='flex min-h-14 w-full items-center justify-between gap-3 px-5 text-left text-sm font-medium text-primary-token'
            >
              <span>Subscribe</span>
              <span className='inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-black shadow-sm dark:bg-white dark:text-black'>
                <ArrowRight className='h-4 w-4' aria-hidden='true' />
              </span>
            </button>
          </div>

          <form
            onSubmit={handleSubmit}
            data-testid='changelog-reveal-form'
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
                  if (status === 'error') {
                    setStatus('idle');
                    setErrorMessage('');
                  }
                }}
                onFocus={() => {
                  if (!isExpanded) {
                    setIsExpanded(true);
                  }
                }}
                required
                className='min-w-0 border-transparent bg-transparent shadow-none hover:border-transparent focus-visible:border-transparent'
                disabled={status === 'submitting'}
                aria-invalid={status === 'error' ? 'true' : undefined}
              />

              <Button
                type='submit'
                size='lg'
                loading={status === 'submitting'}
                disabled={
                  status === 'submitting' ||
                  (turnstileRequired && !turnstileToken)
                }
              >
                Subscribe
              </Button>
            </div>
            <InvisibleTurnstile
              onToken={setTurnstileToken}
              resetSignal={turnstileResetSignal}
            />
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
          className='cta-reveal-support mt-3 text-sm text-accent-red'
          role={status === 'error' ? 'alert' : undefined}
        >
          {status === 'error' ? errorMessage : ''}
        </p>
      </div>
    </div>
  );
}
