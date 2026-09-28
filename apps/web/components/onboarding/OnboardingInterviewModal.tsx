// @coverage-via apps/web/components/onboarding/OnboardingInterviewModal.test.tsx
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
  const submissionInFlightRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftEntry[]>(initDraft);
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [retryTranscript, setRetryTranscript] = useState<ReturnType<
    typeof toTranscript
  > | null>(null);

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

  const submit = useCallback(
    async (transcript: ReturnType<typeof toTranscript>) => {
      if (transcript.length === 0) {
        setOpen(false);
        return;
      }
      if (submissionInFlightRef.current) return;

      submissionInFlightRef.current = true;
      setRetryTranscript(transcript);
      setSubmitError(false);
      setSubmitting(true);
      try {
        const response = await fetch('/api/user-interviews', {
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
        if (!response.ok) {
          setSubmitError(true);
          return;
        }

        if (globalThis.window !== undefined) {
          globalThis.sessionStorage.setItem(SESSION_KEY, '1');
        }
        setRetryTranscript(null);
        setOpen(false);
      } catch {
        setSubmitError(true);
      } finally {
        submissionInFlightRef.current = false;
        setSubmitting(false);
      }
    },
    []
  );

  const advance = useCallback(
    (skip: boolean) => {
      if (submitting || submitError || submissionInFlightRef.current) return;

      const next = draft.map((entry, idx) =>
        idx === current
          ? { ...entry, skipped: skip, timestamp: new Date().toISOString() }
          : entry
      );
      setDraft(next);

      if (current === next.length - 1) {
        void submit(toTranscript(next));
      } else {
        setCurrent(current + 1);
      }
    },
    [current, draft, submit, submitError, submitting]
  );

  const endInterview = useCallback(() => {
    if (submitting || submissionInFlightRef.current) return;
    if (submitError) {
      setOpen(false);
      return;
    }

    const next = draft.map((entry, idx) =>
      idx === current &&
      entry.answer.trim().length > 0 &&
      entry.timestamp === null
        ? { ...entry, skipped: false, timestamp: new Date().toISOString() }
        : entry
    );
    setDraft(next);

    if (hasAnyAnswer(next)) {
      void submit(toTranscript(next));
    } else {
      setOpen(false);
    }
  }, [current, draft, submit, submitError, submitting]);

  if (!open) return null;

  const entry = draft[current];
  const progressLabel = `Question ${current + 1} of ${draft.length}`;
  const canSubmit = submitError
    ? retryTranscript !== null
    : entry.answer.trim().length > 0;
  const canAdvance = !submitting && !submitError;
  const isLastQuestion = current === draft.length - 1;
  const submitLabel = submitting
    ? 'Sending...'
    : submitError
      ? 'Retry'
      : isLastQuestion
        ? 'Send'
        : 'Next';

  return (
    <dialog
      ref={dialogRef}
      aria-label='Quick Interview'
      className='jovie-auth-modal fixed inset-0 m-auto h-auto max-h-[calc(100svh-48px)] w-full max-w-120 overflow-auto rounded-lg border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) p-6 text-primary-token shadow-card-elevated backdrop:bg-(--linear-bg-page) backdrop:backdrop-blur-sm'
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
          aria-disabled={submitting}
          className='text-2xs text-secondary-token underline-offset-4 transition-colors duration-subtle hover:text-primary-token hover:underline aria-disabled:opacity-50'
        >
          {submitError ? 'Exit without sending' : 'End Interview'}
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
        disabled={submitting || submitError}
        resizable={false}
        textareaSize='lg'
      />

      <div
        aria-atomic='true'
        aria-live='assertive'
        className='mt-3 min-h-10 text-2xs text-secondary-token'
        role={submitError ? 'alert' : undefined}
      >
        {submitError
          ? "We couldn't send your answers. They're still here. Retry or exit."
          : null}
      </div>

      <div className='mt-4 flex items-center justify-between gap-3'>
        <button
          type='button'
          onClick={() => {
            if (canAdvance) advance(true);
          }}
          aria-disabled={!canAdvance}
          className='text-app text-secondary-token underline-offset-4 transition-colors duration-subtle hover:text-primary-token hover:underline aria-disabled:opacity-50'
        >
          Skip
        </button>
        <Button
          variant='primary'
          onClick={() => {
            if (submitting || submissionInFlightRef.current) return;
            if (submitError) {
              if (retryTranscript) void submit(retryTranscript);
              return;
            }
            advance(false);
          }}
          aria-label={submitError ? 'Retry interview submission' : undefined}
          aria-disabled={!canSubmit || submitting}
          disabled={!canSubmit && !submitting}
          className='px-4 py-2 text-sm'
        >
          {submitLabel}
        </Button>
      </div>
    </dialog>
  );
}
