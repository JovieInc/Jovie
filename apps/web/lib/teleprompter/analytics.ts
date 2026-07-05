'use client';

import { track } from '@/lib/analytics';
import type { RecordableVideoKind, TeleprompterShowcaseVariant } from './types';

export type TeleprompterFunnelEvent =
  | 'teleprompter_proposal_impression'
  | 'teleprompter_showcase_impression'
  | 'teleprompter_showcase_dismissed'
  | 'teleprompter_recording_started'
  | 'teleprompter_recording_saved'
  | 'teleprompter_video_uploaded';

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
