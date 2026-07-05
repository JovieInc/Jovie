import { tool } from 'ai';
import { z } from 'zod';
import { getTeleprompterShowcaseVariant } from '@/lib/flags/server';
import {
  RECORDABLE_VIDEO_KINDS,
  type RecordableVideoKind,
  type VideoRecordingProposalPayload,
} from '@/lib/teleprompter/types';

export { isVideoRecordingProposalPayload } from '@/lib/teleprompter/types';

import { chatToolSchema } from '@/lib/chat/strict-schema';

const KIND_LABELS: Record<RecordableVideoKind, string> = {
  promo: 'Promo video',
  thank_you: 'Thank-you video',
  bts: 'Behind-the-scenes video',
};

export function createProposeVideoRecordingTool(options: {
  readonly clerkUserId: string;
}) {
  return tool({
    description:
      'Propose recording a short talking-head video in the Jovie app. Use when Jovie has written a promo, thank-you, or behind-the-scenes script and the artist should record it. Shows Upload video and Record in app actions with an optional teleprompter showcase.',
    inputSchema: chatToolSchema({
      kind: z
        .enum(RECORDABLE_VIDEO_KINDS)
        .describe('What type of recordable video this proposal is for.'),
      title: z
        .string()
        .min(3)
        .max(120)
        .describe('Short label for the video, e.g. "Release day shout-out".'),
      script: z
        .string()
        .min(12)
        .max(1200)
        .describe(
          'The teleprompter script Jovie wrote for the artist to read on camera.'
        ),
    }),
    execute: async ({ kind, title, script }) => {
      const showcaseVariant = await getTeleprompterShowcaseVariant(
        options.clerkUserId
      );

      const payload: VideoRecordingProposalPayload = {
        success: true,
        kind,
        title: title.trim(),
        script: script.trim(),
        showcaseVariant,
      };

      return {
        ...payload,
        label: KIND_LABELS[kind],
      };
    },
  });
}
