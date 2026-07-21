'use client';

import { ArrowRight, Loader2, SendHorizontal } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { getPlanIntent } from '@/lib/auth/plan-intent';
import { isMeaningfulIntakeAnswer } from '@/lib/chat/onboarding-script/widget-events';
import { cn } from '@/lib/utils';
import type { WaitlistAccessOutcome } from '@/lib/waitlist/access-request';
import type { WaitlistDisplayOutcome } from './WaitlistOutcomeView';
import { WaitlistSuccessView } from './WaitlistSuccessView';

interface WaitlistIntakeChatProps {
  readonly userEmail: string | null;
}

type StepId =
  | 'handle'
  | 'primarySocialUrl'
  | 'spotifyUrl'
  | 'spotifyArtistName'
  | 'currentWorkflow'
  | 'biggestBlocker'
  | 'launchGoal';

interface IntakeStep {
  readonly id: StepId;
  readonly prompt: string;
  readonly placeholder: string;
  readonly optional?: boolean;
}

interface TranscriptEntry {
  readonly questionId: string;
  readonly prompt: string;
  readonly answer: string | null;
  readonly skipped: boolean;
  readonly timestamp: string;
}

const STEPS: readonly IntakeStep[] = [
  {
    id: 'handle',
    prompt: 'What handle should people use to find you?',
    placeholder: '@yourname',
  },
  {
    id: 'primarySocialUrl',
    prompt: 'Send the public profile that best shows your audience right now.',
    placeholder: 'https://instagram.com/yourname',
  },
  {
    id: 'spotifyUrl',
    prompt: 'Send your Spotify artist URL if you have one.',
    placeholder: 'https://open.spotify.com/artist/...',
    optional: true,
  },
  {
    id: 'spotifyArtistName',
    prompt: 'What artist name should Jovie use for your release context?',
    placeholder: 'Artist name',
    optional: true,
  },
  {
    id: 'currentWorkflow',
    prompt: 'What are you working on or releasing next?',
    placeholder: 'A single, EP, tour, rollout, or catalog update',
  },
  {
    id: 'biggestBlocker',
    prompt: 'What is the most annoying part of that workflow right now?',
    placeholder: 'Planning, assets, pitching, fan follow-up, reporting...',
  },
  {
    id: 'launchGoal',
    prompt: 'What would make Jovie obviously useful for you this quarter?',
    placeholder: 'The outcome you want',
  },
];

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, '');
}

function isProbablyUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function WaitlistIntakeChat({
  userEmail,
}: Readonly<WaitlistIntakeChatProps>) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<StepId, string>>({
    handle: '',
    primarySocialUrl: '',
    spotifyUrl: '',
    spotifyArtistName: '',
    currentWorkflow: '',
    biggestBlocker: '',
    launchGoal: '',
  });
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<WaitlistDisplayOutcome | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  // Cancel any in-flight intake POST on unmount so we don't update state on
  // an unmounted component or hold the connection open.
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const step = STEPS[stepIndex];
  const isFinalStep = stepIndex === STEPS.length - 1;

  const visibleMessages = useMemo(() => {
    const intro = [
      {
        id: 'intro-1',
        role: 'jovie' as const,
        text: "Hey. I'm Jovie. Early access is limited right now, so some artists land on the waitlist. I will save your release context first, then show the access result.",
      },
      {
        id: 'intro-2',
        role: 'jovie' as const,
        text: STEPS[0].prompt,
      },
    ];

    const history = transcript.flatMap(entry => [
      {
        id: `${entry.questionId}-answer`,
        role: 'user' as const,
        text: entry.skipped ? 'Skipped' : (entry.answer ?? ''),
      },
      {
        id: `${entry.questionId}-next`,
        role: 'jovie' as const,
        text:
          STEPS.find(candidate => candidate.id === entry.questionId) ===
          STEPS[stepIndex]
            ? ''
            : (STEPS[
                STEPS.findIndex(
                  candidate => candidate.id === entry.questionId
                ) + 1
              ]?.prompt ?? ''),
      },
    ]);

    return [...intro, ...history].filter(message => message.text);
  }, [stepIndex, transcript]);

  // Auto-scroll the messages container to the bottom whenever new content
  // appears so newly added Jovie prompts don't sit below the fold.
  useEffect(() => {
    const node = messagesContainerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [visibleMessages.length, saving]);

  async function submitIntake(
    nextTranscript: TranscriptEntry[],
    nextAnswers: Record<StepId, string>
  ) {
    setSaving(true);
    setError(null);

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/onboarding/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          waitlist: {
            primaryGoal: null,
            primarySocialUrl: nextAnswers.primarySocialUrl,
            spotifyUrl: nextAnswers.spotifyUrl || null,
            spotifyArtistName: nextAnswers.spotifyArtistName || null,
            heardAbout: 'onboarding_chat',
            selectedPlan: getPlanIntent(),
          },
          transcript: nextTranscript,
          metadata: {
            requestedHandle: normalizeHandle(nextAnswers.handle),
            currentWorkflow: nextAnswers.currentWorkflow,
            biggestBlocker: nextAnswers.biggestBlocker,
            launchGoal: nextAnswers.launchGoal,
          },
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        outcome?: WaitlistAccessOutcome | 'rate_limited';
        error?: string;
      } | null;

      if (payload?.outcome === 'rate_limited') {
        setOutcome('rate_limited');
        return;
      }

      if (!response.ok || !payload?.outcome) {
        setOutcome('save_failed');
        return;
      }

      setOutcome(payload.outcome);
    } catch (err) {
      // Don't flip into save_failed on user-initiated unmount aborts.
      if ((err as { name?: string } | null)?.name === 'AbortError') return;
      setOutcome('save_failed');
    } finally {
      // Only clear saving if this controller is still the current one (i.e.
      // we weren't superseded by another submit) to avoid stale toggles.
      if (abortControllerRef.current === controller) {
        setSaving(false);
      }
    }
  }

  function commitAnswer(value: string, skipped = false) {
    if (!step) return;
    const trimmed = value.trim();

    if (!skipped && !trimmed) {
      setError('Add an answer to continue.');
      return;
    }

    // Incomplete acks ("k", "ok") must not advance required intake steps
    // or complete waitlist/reservation.
    if (
      !skipped &&
      !step.optional &&
      !isMeaningfulIntakeAnswer(trimmed) &&
      step.id !== 'primarySocialUrl' &&
      step.id !== 'spotifyUrl'
    ) {
      setError('Add a real answer to continue — short acks do not count.');
      return;
    }

    if (step.id === 'handle' && !skipped) {
      const handle = normalizeHandle(trimmed);
      if (handle.length < 2 || !isMeaningfulIntakeAnswer(handle)) {
        setError('Enter a real handle (at least 2 characters).');
        return;
      }
    }

    if (
      !skipped &&
      (step.id === 'primarySocialUrl' || step.id === 'spotifyUrl') &&
      !isProbablyUrl(trimmed)
    ) {
      setError('Use a full URL that starts with https:// or http://.');
      return;
    }

    setError(null);
    const nextAnswers = { ...answers, [step.id]: skipped ? '' : trimmed };
    setAnswers(nextAnswers);

    const nextTranscript = [
      ...transcript,
      {
        questionId: step.id,
        prompt: step.prompt,
        answer: skipped ? null : trimmed,
        skipped,
        timestamp: new Date().toISOString(),
      },
    ];
    setTranscript(nextTranscript);
    setInput('');

    if (isFinalStep) {
      void submitIntake(nextTranscript, nextAnswers);
      return;
    }

    setStepIndex(current => current + 1);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    commitAnswer(input);
  }

  if (outcome) {
    return (
      <WaitlistSuccessView
        outcome={outcome}
        onRetry={() => setOutcome(null)}
        confirmedEmail={userEmail}
      />
    );
  }

  return (
    <div className='flex min-h-dvh w-full bg-(--color-bg-base) text-white dark:text-white [color-scheme:dark]'>
      <main className='mx-auto flex w-full max-w-260 flex-col px-4 py-5 sm:px-6 lg:px-8'>
        <header className='flex h-11 items-center justify-between'>
          <div className='inline-flex items-center gap-2'>
            <BrandLogo size={20} tone='white' aria-hidden />
            <span className='text-mid font-semibold text-white dark:text-white'>
              Jovie
            </span>
          </div>
          {userEmail ? (
            <span className='hidden truncate text-xs text-white/42 sm:block'>
              {userEmail}
            </span>
          ) : null}
        </header>

        <section className='grid flex-1 gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-stretch'>
          <div className='flex min-h-140 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-(--color-bg-surface-0) shadow-[0_24px_90px_rgba(0,0,0,0.34)]'>
            <div className='border-b border-white/[0.07] px-4 py-3 sm:px-5'>
              <h1 className='text-lg font-semibold leading-6 text-white dark:text-white'>
                Request Access
              </h1>
              <p className='mt-1 text-app leading-5 text-white/52'>
                Early access is limited. Answer a few launch questions — we save
                only the fields needed to decide access or waitlist placement.
              </p>
            </div>

            <div
              ref={messagesContainerRef}
              className='flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-5'
              aria-live='polite'
            >
              {visibleMessages.map(message => (
                <div
                  key={message.id}
                  className={cn(
                    'flex',
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-6',
                      message.role === 'user'
                        ? 'bg-white dark:bg-surface-1 text-black dark:text-white'
                        : 'border border-white/[0.08] bg-white/[0.035] text-white/76'
                    )}
                  >
                    {message.text}
                  </div>
                </div>
              ))}

              {saving ? (
                <div className='flex justify-start'>
                  <div className='inline-flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3.5 py-2.5 text-sm text-white/64'>
                    <Loader2 className='h-4 w-4 animate-spin' aria-hidden />
                    Saving Your Request
                  </div>
                </div>
              ) : null}
            </div>

            <form
              onSubmit={handleSubmit}
              className='border-t border-white/[0.07] p-3 sm:p-4'
            >
              {error ? (
                <p className='mb-2 text-app text-red-300' role='alert'>
                  {error}
                </p>
              ) : null}
              <div className='flex gap-2'>
                <input
                  value={input}
                  onChange={event => setInput(event.target.value)}
                  placeholder={step?.placeholder}
                  disabled={saving}
                  aria-label={step?.prompt ?? 'Your answer'}
                  className='h-11 min-w-0 flex-1 rounded-full border border-white/[0.09] bg-white/[0.04] px-4 text-sm text-white dark:text-white outline-none placeholder:text-white dark:text-white/32 focus:border-white/24'
                />
                {step?.optional ? (
                  <button
                    type='button'
                    onClick={() => commitAnswer('', true)}
                    disabled={saving}
                    className='inline-flex h-11 items-center rounded-full border border-white/[0.1] px-4 text-app font-semibold text-white/70 transition-colors hover:bg-white/[0.04] hover:text-white focus-ring-themed'
                  >
                    Skip
                  </button>
                ) : null}
                <button
                  type='submit'
                  disabled={saving}
                  className='inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white dark:bg-surface-1 text-black dark:text-white transition-colors hover:bg-white dark:bg-surface-1/90 disabled:cursor-not-allowed disabled:opacity-60 focus-ring-themed'
                  aria-label={isFinalStep ? 'Save request' : 'Send answer'}
                >
                  {isFinalStep ? (
                    <ArrowRight className='h-4 w-4' aria-hidden />
                  ) : (
                    <SendHorizontal className='h-4 w-4' aria-hidden />
                  )}
                </button>
              </div>
            </form>
          </div>

          <aside className='hidden rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 lg:block'>
            <h2 className='text-sm font-semibold text-white dark:text-white'>
              Saved Context
            </h2>
            <dl className='mt-4 space-y-3 text-app'>
              <ContextRow label='Handle' value={answers.handle} />
              <ContextRow label='Social' value={answers.primarySocialUrl} />
              <ContextRow label='Spotify' value={answers.spotifyUrl} />
              <ContextRow
                label='Next Release'
                value={answers.currentWorkflow}
              />
              <ContextRow label='Blocker' value={answers.biggestBlocker} />
              <ContextRow label='Goal' value={answers.launchGoal} />
            </dl>
          </aside>
        </section>
      </main>
    </div>
  );
}

function ContextRow({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className='text-white/38'>{label}</dt>
      <dd className='mt-1 break-words text-white/74'>{value || 'Not Set'}</dd>
    </div>
  );
}
