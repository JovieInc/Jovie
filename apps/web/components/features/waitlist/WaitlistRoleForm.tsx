'use client';

import { HostDrawnInput } from '@jovie/ui/atoms/host-drawn-field';
import { InlineSubscribe } from '@jovie/ui/atoms/inline-subscribe';
import { Input } from '@jovie/ui/atoms/input';
import { RadioGroup, RadioGroupItem } from '@jovie/ui/atoms/radio-group';
import dynamic from 'next/dynamic';
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
  WAITLIST_ROLE_CHOICES,
  type WaitlistRole,
} from '@/lib/waitlist/roles';
import { WaitlistJoinedConfirmation } from './WaitlistJoinedConfirmation';
import {
  clearQualifyingAnswer,
  EMPTY_QUALIFYING_ANSWERS,
  nextQualifyingStep,
  previousQualifyingStep,
  QUALIFYING_STEP_COUNT,
  type QualifyingAnswers,
  type QualifyingPosition,
  qualifyingAnsweredFlags,
  qualifyingPayload,
  qualifyingStepNumber,
  waitlistEmailError,
} from './waitlist-qualifying';

// Loaded only when an artist starts the questions; the homepage never ships it.
const WaitlistQualifyingSteps = dynamic(
  () =>
    import('./WaitlistQualifyingSteps').then(m => m.WaitlistQualifyingSteps),
  { ssr: false, loading: () => <div className='min-h-64 w-full' /> }
);

type Status = 'idle' | 'submitting' | 'joined' | 'error';

const TURNSTILE_FAILURE_STATUSES = new Set([
  'error',
  'expired',
  'timeout',
  'unsupported',
  'unconfigured',
]);

export const WAITLIST_ROLE_FORM_ENDPOINT = '/api/waitlist/join';

type RoleChoice = {
  readonly key: string;
  readonly label: string;
  readonly role: WaitlistRole;
};

const GENERAL_ROLE_CHOICES: ReadonlyArray<RoleChoice> =
  GENERAL_WAITLIST_ROLES.map(entry => ({
    key: entry.value,
    label: entry.label,
    role: entry.value,
  }));

/**
 * Closed-signup waitlist form (canon/PRODUCT.md, 2026-11-02): role and email,
 * Turnstile-gated, no account. Uses the one email-capture control
 * (`InlineSubscribe`, built on `CompositeField`).
 */
export function WaitlistRoleForm({
  variant = 'artist',
  headingLevel = 1,
  title = 'Reserve your spot',
  description,
  headingClassName,
  align = 'center',
  presentation = 'stack',
  roleLabel = 'I’m a',
  submitLabel = 'Join',
  note,
  qualify = false,
}: Readonly<{
  variant?: 'artist' | 'general';
  /**
   * Ask artists the three skippable request-access questions (which artist,
   * last growth attempt, promo spend) before the request is sent.
   */
  qualify?: boolean;
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
  // Artist forms show the same six choices as the homepage chips; the
  // general form keeps its own context list. A choice key maps to a role.
  const roleChoices: ReadonlyArray<RoleChoice> =
    variant === 'general' ? GENERAL_ROLE_CHOICES : WAITLIST_ROLE_CHOICES;
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
  const [step, setStep] = useState<QualifyingPosition>('entry');
  const [answers, setAnswers] = useState<QualifyingAnswers>(
    EMPTY_QUALIFYING_ANSWERS
  );
  const asksQuestions =
    qualify && variant === 'artist' && !chips && role === 'artist';
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

  function fail(message: string) {
    setStatus('error');
    setErrorMessage(message);
  }
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (status === 'submitting' || status === 'joined') return;

    if (variant === 'general' && !name.trim()) {
      nameRef.current?.focus({ preventScroll: true });
      fail('Enter your name.');
      return;
    }

    if (!role) {
      fail('Choose the role that fits you best.');
      return;
    }
    const emailError = waitlistEmailError(email);
    if (!email.trim() || emailError) {
      inputRef.current?.focus({ preventScroll: true });
      if (emailError) fail(emailError);
      return;
    }
    if (asksQuestions && step !== 'spend') {
      advance();
      return;
    }
    await sendRequest();
  }

  /** Clears a field error; a failed security check stays on screen. */
  function clearError() {
    if (status !== 'error' || turnstileFailed) return;
    setStatus('idle');
    setErrorMessage('');
  }
  function moveTo(next: (current: QualifyingPosition) => QualifyingPosition) {
    clearError();
    setStep(next);
  }
  const advance = () => moveTo(nextQualifyingStep);
  const goBack = () => moveTo(previousQualifyingStep);

  function skip() {
    if (step === 'entry') return;
    const cleared = clearQualifyingAnswer(answers, step);
    setAnswers(cleared);
    if (step === 'spend') void sendRequest(cleared);
    else advance();
  }

  async function sendRequest(finalAnswers: QualifyingAnswers = answers) {
    if (status === 'submitting' || status === 'joined') return;
    if (turnstileRequired && !turnstileToken) {
      setStatus('error');
      // A failed check keeps its own message and runs again.
      if (turnstileFailed) {
        setTurnstileResetSignal(signal => signal + 1);
      } else {
        setErrorMessage('Security check is still loading. Please try again.');
      }
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
          ...(asksQuestions ? qualifyingPayload(finalAnswers) : {}),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        state?: string;
        error?: string;
      };
      if (!response.ok || data.state !== 'joined') {
        if (response.status === 400) setStep('entry'); // email and role show there
        throw new Error(
          data.error || 'Something went wrong. Please try again.'
        );
      }
      track('waitlist_role_form_joined', {
        role,
        ...(asksQuestions ? qualifyingAnsweredFlags(finalAnswers) : {}),
      });
      joinedRef.current = true;
      setStatus('joined');
    } catch (error) {
      fail(
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
        <WaitlistJoinedConfirmation
          confirmationRef={confirmationRef}
          email={email.trim()}
          artistName={asksQuestions ? answers.artistName : null}
          headingLevel={headingLevel}
          className={cn('col-start-1 row-start-1', stackAlign)}
        />
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
                clearError();
              }}
            />
          </label>
        ) : null}
        {asksQuestions ? (
          <p
            className='self-stretch text-left text-xs tabular-nums text-tertiary-token'
            data-testid='waitlist-step-counter'
          >
            Step {qualifyingStepNumber(step)} of {QUALIFYING_STEP_COUNT}
          </p>
        ) : null}
        {step !== 'entry' && asksQuestions ? (
          <WaitlistQualifyingSteps
            step={step}
            answers={answers}
            submitting={status === 'submitting'}
            onChange={next => {
              setAnswers(current => ({ ...current, ...next }));
              clearError();
            }}
            onBack={goBack}
            onSkip={skip}
          />
        ) : null}
        {step === 'entry' || !asksQuestions ? (
          <>
            {chips ? (
              <div className='waitlist-chips'>
                <p
                  id={`${formId}-role-label`}
                  className='waitlist-chips__label'
                >
                  {roleLabel}
                </p>
                <fieldset
                  aria-labelledby={`${formId}-role-label`}
                  className='waitlist-chips__row'
                >
                  {WAITLIST_ROLE_CHOICES.map((chip, index) => (
                    <Fragment key={chip.key}>
                      {index === 3 ? (
                        <span aria-hidden className='waitlist-chips__break' />
                      ) : null}
                      <label
                        className='waitlist-chip'
                        data-selected={
                          chipKey === chip.key ? 'true' : undefined
                        }
                      >
                        <HostDrawnInput
                          visuallyHidden
                          type='radio'
                          name={`${formId}-role`}
                          value={chip.key}
                          checked={chipKey === chip.key}
                          onChange={() => {
                            setChipKey(chip.key);
                            setRole(chip.role);
                            clearError();
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
                // Full width so the choices start on the email field's edge.
                className='w-full'
                data-testid='waitlist-role-radios'
                value={chipKey}
                onValueChange={key => {
                  const choice = roleChoices.find(entry => entry.key === key);
                  if (!choice) return;
                  setChipKey(choice.key);
                  setRole(choice.role);
                  clearError();
                }}
              >
                {roleChoices.map(option => (
                  <label
                    key={option.key}
                    htmlFor={`${formId}-${option.key}`}
                    className='flex min-h-11 cursor-pointer items-center gap-3 px-4 text-sm text-primary-token'
                  >
                    <RadioGroupItem
                      id={`${formId}-${option.key}`}
                      value={option.key}
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
              buttonLabel={asksQuestions ? 'Continue' : submitLabel}
              value={email}
              onValueChange={value => {
                setEmail(value);
                clearError();
              }}
              loading={status === 'submitting'}
              pending={status === 'submitting'}
              unavailable={turnstileFailed}
              invalid={status === 'error' && !turnstileFailed}
              describedBy={`${formId}-error`}
            />
          </>
        ) : null}
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
