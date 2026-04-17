'use client';

import { Button } from '@jovie/ui/atoms/button';
import { Input } from '@jovie/ui/atoms/input';
import { ArrowRight, Mail } from 'lucide-react';
import {
  type CSSProperties,
  type FocusEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
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
  const shellRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();

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

    setStatus('submitting');
    setErrorMessage('');

    try {
      const res = await fetch('/api/changelog/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          turnstileToken: '',
          source: 'changelog_page',
        }),
      });

      const data = (await res.json()) as { message?: string; error?: string };

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      setStatus('success');
      setEmail('');
      setIsExpanded(true);
    } catch (err) {
      setStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'Something went wrong'
      );
      setIsExpanded(true);
    }
  }

  return (
    <div
      id='changelog-subscribe'
      className='rounded-2xl p-8 md:p-10'
      style={{
        backgroundColor:
          'color-mix(in srgb, var(--linear-text-primary) 3%, transparent)',
        border:
          '1px solid color-mix(in srgb, var(--linear-text-primary) 8%, transparent)',
      }}
    >
      <div className='mb-3 flex items-center gap-3'>
        <Mail className='h-5 w-5 opacity-50' />
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
        style={
          {
            '--cta-reveal-min-height': '56px',
          } as CSSProperties
        }
      >
        <div className='cta-reveal-shell'>
          <div className='cta-reveal-panel cta-reveal-panel--cta'>
            <button
              type='button'
              data-testid='changelog-reveal-button'
              onClick={expandComposer}
              className='flex min-h-[56px] w-full items-center justify-between gap-3 px-5 text-left text-sm font-medium text-primary-token'
            >
              <span>Subscribe</span>
              <span className='inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-black shadow-sm'>
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
                size='xl'
                loading={status === 'submitting'}
                className='rounded-full px-5'
              >
                Subscribe
              </Button>
            </div>
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
          className='cta-reveal-support mt-3 text-sm text-red-500'
          role={status === 'error' ? 'alert' : undefined}
        >
          {status === 'error' ? errorMessage : ''}
        </p>
      </div>
    </div>
  );
}
