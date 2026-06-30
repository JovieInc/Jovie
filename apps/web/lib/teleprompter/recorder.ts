'use client';

import { trackTeleprompterFunnel } from './analytics';
import { markTeleprompterRecordingCompleted } from './persistence';
import type { TeleprompterRecordingContext } from './types';

export const TELEPROMPTER_START_EVENT = 'jovie:teleprompter-start';
export const TELEPROMPTER_SAVED_EVENT = 'jovie:teleprompter-recording-saved';

export function startTeleprompterRecording(
  context: TeleprompterRecordingContext
): void {
  trackTeleprompterFunnel('teleprompter_recording_started', {
    profileId: context.profileId,
    kind: context.kind,
    showcaseVariant: context.showcaseVariant,
    source: context.source,
    title: context.title,
  });

  if (globalThis.window !== undefined) {
    globalThis.window.dispatchEvent(
      new CustomEvent(TELEPROMPTER_START_EVENT, { detail: context })
    );
  }
}

export function completeTeleprompterRecording(
  context: TeleprompterRecordingContext & {
    readonly libraryAssetId?: string;
  }
): void {
  markTeleprompterRecordingCompleted(context.profileId);
  trackTeleprompterFunnel('teleprompter_recording_saved', {
    profileId: context.profileId,
    kind: context.kind,
    showcaseVariant: context.showcaseVariant,
    source: context.source,
    title: context.title,
    libraryAssetId: context.libraryAssetId,
  });

  if (globalThis.window !== undefined) {
    globalThis.window.dispatchEvent(
      new CustomEvent(TELEPROMPTER_SAVED_EVENT, { detail: context })
    );
  }
}
