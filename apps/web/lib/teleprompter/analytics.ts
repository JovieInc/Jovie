'use client';

import { track } from '@/lib/analytics';
import type { RecordableVideoKind, TeleprompterShowcaseVariant } from './types';

export type TeleprompterFunnelEvent =
  | 'teleprompter_proposal_impression'
  | 'teleprompter_showcase_impression'
  | 'teleprompter_showcase_dismissed'
  | 'teleprompter_recording_started'
  | 'teleprompter_recording_saved'
  | 'teleprompter_video_uploaded'
  // Web studio (laptop v1). Measured per slice so the next slice (review
  // links, Mac notch) only ships if creators keep takes and answer questions.
  | 'teleprompter_studio_opened'
  | 'teleprompter_studio_camera_blocked'
  | 'teleprompter_take_saved'
  | 'teleprompter_take_save_failed'
  | 'teleprompter_take_kept'
  | 'teleprompter_question_shown'
  | 'teleprompter_question_answered'
  | 'teleprompter_question_skipped'
  | 'teleprompter_studio_closed';

interface TeleprompterFunnelProps {
  readonly profileId: string;
  readonly kind: RecordableVideoKind;
  readonly showcaseVariant: TeleprompterShowcaseVariant;
  readonly source?: string;
}

export function trackTeleprompterFunnel(
  event: TeleprompterFunnelEvent,
  props: TeleprompterFunnelProps & Record<string, unknown>
): void {
  const { profileId, kind, showcaseVariant, source, ...rest } = props;
  track(event, {
    ...rest,
    profileId,
    kind,
    showcaseVariant,
    source: source ?? 'chat_proposal',
  });
}
