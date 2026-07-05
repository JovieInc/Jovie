import type { TeleprompterShowcaseVariant } from '@/lib/flags/contracts';

export const RECORDABLE_VIDEO_KINDS = ['promo', 'thank_you', 'bts'] as const;

export type RecordableVideoKind = (typeof RECORDABLE_VIDEO_KINDS)[number];

export type { TeleprompterShowcaseVariant };

export interface VideoRecordingProposalPayload {
  readonly success: true;
  readonly kind: RecordableVideoKind;
  readonly title: string;
  readonly script: string;
  readonly showcaseVariant: TeleprompterShowcaseVariant;
}

export function isVideoRecordingProposalPayload(
  value: unknown
): value is VideoRecordingProposalPayload {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<VideoRecordingProposalPayload>;
  return (
    candidate.success === true &&
    typeof candidate.kind === 'string' &&
    RECORDABLE_VIDEO_KINDS.includes(candidate.kind as RecordableVideoKind) &&
    typeof candidate.title === 'string' &&
    typeof candidate.script === 'string' &&
    (candidate.showcaseVariant === 'interstitial' ||
      candidate.showcaseVariant === 'direct')
  );
}

export interface TeleprompterRecordingContext {
  readonly profileId: string;
  readonly kind: RecordableVideoKind;
  readonly title: string;
  readonly script: string;
  readonly showcaseVariant: TeleprompterShowcaseVariant;
  readonly source: 'chat_proposal';
}
