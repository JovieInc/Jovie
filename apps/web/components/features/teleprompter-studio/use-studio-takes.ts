'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { trackTeleprompterFunnel } from '@/lib/teleprompter/analytics';
import { completeTeleprompterRecording } from '@/lib/teleprompter/recorder';
import {
  setTeleprompterTakeKeptClient,
  uploadTeleprompterTake,
} from '@/lib/teleprompter/takes/client';
import type { TeleprompterRecordingContext } from '@/lib/teleprompter/types';
import type { StudioTake } from './StudioTakesSheet';

export type StudioFunnel = Parameters<typeof trackTeleprompterFunnel>[1];

/** Funnel props shared by every studio event. */
export function studioFunnel(
  context: TeleprompterRecordingContext
): StudioFunnel {
  return {
    profileId: context.profileId,
    kind: context.kind,
    showcaseVariant: context.showcaseVariant,
    source: 'web_studio',
  };
}

interface UseStudioTakesOptions {
  readonly context: TeleprompterRecordingContext;
  readonly funnel: StudioFunnel;
  readonly userId: string | null | undefined;
  readonly onNotice: (notice: string) => void;
}

/**
 * Takes recorded in this studio session: each one plays back from its local
 * blob at once and uploads to the private Library in the background.
 */
export function useStudioTakes({
  context,
  funnel,
  userId,
  onNotice,
}: UseStudioTakesOptions) {
  const [takes, setTakes] = useState<StudioTake[]>([]);
  const takesRef = useRef<StudioTake[]>([]);

  useEffect(() => {
    takesRef.current = takes;
  }, [takes]);

  // Local preview URLs live as long as the studio.
  useEffect(
    () => () => {
      for (const take of takesRef.current) URL.revokeObjectURL(take.localUrl);
    },
    []
  );

  const setStatus = useCallback(
    (takeId: string, status: StudioTake['status']) =>
      setTakes(current =>
        current.map(item => (item.id === takeId ? { ...item, status } : item))
      ),
    []
  );

  const saveTake = useCallback(
    async (take: StudioTake, blob: Blob) => {
      if (!userId) {
        setStatus(take.id, 'failed');
        return;
      }
      try {
        await uploadTeleprompterTake({
          ownerId: userId,
          blob,
          metadata: {
            takeId: take.id,
            durationMs: take.durationMs,
            takeNumber: take.number,
            title: context.title,
            kind: context.kind,
            source: take.source,
            ...(take.source === 'script' ? { script: context.script } : {}),
            ...(take.question ? { question: take.question } : {}),
            profileId: context.profileId,
          },
        });
        setStatus(take.id, 'saved');
        trackTeleprompterFunnel('teleprompter_take_saved', {
          ...funnel,
          takeSource: take.source,
          takeNumber: take.number,
          durationMs: take.durationMs,
        });
        if (take.number === 1) {
          completeTeleprompterRecording({
            ...context,
            libraryAssetId: take.id,
          });
        }
      } catch (error) {
        setStatus(take.id, 'failed');
        trackTeleprompterFunnel('teleprompter_take_save_failed', {
          ...funnel,
          reason: error instanceof Error ? error.message : 'unknown',
        });
      }
    },
    [context, funnel, setStatus, userId]
  );

  const addTake = useCallback(
    (take: StudioTake, blob: Blob) => {
      setTakes(current => [...current, take]);
      void saveTake(take, blob);
    },
    [saveTake]
  );

  const toggleKept = useCallback(
    async (takeId: string) => {
      const take = takesRef.current.find(item => item.id === takeId);
      if (!take || take.status !== 'saved') return;
      const kept = !take.kept;
      const setKept = (value: boolean) =>
        setTakes(current =>
          current.map(item =>
            item.id === takeId ? { ...item, kept: value } : item
          )
        );
      setKept(kept);
      try {
        await setTeleprompterTakeKeptClient(takeId, kept);
        if (kept) {
          trackTeleprompterFunnel('teleprompter_take_kept', {
            ...funnel,
            takeSource: take.source,
            takeNumber: take.number,
          });
        }
      } catch {
        setKept(!kept);
        onNotice("Couldn't update that take. Try again.");
      }
    },
    [funnel, onNotice]
  );

  const retrySave = useCallback(
    (takeId: string) => {
      const take = takesRef.current.find(item => item.id === takeId);
      if (!take) return;
      void fetch(take.localUrl)
        .then(response => response.blob())
        .then(blob => {
          setStatus(takeId, 'uploading');
          return saveTake(take, blob);
        })
        .catch(() => onNotice("Couldn't retry that take."));
    },
    [onNotice, saveTake, setStatus]
  );

  return { takes, takesRef, addTake, toggleKept, retrySave };
}
