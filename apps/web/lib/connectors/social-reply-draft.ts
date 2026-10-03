/**
 * Social reply drafts in the unified inbox (JOV-5128).
 *
 * A `social_reply.draft` suggested action carries one inbound social item
 * (comment/DM/mention) plus the drafted reply awaiting the creator's explicit
 * approve. `authorKind` is the named identity/intent signal so fan replies,
 * collab requests, booking inquiries, and sponsorship offers all render as
 * first-class activity on the same decision interaction.
 *
 * Approve stays decision-only: the CAS approval is the durable record the
 * headless executor binds to, and `executionState` tracks per-item progress
 * (checking → sending → verified / blocked / ambiguous). Zero duplicate or
 * unapproved sends remains a hard invariant — nothing sends from draft state.
 */

import { z } from 'zod';
import {
  socialInboxFeatureKeysForDraft,
  socialInboxRankingSignalsSchema,
} from './social-inbox-ranker';
import { SOCIAL_REPLY_DRAFT_KIND } from './suggested-action-kinds';

export const SOCIAL_REPLY_EXECUTION_STATES = [
  'pending',
  'checking',
  'sending',
  'verified',
  'blocked',
  'ambiguous',
] as const;

export const socialReplyExecutionStateSchema = z.enum(
  SOCIAL_REPLY_EXECUTION_STATES
);

export type SocialReplyExecutionState = z.infer<
  typeof socialReplyExecutionStateSchema
>;

export const SOCIAL_REPLY_AUTHOR_KINDS = [
  'fan',
  'collab',
  'booking',
  'sponsorship',
  'press',
  'playlist',
  'anonymous',
] as const;

export const socialReplyAuthorKindSchema = z.enum(SOCIAL_REPLY_AUTHOR_KINDS);

export type SocialReplyAuthorKind = z.infer<typeof socialReplyAuthorKindSchema>;

/** One revision round: the durable feedback plus the draft it replaced. */
export const socialReplyRevisionSchema = z.object({
  feedback: z.string().trim().min(1).max(2_000),
  revisedAt: z.string().datetime(),
  draftedText: z.string().trim().min(1).max(4_000),
});

export type SocialReplyRevision = z.infer<typeof socialReplyRevisionSchema>;

export const socialReplyDraftPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().trim().min(1).max(256),
  platform: z.string().trim().min(1).max(64),
  /** Provider-stable ids for the thread/object and reply target. */
  sourceId: z.string().trim().min(1).max(512),
  targetId: z.string().trim().min(1).max(512),
  /** Display identity of the inbound author, e.g. `@fan` or `Name (YouTube)`. */
  authorLabel: z.string().trim().min(1).max(256),
  authorKind: socialReplyAuthorKindSchema.default('anonymous'),
  /** The inbound message being replied to. */
  inboundText: z.string().trim().min(1).max(4_000),
  inboundAt: z.string().datetime(),
  /** Provider/enrichment evidence for deterministic ROI ranking (JOV-5859). */
  rankingSignals: socialInboxRankingSignalsSchema
    .optional()
    .transform(value => socialInboxRankingSignalsSchema.parse(value ?? {})),
  /** Current draft shown for approval. Replaced on each revision round. */
  draftedText: z.string().trim().min(1).max(4_000),
  sourceUrl: z.string().url().nullable().default(null),
  executionState: socialReplyExecutionStateSchema.default('pending'),
  /** Ordered revision history; oldest first. Never rewritten in place. */
  revisions: z.array(socialReplyRevisionSchema).max(50).default([]),
  /** Original suggested_actions.id this draft was revised from. */
  revisionOf: z.string().trim().min(1).nullable().default(null),
});

export type SocialReplyDraftPayload = z.infer<
  typeof socialReplyDraftPayloadSchema
>;

export function parseSocialReplyDraft(
  kind: string,
  payload: unknown
): SocialReplyDraftPayload | null {
  if (kind !== SOCIAL_REPLY_DRAFT_KIND) return null;
  const parsed = socialReplyDraftPayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export function getSocialReplyRankingFeatureKeys(input: {
  readonly id: string;
  readonly kind: string;
  readonly payload: unknown;
}): readonly string[] {
  const draft = parseSocialReplyDraft(input.kind, input.payload);
  return draft
    ? socialInboxFeatureKeysForDraft({ ...draft, id: input.id })
    : [];
}

/**
 * Build the payload for the next draft in a revision chain. The prior draft
 * and the creator's feedback are appended to `revisions` so history survives
 * the supersede; `revisionOf` always points at the chain root.
 */
export function buildSocialReplyRevisionPayload(
  payload: SocialReplyDraftPayload,
  input: {
    readonly feedback: string;
    readonly revisedAt: string;
    readonly revisedFromActionId: string;
    readonly draftedText?: string;
  }
): SocialReplyDraftPayload {
  const revisions: SocialReplyRevision[] = [
    ...payload.revisions,
    {
      feedback: input.feedback,
      revisedAt: input.revisedAt,
      draftedText: payload.draftedText,
    },
  ];
  return {
    ...payload,
    draftedText: input.draftedText?.trim() || payload.draftedText,
    executionState: 'pending',
    revisions,
    revisionOf: payload.revisionOf ?? input.revisedFromActionId,
  };
}
