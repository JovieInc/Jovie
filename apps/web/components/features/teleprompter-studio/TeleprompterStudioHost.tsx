'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { TELEPROMPTER_START_EVENT } from '@/lib/teleprompter/recorder';
import type { TeleprompterRecordingContext } from '@/lib/teleprompter/types';

const TeleprompterStudio = dynamic(
  () =>
    import('./TeleprompterStudio').then(module => module.TeleprompterStudio),
  { ssr: false }
);

function isRecordingContext(
  value: unknown
): value is TeleprompterRecordingContext {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<TeleprompterRecordingContext>;
  return (
    typeof candidate.profileId === 'string' &&
    typeof candidate.kind === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.script === 'string' &&
    candidate.source === 'chat_proposal'
  );
}

/**
 * Opens the web studio when chat's Record in app fires
 * `jovie:teleprompter-start`. Mounted once in the app shell; the studio code
 * loads only when a creator actually opens it.
 */
export function TeleprompterStudioHost() {
  const [context, setContext] = useState<TeleprompterRecordingContext | null>(
    null
  );

  useEffect(() => {
    const handleStart = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (isRecordingContext(detail)) setContext(detail);
    };
    globalThis.window.addEventListener(TELEPROMPTER_START_EVENT, handleStart);
    return () =>
      globalThis.window.removeEventListener(
        TELEPROMPTER_START_EVENT,
        handleStart
      );
  }, []);

  if (!context) return null;
  return (
    <TeleprompterStudio
      key={`${context.profileId}:${context.title}:${context.script.length}`}
      context={context}
      onClose={() => setContext(null)}
    />
  );
}
