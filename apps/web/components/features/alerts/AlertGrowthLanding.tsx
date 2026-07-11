'use client';

import { ArrowLeft, X } from 'lucide-react';
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
  /**
   * In-page exit target. Defaults to the artist profile so visitors always
   * have a non-browser-chrome way out of the capture surface (JOV-3513).
   */
  readonly exitHref?: string;
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
  // For `+`-prefixed input, strip ALL non-digits before validating — the
  // browser's `type="tel"` plus the placeholder `(555) 555-1234` actively
  // encourage formatted entry (`+1 (555) 555-1234`, `+1-555-555-1234`),
  // and earlier this code only stripped spaces, falsely rejecting them.
  // Anything that's not exactly 11 digits starting with a NANP `1` after
  // formatting is stripped (so `+44 …` and `+33 …` are still rejected).
  if (trimmed.startsWith('+')) {
    const plusDigits = trimmed.replaceAll(/[^\d]/g, '');
    if (
      plusDigits.length !== 11 ||
      !plusDigits.startsWith('1') ||
      !US_NATIONAL_RE.test(plusDigits.slice(1))
    ) {
      return null;
    }
    return `+${plusDigits}`;
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

function getInputValidationError(
  isSms: boolean,
  phoneE164: string | null,
  email: string | null
): string | null {
  if (isSms && !phoneE164) return 'Please enter a valid US phone number.';
  if (!isSms && !email) return 'Please enter a valid email address.';
  return null;
}

export function AlertGrowthLanding({
  artist,
  sourceCode: sourceCodeProp,
  exitHref,
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
  const profileHref =
    exitHref ?? `/${encodeURIComponent(artist.handle.trim().toLowerCase())}`;

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

      const validationError = getInputValidationError(isSms, phoneE164, email);
      if (validationError) {
        setSubmitState({ kind: 'error', message: validationError });
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
      <div className='mx-auto flex min-h-dvh max-w-108 flex-col px-5 py-6 sm:py-10'>
        <div className='mb-4 flex items-center justify-between gap-3'>
          <Link
            href={profileHref}
            className='inline-flex h-10 items-center gap-1.5 rounded-full px-1 text-sm font-medium text-secondary-token transition-colors duration-subtle hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
            data-testid='alerts-landing-back'
            aria-label={`Back To ${artistName}`}
          >
            <ArrowLeft className='h-4 w-4' aria-hidden='true' />
            <span>Back</span>
          </Link>
          <Link
            href={profileHref}
            className='inline-flex h-10 w-10 items-center justify-center rounded-full text-secondary-token transition-colors duration-subtle hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
            data-testid='alerts-landing-close'
            aria-label='Close Alerts Capture'
          >
            <X className='h-4 w-4' aria-hidden='true' />
          </Link>
        </div>

        <header className='mb-6'>
          <p className='text-secondary-token text-app'>{APP_LABEL}</p>
          <h1 className='mt-2 text-2xl font-semibold leading-[1.08] tracking-normal'>
            Get Alerts First.
          </h1>
          <p className='text-secondary-token mt-3 max-w-[28rem] text-sm leading-5'>
            Text or email alerts for new music, shows, and major updates from{' '}
            <span className='text-primary-token'>{artistName}</span>.
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
                label='Text Me'
                onSelect={() => handleChannelChange('sms')}
              />
              <ChannelToggle
                pressed={channel === 'email'}
                disabled={isPending}
                label='Email Me'
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
                    className='border-subtle bg-surface-0 text-primary-token focus-visible:ring-accent h-12 w-full rounded-(--profile-action-radius) border px-3.5 text-base focus:outline-none focus-visible:ring-2'
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
                    // eslint-disable-next-line @jovie/canonical-ui-label-casing
                    placeholder='you@example.com'
                    aria-describedby={consentId}
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    disabled={isPending}
                    className='border-subtle bg-surface-0 text-primary-token focus-visible:ring-accent h-12 w-full rounded-(--profile-action-radius) border px-3.5 text-base focus:outline-none focus-visible:ring-2'
                  />
                </>
              )}
            </div>

            <button
              type='submit'
              disabled={isPending}
              className='h-12 w-full rounded-(--profile-action-radius) border border-(--linear-btn-primary-border) bg-btn-primary px-4 text-sm font-semibold text-btn-primary-foreground shadow-button-inset transition-colors duration-subtle hover:border-(--linear-btn-primary-hover) hover:bg-btn-primary-hover disabled:opacity-60'
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
              data-consent-version={
                channel === 'sms' ? SMS_CONSENT_VERSION : undefined
              }
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

        <ul className='mt-8 grid gap-2'>
          {PROOF_POINTS.map(point => (
            <li
              key={point}
              className='border-subtle text-secondary-token rounded-(--profile-action-radius) border bg-surface-1 px-3.5 py-3 text-app'
            >
              {point}
            </li>
          ))}
        </ul>

        <div className='mt-6 text-center'>
          <Link
            href={profileHref}
            className='text-secondary-token text-sm underline-offset-4 transition-colors duration-subtle hover:text-primary-token hover:underline'
            data-testid='alerts-landing-maybe-later'
          >
            Maybe Later
          </Link>
        </div>

        <footer className='text-secondary-token mt-auto pt-10 text-xs'>
          Powered by{' '}
          <Link href='/' className='text-primary-token underline'>
            Jovie
          </Link>{' '}
          · Fan alerts, direct from the artist.
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
          ? 'border-default bg-surface-1 text-primary-token flex-1 rounded-(--profile-action-radius) border px-4 py-3 text-app font-semibold disabled:opacity-60'
          : 'border-subtle bg-surface-0 text-secondary-token flex-1 rounded-(--profile-action-radius) border px-4 py-3 text-app font-semibold disabled:opacity-60'
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
        className='bg-surface-1 border-subtle rounded-(--profile-card-radius) border p-5'
        data-testid='alerts-landing-pending'
      >
        <h2 className='text-primary-token text-base font-semibold tracking-normal'>
          Check Your {channel === 'sms' ? 'Phone' : 'Inbox'}.
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
      className='bg-surface-1 border-subtle rounded-(--profile-card-radius) border p-5'
      data-testid='alerts-landing-success'
    >
      <h2 className='text-primary-token text-base font-semibold tracking-normal'>
        You&apos;re On The List.
      </h2>
      <p className='text-secondary-token mt-2 text-sm'>
        {channel === 'sms'
          ? "We'll text you when there's something worth your time. Reply STOP to opt out anytime."
          : "We'll email you when there's something worth your time. Unsubscribe anytime from any email."}
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
