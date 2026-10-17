import { z } from 'zod';
import type * as Link from './link-apply';
import type { YouTubeLinkPlan } from './link-inspect';

export const sourceVersionSchema = z.object({
  etag: z.string().min(1).max(512),
  descriptionSha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const linkCommandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('apply'),
    creatorProfileId: z.string().uuid(),
    approval: z.object({
      approved: z.literal(true),
      scope: z.literal('single-item-description-link'),
      videoId: z.string().min(1).max(128),
      sourceVersion: sourceVersionSchema,
      proposedDescriptionSha256: z.string().regex(/^[a-f0-9]{64}$/),
      expectedUrl: z.string().url().max(2048),
    }),
  }),
  z.object({
    action: z.literal('rollback'),
    creatorProfileId: z.string().uuid(),
    approved: z.literal(true),
    operationKey: z.string().min(1).max(512),
    sourceVersion: sourceVersionSchema,
  }),
]);

export interface YouTubeLinkPreview {
  readonly plan: YouTubeLinkPlan;
  readonly approval: Link.YouTubeLinkApproval | null;
  readonly rollback: {
    readonly operationKey: string;
    readonly originalDescription: string;
    readonly sourceVersion: Link.YouTubeLinkSourceVersion;
  } | null;
}
