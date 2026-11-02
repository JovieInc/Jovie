'use client';

import { InlineSubscribe } from '@jovie/ui/atoms/inline-subscribe';
import { RadioGroup, RadioGroupItem } from '@jovie/ui/atoms/radio-group';
import { type FormEvent, useCallback, useId, useRef, useState } from 'react';
import {
  InvisibleTurnstile,
  type InvisibleTurnstileState,
  isTurnstileClientBypassed,
  isTurnstileClientConfigured,
} from '@/components/atoms/InvisibleTurnstile';
import { track } from '@/lib/analytics';
import { WAITLIST_ROLES, type WaitlistRole } from '@/lib/waitlist/roles';

type Status = 'idle' | 'submitting' | 'joined' | 'error';

const TURNSTILE_FAILURE_STATUSES = new Set([
  'error',
  'expired',
  'timeout',
  'unsupported',
  'unconfigured',
]);

export const WAITLIST_ROLE_FORM_ENDPOINT = '/api/waitlist/join';

/**
 * Closed-signup waitlist form (canon/PRODUCT.md, 2026-11-02): role and email,
 * Turnstile-gated, no account. Uses the one email-capture control
 * (`InlineSubscribe`, built on `CompositeField`).
 */
export function WaitlistRoleForm() {
  const formId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [role, setRole] = useState<WaitlistRole | ''>('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
  const [turnstileFailed, setTurnstileFailed] = useState(false);
  const turnstileRequired =
    isTurnstileClientConfigured() && !isTurnstileClientBypassed();

  const handleTurnstileStateChange = useCallback(
    (state: InvisibleTurnstileState) => {
      if (state.status === 'verified' || state.status === 'bypassed') {
        setTurnstileFailed(false);
        return;
      }
      if (!TURNSTILE_FAILURE_STATUSES.has(state.status)) return;
      setTurnstileFailed(true);
      setTurnstileToken('');
      setStatus('error');
      setErrorMessage(
        state.message ?? 'Security check unavailable. Please try again.'
      );
    },
    []
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (status === 'submitting' || status === 'joined') return;

    if (!role) {
      setStatus('error');
      setErrorMessage('Choose the role that fits you best.');
      return;
    }
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
      const response = await fetch(WAITLIST_ROLE_FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role, turnstileToken }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        state?: string;
        error?: string;
      };
      if (!response.ok || data.state !== 'joined') {
        throw new Error(
          data.error || 'Something went wrong. Please try again.'
        );
      }
      track('waitlist_role_form_joined', { role });
      setStatus('joined');
    } catch (error) {
      setStatus('error');
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Something went wrong. Please try again.'
      );
    } finally {
      setTurnstileToken('');
      setTurnstileResetSignal(signal => signal + 1);
    }
  }

  if (status === 'joined') {
    return (
      <div
        data-testid='waitlist-role-form-joined'
        role='status'
        className='flex w-full flex-col items-center gap-2 text-center'
      >
        <h1 className='text-balance text-xl font-medium tracking-tight text-primary-token'>
          Request Received
        </h1>
        <p className='text-sm text-secondary-token'>
          We&apos;ll email you an invite when your spot opens.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid='waitlist-role-form'
      aria-labelledby={`${formId}-heading`}
      className='flex w-full flex-col items-center gap-5'
    >
      <h1
        id={`${formId}-heading`}
        className='text-balance text-xl font-medium tracking-tight text-primary-token'
      >
        Request Access
      </h1>
      <RadioGroup
        aria-label='Role'
        value={role}
        onValueChange={value => {
          setRole(value as WaitlistRole);
          if (status === 'error' && !turnstileFailed) {
            setStatus('idle');
            setErrorMessage('');
          }
        }}
      >
        {WAITLIST_ROLES.map(option => (
          <label
            key={option.value}
            htmlFor={`${formId}-${option.value}`}
            className='flex min-h-11 cursor-pointer items-center gap-3 text-sm text-primary-token'
          >
            <RadioGroupItem
              id={`${formId}-${option.value}`}
              value={option.value}
            />
            {option.label}
          </label>
        ))}
      </RadioGroup>
      <InlineSubscribe
        className='w-full'
        inputId={`${formId}-email`}
        inputRef={inputRef}
        ariaLabel='Email address'
        buttonLabel='Join'
        value={email}
        onValueChange={value => {
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
        describedBy={`${formId}-error`}
      />
      <InvisibleTurnstile
        onToken={setTurnstileToken}
        onStateChange={handleTurnstileStateChange}
        resetSignal={turnstileResetSignal}
      />
      <p
        id={`${formId}-error`}
        className='min-h-5 text-sm text-accent-red'
        role={status === 'error' ? 'alert' : undefined}
      >
        {status === 'error' ? errorMessage : ''}
      </p>
    </form>
  );
}
