'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type InterviewQuestion,
  ONBOARDING_INTERVIEW_QUESTIONS,
} from '@/lib/interviews/onboarding-script';

const SESSION_KEY = 'jovie_onboarding_interview_submitted';

interface DraftEntry {
  readonly question: InterviewQuestion;
  answer: string;
  skipped: boolean;
  timestamp: string | null;
}

function initDraft(): DraftEntry[] {
  return ONBOARDING_INTERVIEW_QUESTIONS.map(question => ({
    question,
    answer: '',
    skipped: false,
    timestamp: null,
  }));
}

function hasAnyAnswer(draft: DraftEntry[]): boolean {
  return draft.some(entry => entry.answer.trim().length > 0 || entry.skipped);
}

function toTranscript(draft: DraftEntry[]) {
  return draft
    .filter(entry => entry.timestamp !== null)
    .map(entry => ({
      questionId: entry.question.id,
      prompt: entry.question.prompt,
      answer: entry.skipped ? null : entry.answer.trim(),
      skipped: entry.skipped,
      timestamp: entry.timestamp as string,
    }));
}

interface OnboardingInterviewModalProps {
  readonly paramKey?: string;
}

export function OnboardingInterviewModal({
  paramKey = 'interview',
}: OnboardingInterviewModalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isRequested = searchParams.get(paramKey) === '1';

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftEntry[]>(initDraft);
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Open once per mount when the param is present and we haven't already
  // submitted in this tab. Immediately strip the param so refresh/back
  // doesn't resurrect the modal.
  useEffect(() => {
    if (!isRequested) return;

    const alreadySubmitted =
      globalThis.window !== undefined &&
      globalThis.sessionStorage.getItem(SESSION_KEY) === '1';

    if (alreadySubmitted) {
      router.replace(pathname);
      return;
    }

    setOpen(true);
    router.replace(pathname);
  }, [isRequested, pathname, router]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
  }, [open]);

  const submit = useCallback(async (final: DraftEntry[]) => {
    const transcript = toTranscript(final);
    if (transcript.length === 0) {
      setOpen(false);
      return;
    }

    setSubmitting(true);
    try {
      await fetch('/api/user-interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'onboarding',
          transcript,
          metadata: {
            locale:
              typeof navigator === 'undefined' ? null : navigator.language,
            userAgent:
              typeof navigator === 'undefined'
                ? null
                : navigator.userAgent.slice(0, 512),
          },
        }),
      });
    } catch {
      // Silent failure — this is a research feature, not a paywall.
      // Loss of one transcript is acceptable.
    } finally {
      if (globalThis.window !== undefined) {
        globalThis.sessionStorage.setItem(SESSION_KEY, '1');
      }
      setSubmitting(false);
      setOpen(false);
    }
  }, []);

  const advance = useCallback(
    (skip: boolean) => {
      setDraft(prev => {
        const next = prev.map((entry, idx) =>
          idx === current
            ? { ...entry, skipped: skip, timestamp: new Date().toISOString() }
            : entry
        );

        if (current === prev.length - 1) {
          submit(next);
        } else {
          setCurrent(current + 1);
        }
        return next;
      });
    },
    [current, submit]
  );

  const endInterview = useCallback(() => {
    setDraft(prev => {
      const next = [...prev];
      if (hasAnyAnswer(next)) {
        submit(next);
      } else {
        setOpen(false);
      }
      return next;
    });
  }, [submit]);

  if (!open) return null;

  const entry = draft[current];
  const progress = draft
    .map((_, idx) => (idx === current ? '●' : idx < current ? '●' : '○'))
    .join(' ');
  const canSubmit = !submitting;

  return (
    <dialog
      ref={dialogRef}
      aria-label='Quick interview'
      className='jovie-auth-modal fixed inset-0 m-auto h-auto max-h-[calc(100svh-48px)] w-full max-w-[480px] overflow-auto rounded-2xl border border-white/[0.08] bg-[var(--color-bg-surface-3,#2a2c32)] p-6 text-primary-token shadow-[0_5px_50px_rgba(0,0,0,0.5),0_4px_30px_rgba(0,0,0,0.4)] backdrop:bg-black/60 backdrop:backdrop-blur-sm'
    >
      <div className='mb-4 flex items-center justify-between gap-4 text-xs text-secondary-token'>
        <span className='tracking-widest'>{progress}</span>
        <button
          type='button'
          onClick={endInterview}
          disabled={submitting}
          className='underline-offset-4 hover:underline disabled:opacity-50'
        >
          End interview
        </button>
      </div>

      <h2 className='mb-2 text-lg font-medium'>Quick question — 30 seconds.</h2>
      <p className='mb-4 text-sm text-secondary-token'>
        We&apos;re building this for you. Your answers go straight to the
        founders.
      </p>

      <div className='mb-3 text-base font-medium'>{entry.question.prompt}</div>

      <textarea
        value={entry.answer}
        onChange={e =>
          setDraft(prev =>
            prev.map((x, idx) =>
              idx === current ? { ...x, answer: e.target.value } : x
            )
          )
        }
        placeholder={entry.question.placeholder ?? ''}
        rows={4}
        disabled={submitting}
        className='w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.04] p-3 text-sm text-primary-token outline-none placeholder:text-tertiary-token focus:border-white/20'
      />

      <div className='mt-4 flex items-center justify-between gap-3'>
        <button
          type='button'
          onClick={() => advance(true)}
          disabled={!canSubmit}
          className='text-sm text-secondary-token underline-offset-4 hover:underline disabled:opacity-50'
        >
          Skip
        </button>
        <button
          type='button'
          onClick={() => advance(false)}
          disabled={!canSubmit || entry.answer.trim().length === 0}
          className='rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-40'
        >
          {current === draft.length - 1
            ? submitting
              ? 'Sending…'
              : 'Send'
            : 'Next'}
        </button>
      </div>
    </dialog>
  );
}
