'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useId, useMemo, useState } from 'react';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/error-tracking';
import {
  SMS_CONSENT_TEXT,
  SMS_CONSENT_VERSION,
} from '@/lib/notifications/sms-consent-shared';
import {
  normalizeSubscriptionEmail,
  normalizeSubscriptionPhone,
} from '@/lib/notifications/validation';
import { useSubscribeNotificationsMutation } from '@/lib/queries/useNotificationStatusQuery';
import type { Artist } from '@/types/db';
import type { NotificationChannel } from '@/types/notifications';

interface AlertGrowthLandingProps {
  readonly artist: Artist;
  /**
   * Optional explicit source-link code override (server-provided). When
   * omitted the component reads `?s=<code>` from the live URL via
   * `useSearchParams`, which lets the page render statically.
   */
  readonly sourceCode?: string;
}

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'pending_confirmation'; channel: NotificationChannel }
  | { kind: 'subscribed'; channel: NotificationChannel }
  | { kind: 'error'; message: string };

const US_COUNTRY_CODE = 'US';
// Source-link codes come from a public query string; sanitize at the boundary
// to a tight charset so analytics/funnel parsers stay honest, no matter what
// a bot or paste accident sends.
const SOURCE_CODE_CHARSET = /[^a-zA-Z0-9_-]/g;
const SOURCE_CODE_MAX_LEN = 32;

// NANP: US area codes (and exchange codes) start with 2-9; treating
// anything that starts with 0 or 1 as US is how `+44 7700 ...` ends up
// becoming a malformed `+1447700...`. Enforce the 10-digit form here.
const US_NATIONAL_RE = /^[2-9]\d{9}$/;

/**
 * Build a US E.164 number from raw user input or return null.
 *
 * Strict: only accepts a 10-digit US national number whose first digit
 * is 2-9 (NANP), or 11 digits starting with `1`, or `+1` followed by a
 * valid 10-digit national number. Anything else (a `+44` paste, a
 * `0`-prefixed national number, an empty string, etc.) returns null so
 * the form rejects it instead of mangling it into a malformed
 * `+1<international-digits>` string that Twilio would reject — or
 * worse, route to the wrong country and bill the artist for it.
 */
function buildUsPhoneE164(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Reject any non-US international format (`+44`, `+33`, etc.).
  if (
    /^\+/.test(trimmed) &&
    !/^\+1[2-9]\d{9}$/.test(trimmed.replaceAll(/\s+/g, ''))
  ) {
    return null;
  }
  const digits = trimmed.replaceAll(/[^\d]/g, '');
  if (digits.length === 10 && US_NATIONAL_RE.test(digits)) {
    return `+1${digits}`;
  }
  if (
    digits.length === 11 &&
    digits.startsWith('1') &&
    US_NATIONAL_RE.test(digits.slice(1))
  ) {
    return `+${digits}`;
  }
  return null;
}

function sanitizeSourceCode(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .replace(SOURCE_CODE_CHARSET, '')
    .slice(0, SOURCE_CODE_MAX_LEN);
  return cleaned || undefined;
}

export function AlertGrowthLanding({
  artist,
  sourceCode: sourceCodeProp,
}: AlertGrowthLandingProps) {
  const [channel, setChannel] = useState<NotificationChannel>('sms');
  const [phoneInput, setPhoneInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: 'idle' });

  const subscribeMutation = useSubscribeNotificationsMutation();
  const phoneInputId = useId();
  const emailInputId = useId();
  const consentId = useId();

  // Read `?s=<code>` from the live URL so the parent page can render
  // statically (using searchParams in the page would force dynamic SSR).
  // Server-provided `sourceCode` (tests, future programmatic mounts) wins.
  const searchParams = useSearchParams();
  const queryCode = searchParams?.get('s') ?? undefined;
  const sourceCode = sanitizeSourceCode(sourceCodeProp ?? queryCode);

  const source = useMemo(
    () => (sourceCode ? `alerts-landing:${sourceCode}` : 'alerts-landing'),
    [sourceCode]
  );

  const artistName = artist.name?.trim() || artist.handle;

  const handleChannelChange = useCallback((next: NotificationChannel) => {
    setChannel(next);
    setSubmitState({ kind: 'idle' });
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      // Bail on every non-input state — pending in-flight, OR already
      // verified/pending-confirmation (don't double-submit on tap-spam).
      if (submitState.kind !== 'idle' && submitState.kind !== 'error') {
        return;
      }

      const isSms = channel === 'sms';
      const builtPhone = isSms ? buildUsPhoneE164(phoneInput) : null;
      const phoneE164 =
        builtPhone !== null ? normalizeSubscriptionPhone(builtPhone) : null;
      const email = isSms ? null : normalizeSubscriptionEmail(emailInput);

      if (isSms && !phoneE164) {
        setSubmitState({
          kind: 'error',
          message: 'Please enter a valid US phone number.',
        });
        return;
      }
      if (!isSms && !email) {
        setSubmitState({
          kind: 'error',
          message: 'Please enter a valid email address.',
        });
        return;
      }

      setSubmitState({ kind: 'pending' });
      track('alerts_landing_subscribe_attempt', {
        channel,
        source,
        handle: artist.handle,
        has_source_code: Boolean(sourceCode),
      });

      try {
        const response = await subscribeMutation.mutateAsync({
          artistId: artist.id,
          channel,
          phone: phoneE164 ?? undefined,
          email: email ?? undefined,
          countryCode: isSms ? US_COUNTRY_CODE : undefined,
          source,
        });

        track('alerts_landing_subscribe_success', {
          channel,
          source,
          handle: artist.handle,
          pending_confirmation: response.pendingConfirmation ?? false,
        });

        if (response.pendingConfirmation) {
          setSubmitState({ kind: 'pending_confirmation', channel });
        } else {
          setSubmitState({ kind: 'subscribed', channel });
        }
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : 'Something went wrong. Please try again.';
        setSubmitState({ kind: 'error', message });

        void captureError('Alert landing subscribe failed', err, {
          artistId: artist.id,
          artistHandle: artist.handle,
          channel,
          source,
        });
      }
    },
    [
      artist.handle,
      artist.id,
      channel,
      emailInput,
      phoneInput,
      source,
      sourceCode,
      submitState.kind,
      subscribeMutation,
    ]
  );

  const isPending = submitState.kind === 'pending';
  const isDone =
    submitState.kind === 'pending_confirmation' ||
    submitState.kind === 'subscribed';

  return (
    <main className='min-h-dvh bg-(--linear-app-content-surface) text-primary-token'>
      <div className='mx-auto flex min-h-dvh max-w-3xl flex-col px-6 py-16 sm:py-24'>
        <header className='mb-10'>
          <p className='text-secondary-token text-sm'>{APP_LABEL}</p>
          <h1 className='mt-2 text-3xl font-semibold leading-tight sm:text-5xl'>
            Get the next drop first.
          </h1>
          <p className='text-secondary-token mt-4 max-w-xl text-base sm:text-lg'>
            Text or email alerts for new music, tour dates, and major updates
            from <span className='text-primary-token'>{artistName}</span>.
          </p>
        </header>

        {isDone ? (
          <SubscribedState
            channel={
              submitState.kind === 'pending_confirmation' ||
              submitState.kind === 'subscribed'
                ? submitState.channel
                : channel
            }
            pending={submitState.kind === 'pending_confirmation'}
          />
        ) : (
          <form onSubmit={handleSubmit} className='space-y-5' noValidate>
            <fieldset className='flex gap-2 border-0 p-0 m-0'>
              <legend className='sr-only'>Choose a channel</legend>
              <ChannelToggle
                pressed={channel === 'sms'}
                disabled={isPending}
                label='Text me'
                onSelect={() => handleChannelChange('sms')}
              />
              <ChannelToggle
                pressed={channel === 'email'}
                disabled={isPending}
                label='Email me'
                onSelect={() => handleChannelChange('email')}
              />
            </fieldset>

            <div className='space-y-2'>
              {channel === 'sms' ? (
                <>
                  <label htmlFor={phoneInputId} className='sr-only'>
                    Mobile number
                  </label>
                  <input
                    id={phoneInputId}
                    name='phone'
                    type='tel'
                    inputMode='tel'
                    autoComplete='tel-national'
                    placeholder='(555) 555-1234'
                    aria-describedby={consentId}
                    value={phoneInput}
                    onChange={e => setPhoneInput(e.target.value)}
                    disabled={isPending}
                    className='border-subtle bg-surface-0 text-primary-token focus-visible:ring-accent w-full rounded-2xl border px-4 py-4 text-base focus:outline-none focus-visible:ring-2'
                  />
                </>
              ) : (
                <>
                  <label htmlFor={emailInputId} className='sr-only'>
                    Email address
                  </label>
                  <input
                    id={emailInputId}
                    name='email'
                    type='email'
                    inputMode='email'
                    autoComplete='email'
                    placeholder='you@example.com'
                    aria-describedby={consentId}
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    disabled={isPending}
                    className='border-subtle bg-surface-0 text-primary-token focus-visible:ring-accent w-full rounded-2xl border px-4 py-4 text-base focus:outline-none focus-visible:ring-2'
                  />
                </>
              )}
            </div>

            <button
              type='submit'
              disabled={isPending}
              className='bg-accent text-on-accent w-full rounded-2xl px-4 py-4 text-base font-semibold disabled:opacity-60'
            >
              {isPending ? 'Sending…' : 'Get alerts'}
            </button>

            {submitState.kind === 'error' ? (
              <p
                role='alert'
                className='text-error-token text-sm'
                data-testid='alerts-landing-error'
              >
                {submitState.message}
              </p>
            ) : null}

            <p
              id={consentId}
              className='text-secondary-token text-xs leading-relaxed'
              data-consent-version={SMS_CONSENT_VERSION}
            >
              {channel === 'sms' ? (
                SMS_CONSENT_TEXT
              ) : (
                <>
                  By subscribing, you agree to receive release emails from{' '}
                  {artistName} via Jovie. Unsubscribe anytime from any email.
                </>
              )}
            </p>
          </form>
        )}

        <ul className='mt-12 grid gap-4 sm:grid-cols-3'>
          {PROOF_POINTS.map(point => (
            <li
              key={point}
              className='bg-surface-1 border-subtle text-secondary-token rounded-2xl border p-4 text-sm'
            >
              {point}
            </li>
          ))}
        </ul>

        <footer className='text-secondary-token mt-auto pt-12 text-xs'>
          Powered by{' '}
          <Link href='/' className='text-primary-token underline'>
            Jovie
          </Link>{' '}
          · Owned fan demand, not junk traffic.
        </footer>
      </div>
    </main>
  );
}

function ChannelToggle({
  pressed,
  disabled,
  label,
  onSelect,
}: {
  readonly pressed: boolean;
  readonly disabled: boolean;
  readonly label: string;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type='button'
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onSelect}
      className={
        pressed
          ? 'border-accent bg-accent/10 text-primary-token flex-1 rounded-2xl border px-4 py-3 text-sm font-semibold disabled:opacity-60'
          : 'border-subtle bg-surface-0 text-secondary-token flex-1 rounded-2xl border px-4 py-3 text-sm font-semibold disabled:opacity-60'
      }
    >
      {label}
    </button>
  );
}

function SubscribedState({
  channel,
  pending,
}: {
  readonly channel: NotificationChannel;
  readonly pending: boolean;
}) {
  if (pending) {
    return (
      <div
        role='status'
        className='bg-surface-1 border-subtle rounded-2xl border p-6'
        data-testid='alerts-landing-pending'
      >
        <h2 className='text-primary-token text-lg font-semibold'>
          Check your {channel === 'sms' ? 'phone' : 'inbox'}.
        </h2>
        <p className='text-secondary-token mt-2 text-sm'>
          {channel === 'sms'
            ? 'We sent a confirmation. Reply YES to lock it in.'
            : 'We emailed a 6-digit code. Open the email to confirm.'}
        </p>
      </div>
    );
  }

  return (
    <div
      role='status'
      className='bg-surface-1 border-subtle rounded-2xl border p-6'
      data-testid='alerts-landing-success'
    >
      <h2 className='text-primary-token text-lg font-semibold'>
        You&apos;re on the list.
      </h2>
      <p className='text-secondary-token mt-2 text-sm'>
        We&apos;ll {channel === 'sms' ? 'text' : 'email'} you when there&apos;s
        something worth your time. Reply STOP to opt out anytime.
      </p>
    </div>
  );
}

const APP_LABEL = 'Jovie Alerts';

const PROOF_POINTS = [
  'New music the moment it drops',
  'Tour dates and presale windows',
  'Merch drops and major announcements',
] as const;
