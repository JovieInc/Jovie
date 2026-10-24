'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/components/feedback';
import type { HomeLoopAnswer } from './HomeLoopAsks';

/** Tim's 2026-10-20 ruling: one click executes, with a five-second undo. */
export const HOME_LOOP_UNDO_WINDOW_MS = 5_000;

export interface UndoableAnswerInput {
  readonly id: string;
  /** Shown on the card and in the toast, e.g. "Approved". */
  readonly label: string;
  /** Sends the answer. Runs once the undo window closes; throw on failure. */
  readonly commit: () => Promise<void>;
}

interface PendingAnswer {
  readonly timer: ReturnType<typeof setTimeout>;
  readonly label: string;
  readonly commit: () => Promise<void>;
  readonly onCommitted?: (id: string) => void;
}

function failureLabel(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Could not send. Try again.';
}

function answerToastId(id: string): string {
  return `home-loop-answer-${id}`;
}

/**
 * Optimistic answers with an undo window. The answer shows immediately; the
 * commit runs only after the window closes, so Undo never has to reverse a
 * write. Unmount commits immediately. A failed commit restores the controls
 * with the error in place, or reports the error in a toast if the canvas is gone.
 */
export function useUndoableAnswers({
  windowMs = HOME_LOOP_UNDO_WINDOW_MS,
  onCommitted,
}: {
  readonly windowMs?: number;
  readonly onCommitted?: (id: string) => void;
} = {}) {
  const [answers, setAnswers] = useState<Record<string, HomeLoopAnswer>>({});
  const pending = useRef(new Map<string, PendingAnswer>());

  useEffect(() => {
    const queue = pending.current;
    return () => {
      const flushing = [...queue.entries()];
      queue.clear();
      for (const [id, item] of flushing) {
        clearTimeout(item.timer);
        toast.dismiss(answerToastId(id));
        void Promise.resolve()
          .then(() => item.commit())
          .then(() => {
            toast.success(item.label);
            item.onCommitted?.(id);
          })
          .catch((error: unknown) => {
            toast.error(failureLabel(error));
          });
      }
    };
  }, []);

  const setAnswer = useCallback((id: string, answer: HomeLoopAnswer | null) => {
    setAnswers(current => {
      const next = { ...current };
      if (answer) next[id] = answer;
      else delete next[id];
      return next;
    });
  }, []);

  const undo = useCallback(
    (id: string) => {
      const item = pending.current.get(id);
      if (!item) return;
      clearTimeout(item.timer);
      pending.current.delete(id);
      toast.dismiss(answerToastId(id));
      setAnswer(id, null);
    },
    [setAnswer]
  );

  const answer = useCallback(
    ({ id, label, commit }: UndoableAnswerInput) => {
      if (pending.current.has(id)) return;
      setAnswer(id, { label, state: 'pending' });
      toast(label, {
        id: answerToastId(id),
        duration: windowMs,
        action: { label: 'Undo', onClick: () => undo(id) },
      });
      const notify = onCommitted;
      const timer = setTimeout(() => {
        pending.current.delete(id);
        void Promise.resolve()
          .then(() => commit())
          .then(() => {
            setAnswer(id, { label, state: 'sent' });
            notify?.(id);
          })
          .catch((error: unknown) => {
            setAnswer(id, { label: failureLabel(error), state: 'failed' });
          });
      }, windowMs);
      pending.current.set(id, { timer, label, commit, onCommitted: notify });
    },
    [onCommitted, setAnswer, undo, windowMs]
  );

  return { answers, answer, undo };
}
