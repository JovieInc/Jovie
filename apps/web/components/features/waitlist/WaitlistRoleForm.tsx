'use client';

import { InlineSubscribe } from '@jovie/ui/atoms/inline-subscribe';
import { Input } from '@jovie/ui/atoms/input';
import { RadioGroup, RadioGroupItem } from '@jovie/ui/atoms/radio-group';
import {
  type FormEvent,
  Fragment,
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
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import {
  GENERAL_WAITLIST_ROLES,
  WAITLIST_ROLES,
  type WaitlistRole,
} from '@/lib/waitlist/roles';

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
 * Chip presentation (homepage v1): the design names Producer and Songwriter
 * separately; the stored role is still the one `producer_songwriter` value.
 */
const ROLE_CHIPS: ReadonlyArray<{
  readonly key: string;
  readonly label: string;
  readonly role: WaitlistRole;
}> = [
  { key: 'artist', label: 'Artist', role: 'artist' },
  { key: 'manager', label: 'Manager', role: 'manager' },
  { key: 'label', label: 'Label', role: 'label' },
  { key: 'producer', label: 'Producer', role: 'producer_songwriter' },
  { key: 'songwriter', label: 'Songwriter', role: 'producer_songwriter' },
  { key: 'other', label: 'Other', role: 'other' },
];

/**
 * Closed-signup waitlist form (canon/PRODUCT.md, 2026-11-02): role and email,
 * Turnstile-gated, no account. Uses the one email-capture control
 * (`InlineSubscribe`, built on `CompositeField`).
 */
export function WaitlistRoleForm({
  variant = 'artist',
  headingLevel = 1,
  title = 'Request access',
  description,
  headingClassName,
  align = 'center',
  presentation = 'stack',
  roleLabel = 'I’m a',
  submitLabel = 'Join',
  note,
}: Readonly<{
  variant?: 'artist' | 'general';
  /** `chips` renders role chips and a labelled submit; the host owns the heading. */
  presentation?: 'stack' | 'chips';
  roleLabel?: string;
  submitLabel?: string;
  /** Microcopy under the field (chips presentation). */
  note?: string;
  headingLevel?: 1 | 2 | 3;
  /** Form heading; a host page may name the action in its own words. */
  title?: string;
  /** Optional single support line under the heading. */
  description?: string;
  /** Host type role for the heading (e.g. the marketing section title). */
  headingClassName?: string;
  /** Stack alignment. `start` keeps heading, copy and controls on one edge. */
  align?: 'center' | 'start';
}>) {
  const stackAlign =
    align === 'start' ? 'items-start text-left' : 'items-center text-center';
  const formId = useId();
  const Heading = headingLevel === 1 ? 'h1' : headingLevel === 2 ? 'h2' : 'h3';
  const roles = variant === 'general' ? GENERAL_WAITLIST_ROLES : WAITLIST_ROLES;
  const [name, setName] = useState('');
  const confirmationRef = useRef<HTMLDivElement>(null);
  const joinedRef = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [role, setRole] = useState<WaitlistRole | ''>(
    presentation === 'chips' ? 'artist' : ''
  );
  const [chipKey, setChipKey] = useState(
    presentation === 'chips' ? 'artist' : ''
  );
  const chips = presentation === 'chips';
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
  const [turnstileFailed, setTurnstileFailed] = useState(false);
  // Load Cloudflare's check only once the visitor touches the form: on load
  // it put a CSP-blocked probe and vendor console errors on every homepage
  // view (product crawl, 2026-11-08).
  const [securityCheckArmed, setSecurityCheckArmed] = useState(false);
  const turnstileRequired =
    isTurnstileClientConfigured() && !isTurnstileClientBypassed();

  useEffect(() => {
    if (status === 'joined') {
      confirmationRef.current?.focus({ preventScroll: true });
    }
  }, [status]);

  const handleTurnstileStateChange = useCallback(
    (state: InvisibleTurnstileState) => {
      if (joinedRef.current) return;
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

    if (variant === 'general' && !name.trim()) {
      nameRef.current?.focus({ preventScroll: true });
      setStatus('error');
      setErrorMessage('Enter your name.');
      return;
    }

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
        signal: AbortSignal.timeout(15_000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          role,
          turnstileToken,
          ...(variant === 'general' ? { name: name.trim() } : {}),
        }),
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
      joinedRef.current = true;
      setStatus('joined');
    } catch (error) {
      setStatus('error');
      setErrorMessage(
        (error instanceof DOMException || error instanceof Error) &&
          error.name === 'TimeoutError'
          ? 'Request timed out. Please try again.'
          : error instanceof Error
            ? error.message
            : 'Something went wrong. Please try again.'
      );
    } finally {
      setTurnstileToken('');
      setTurnstileResetSignal(signal => signal + 1);
    }
  }

  return (
    <div className='grid w-full'>
      {status === 'joined' ? (
        <div
          ref={confirmationRef}
          tabIndex={-1}
          data-testid='waitlist-role-form-joined'
          role='status'
          className={cn(
            'col-start-1 row-start-1 flex w-full flex-col gap-2',
            stackAlign
          )}
        >
          <Heading className='text-balance text-xl font-medium tracking-tight text-primary-token'>
            Request received
          </Heading>
          <p className='text-sm text-secondary-token'>
            We&apos;ll email you an invite when your spot opens.
          </p>
        </div>
      ) : null}
      <form
        inert={status === 'joined'}
        aria-hidden={status === 'joined' || undefined}
        onSubmit={handleSubmit}
        onFocusCapture={() => setSecurityCheckArmed(true)}
        onPointerDownCapture={() => setSecurityCheckArmed(true)}
        data-testid='waitlist-role-form'
        data-presentation={presentation}
        aria-label={chips ? title : undefined}
        aria-labelledby={chips ? undefined : `${formId}-heading`}
        className={cn(
          'col-start-1 row-start-1 flex w-full flex-col',
          chips ? 'gap-6' : 'gap-5',
          align === 'start' ? 'items-start' : 'items-center',
          status === 'joined' && 'invisible'
        )}
      >
        {chips ? null : (
          <Heading
            id={`${formId}-heading`}
            className={cn(
              'text-balance text-primary-token',
              headingClassName ?? 'text-xl font-medium tracking-tight'
            )}
          >
            {title}
          </Heading>
        )}
        {description && !chips ? (
          <p
            className={cn(
              'max-w-md text-pretty text-sm text-secondary-token',
              align === 'start' ? 'text-left' : 'text-balance text-center'
            )}
          >
            {description}
          </p>
        ) : null}
        {variant === 'general' ? (
          <label
            className='grid w-full gap-2 text-sm text-primary-token'
            htmlFor={`${formId}-name`}
          >
            Name
            <Input
              ref={nameRef}
              id={`${formId}-name`}
              name='name'
              autoComplete='name'
              required
              maxLength={120}
              value={name}
              onChange={event => {
                setName(event.target.value);
                if (status === 'error' && !turnstileFailed) {
                  setStatus('idle');
                  setErrorMessage('');
                }
              }}
            />
          </label>
        ) : null}
        {chips ? (
          <div className='waitlist-chips'>
            <p id={`${formId}-role-label`} className='waitlist-chips__label'>
              {roleLabel}
            </p>
            <fieldset
              aria-labelledby={`${formId}-role-label`}
              className='waitlist-chips__row'
            >
              {ROLE_CHIPS.map((chip, index) => (
                <Fragment key={chip.key}>
                  {index === 3 ? (
                    <span aria-hidden className='waitlist-chips__break' />
                  ) : null}
                  <label
                    className='waitlist-chip'
                    data-selected={chipKey === chip.key ? 'true' : undefined}
                  >
                    <input
                      type='radio'
                      name={`${formId}-role`}
                      value={chip.key}
                      checked={chipKey === chip.key}
                      className='sr-only'
                      onChange={() => {
                        setChipKey(chip.key);
                        setRole(chip.role);
                        if (status === 'error' && !turnstileFailed) {
                          setStatus('idle');
                          setErrorMessage('');
                        }
                      }}
                    />
                    {chip.label}
                  </label>
                </Fragment>
              ))}
            </fieldset>
          </div>
        ) : (
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
            {roles.map(option => (
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
        )}
        <InlineSubscribe
          className='w-full'
          inputId={`${formId}-email`}
          inputRef={inputRef}
          ariaLabel='Email address'
          buttonLabel={submitLabel}
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
        {status !== 'joined' && securityCheckArmed ? (
          <InvisibleTurnstile
            onToken={setTurnstileToken}
            onStateChange={handleTurnstileStateChange}
            resetSignal={turnstileResetSignal}
          />
        ) : null}
        {chips && note && !(status === 'error') ? (
          <p className='waitlist-chips__note'>{note}</p>
        ) : null}
        <p
          id={`${formId}-error`}
          className={cn(
            'text-sm text-accent-red',
            chips ? 'waitlist-chips__error' : 'min-h-5'
          )}
          role={status === 'error' ? 'alert' : undefined}
        >
          {status === 'error' ? errorMessage : ''}
        </p>
      </form>
    </div>
  );
}
