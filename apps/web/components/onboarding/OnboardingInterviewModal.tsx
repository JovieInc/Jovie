'use client';

import { Button, Textarea } from '@jovie/ui';
import { usePathname, useRouter } from 'next/navigation';
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
  readonly initialRequested?: boolean;
}

export function OnboardingInterviewModal({
  initialRequested = false,
}: OnboardingInterviewModalProps) {
  const router = useRouter();
  const pathname = usePathname();

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftEntry[]>(initDraft);
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Open once per mount when the param is present and we haven't already
  // submitted in this tab. Immediately strip the param so refresh/back
  // doesn't resurrect the modal.
  useEffect(() => {
    if (!initialRequested) return;

    const alreadySubmitted =
      globalThis.window !== undefined &&
      globalThis.sessionStorage.getItem(SESSION_KEY) === '1';

    if (alreadySubmitted) {
      router.replace(pathname);
      return;
    }

    setOpen(true);
    router.replace(pathname);
  }, [initialRequested, pathname, router]);

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
  const progressLabel = `Question ${current + 1} of ${draft.length}`;
  const canSubmit = !submitting;
  const isLastQuestion = current === draft.length - 1;
  let submitLabel = 'Next';
  if (isLastQuestion) submitLabel = submitting ? 'Sending...' : 'Send';

  return (
    <dialog
      ref={dialogRef}
      aria-label='Quick Interview'
      className='jovie-auth-modal fixed inset-0 m-auto h-auto max-h-[calc(100svh-48px)] w-full max-w-120 overflow-auto rounded-(--linear-radius-lg) border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) p-6 text-primary-token shadow-(--linear-shadow-card-elevated) backdrop:bg-(--linear-bg-page) backdrop:backdrop-blur-sm'
    >
      <div className='mb-4 flex min-h-7 items-center justify-between gap-4 text-2xs text-secondary-token'>
        <span
          aria-label={progressLabel}
          className='flex items-center gap-1.5'
          role='status'
        >
          {draft.map((entryItem, idx) => (
            <span
              aria-hidden='true'
              className='h-1.5 w-1.5 rounded-full bg-tertiary-token transition-colors duration-subtle data-[state=active]:bg-primary-token'
              data-state={idx <= current ? 'active' : 'idle'}
              key={entryItem.question.id}
            />
          ))}
        </span>
        <button
          type='button'
          onClick={endInterview}
          disabled={submitting}
          className='text-2xs text-secondary-token underline-offset-4 transition-colors duration-subtle hover:text-primary-token hover:underline disabled:opacity-50'
        >
          End Interview
        </button>
      </div>

      <h2 className='mb-2 text-mid font-medium text-primary-token'>
        Quick Question
      </h2>
      <p className='mb-4 text-app leading-5 text-secondary-token'>
        Takes about 30 seconds. Your answers go straight to the founders.
      </p>

      <div className='mb-3 text-app font-medium leading-5 text-primary-token'>
        {entry.question.prompt}
      </div>

      <Textarea
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
        resizable={false}
        textareaSize='lg'
      />

      <div className='mt-4 flex items-center justify-between gap-3'>
        <button
          type='button'
          onClick={() => advance(true)}
          disabled={!canSubmit}
          className='text-app text-secondary-token underline-offset-4 transition-colors duration-subtle hover:text-primary-token hover:underline disabled:opacity-50'
        >
          Skip
        </button>
        <Button
          variant='whitePill'
          onClick={() => advance(false)}
          disabled={!canSubmit || entry.answer.trim().length === 0}
          className='px-4 py-2 text-sm'
        >
          {submitLabel}
        </Button>
      </div>
    </dialog>
  );
}
