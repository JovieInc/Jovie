/**
 * Onboarding interview signal schemas (JOV-2132 PR 2).
 *
 * Defines the Zod shape for `recordInterviewSignal` payloads written to
 * `chat_conversations.metadata.interviewSignals`. Schemaless JSONB without
 * a typed contract is future analytics pain, so every signal type a tool
 * can record is enumerated here.
 *
 * Adding a new signal kind:
 *  1. Add its shape to `InterviewSignalSchema` below.
 *  2. Bump the metadata version in `metadataVersion`.
 *  3. Update analytics queries that read these signals.
 */

import { z } from 'zod';
import { chatToolSchema } from '@/lib/chat/strict-schema';

/** Release stage the artist self-reports. */
export const releaseStageSchema = z.enum([
  'no_active_release',
  'pre_announce',
  'announced_unreleased',
  'just_released',
  'ongoing_rollout',
  'between_releases',
]);
export type ReleaseStage = z.infer<typeof releaseStageSchema>;

/** Coarse-grained audience size band — useful for plan/qualification logic. */
export const audienceBandSchema = z.enum([
  'under_500',
  '500_to_5k',
  '5k_to_50k',
  '50k_to_500k',
  'over_500k',
]);
export type AudienceBand = z.infer<typeof audienceBandSchema>;

/** What the artist is currently using (the status quo Jovie is replacing). */
export const currentToolSchema = chatToolSchema({
  /** Free-text identifier: "linktree", "bio.fm", "my own site", "nothing", etc. */
  name: z.string().min(1).max(120),
  /** What about it does/doesn't work — short free text. Optional. */
  note: z.string().max(500).optional(),
});

/** A single objection or hesitation the user raised. */
export const objectionSchema = chatToolSchema({
  /** Categorized objection kind, free-text fallback allowed via `other`. */
  category: z.enum([
    'price',
    'effort_to_set_up',
    'data_lock_in',
    'feature_gap',
    'trust_brand_unknown',
    'wrong_audience',
    'platform_specific_concern',
    'other',
  ]),
  /** What they actually said, paraphrased — 1-2 sentences max. */
  text: z.string().min(1).max(500),
});

/**
 * Recorded signal payload. The LLM writes one of these per relevant turn.
 * The tool can pass only the fields it has signal on — every field is
 * optional, but at least one MUST be present (enforced via refine).
 */
export const interviewSignalSchema = chatToolSchema({
  /** What happened the last time they shared or released their work. */
  pastBehavior: z.string().trim().min(8).max(2000).optional(),
  /** Artist role learned in the interview, never inferred from audience size. */
  isMusicArtist: z.boolean().optional(),
  youtubeChannelUrl: z.string().url().max(200).optional(),
  releaseStage: releaseStageSchema.optional(),
  audienceBand: audienceBandSchema.optional(),
  currentTool: currentToolSchema.optional(),
  objection: objectionSchema.optional(),
  /** Free-form note for anything that doesn't fit the typed schema yet. */
  freeNote: z.string().max(2000).optional(),
}).refine(
  v =>
    Boolean(
      v.pastBehavior ||
        v.isMusicArtist !== undefined ||
        v.youtubeChannelUrl ||
        v.releaseStage ||
        v.audienceBand ||
        v.currentTool ||
        v.objection ||
        v.freeNote
    ),
  { message: 'At least one signal field must be present' }
);
export type InterviewSignal = z.infer<typeof interviewSignalSchema>;

/**
 * The aggregate shape persisted at chat_conversations.metadata.interviewSignals.
 * Append-only: each tool call appends one entry. Read-time consumers should
 * use the most recent occurrence of a given field as the canonical value.
 */
export const interviewSignalsMetadataSchema = chatToolSchema({
  // v2 adds past behavior, music role and channel; persisted v1 remains readable.
  metadataVersion: z.union([z.literal(1), z.literal(2)]),
  signals: z
    .array(
      interviewSignalSchema.and(z.object({ recordedAt: z.string().datetime() }))
    )
    .max(50),
});
export type InterviewSignalsMetadata = z.infer<
  typeof interviewSignalsMetadataSchema
>;

/** Reduce the append-only signal log to the most-recent value per field. */
export function collapseInterviewSignals(
  signals: InterviewSignalsMetadata['signals']
): InterviewSignal {
  const result: InterviewSignal = {};
  for (const s of signals) {
    if (s.pastBehavior) result.pastBehavior = s.pastBehavior;
    if (s.isMusicArtist !== undefined) result.isMusicArtist = s.isMusicArtist;
    if (s.youtubeChannelUrl) result.youtubeChannelUrl = s.youtubeChannelUrl;
    if (s.releaseStage) result.releaseStage = s.releaseStage;
    if (s.audienceBand) result.audienceBand = s.audienceBand;
    if (s.currentTool) result.currentTool = s.currentTool;
    if (s.objection) result.objection = s.objection;
    if (s.freeNote) result.freeNote = s.freeNote;
  }
  return result;
}
