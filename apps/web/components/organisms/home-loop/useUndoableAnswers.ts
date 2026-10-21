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

/**
 * Optimistic answers with an undo window. The answer shows immediately; the
 * commit runs only after the window closes, so Undo never has to reverse a
 * write. A failed commit restores the controls with the error in place.
 */
export function useUndoableAnswers({
  windowMs = HOME_LOOP_UNDO_WINDOW_MS,
  onCommitted,
}: {
  readonly windowMs?: number;
  readonly onCommitted?: (id: string) => void;
} = {}) {
  const [answers, setAnswers] = useState<Record<string, HomeLoopAnswer>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
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
      const timer = timers.current.get(id);
      if (!timer) return;
      clearTimeout(timer);
      timers.current.delete(id);
      setAnswer(id, null);
    },
    [setAnswer]
  );

  const answer = useCallback(
    ({ id, label, commit }: UndoableAnswerInput) => {
      if (timers.current.has(id)) return;
      setAnswer(id, { label, state: 'pending' });
      toast(label, {
        id: `home-loop-answer-${id}`,
        duration: windowMs,
        action: { label: 'Undo', onClick: () => undo(id) },
      });
      const timer = setTimeout(() => {
        timers.current.delete(id);
        commit()
          .then(() => {
            setAnswer(id, { label, state: 'sent' });
            onCommitted?.(id);
          })
          .catch((error: unknown) => {
            setAnswer(id, {
              label:
                error instanceof Error && error.message
                  ? error.message
                  : 'Could not send. Try again.',
              state: 'failed',
            });
          });
      }, windowMs);
      timers.current.set(id, timer);
    },
    [onCommitted, setAnswer, undo, windowMs]
  );

  return { answers, answer, undo };
}
