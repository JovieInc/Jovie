import { z } from 'zod';

import type { ActionDescriptor } from '../descriptor';

/**
 * `release.create` — create a manual Jovie release draft.
 *
 * Internal write. Creates only a manual draft: Spotify/Apple import, sync,
 * smart-link publication, distribution, and chat-generated paid tools are
 * separate actions with separate IDs. Enforces the canonical manual-release
 * capability at invoke time even while enabled for all plans.
 */

/** Mirrors the discog release type domain enum. */
export const RELEASE_TYPES = [
  'single',
  'ep',
  'album',
  'compilation',
  'live',
  'mixtape',
  'music_video',
  'other',
] as const;

export const releaseTypeSchema = z.enum(RELEASE_TYPES);

/** ISO calendar date, YYYY-MM-DD. */
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const releaseCreateInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  releaseType: releaseTypeSchema,
  releaseDate: isoDateSchema.optional(),
  revealDate: isoDateSchema.optional(),
  genres: z.array(z.string().trim().min(1).max(60)).max(3).optional(),
  explicit: z.boolean().optional(),
});

export const releaseCreateOutputSchema = z.object({
  releaseId: z.uuid(),
  slug: z.string().min(1),
  title: z.string().min(1),
});

export type ReleaseCreateInput = z.infer<typeof releaseCreateInputSchema>;
export type ReleaseCreateOutput = z.infer<typeof releaseCreateOutputSchema>;

export const releaseCreateAction: ActionDescriptor<
  typeof releaseCreateInputSchema,
  typeof releaseCreateOutputSchema
> = {
  id: 'release.create',
  schemaVersion: 1,
  titleKey: 'actions.release.create.title',
  descriptionKey: 'actions.release.create.description',
  effect: 'internal_write',
  confirmation: 'none',
  supportedChannels: ['web', 'ios', 'chat_tool', 'mcp', 'cli'],
  requirements: [
    { type: 'auth' },
    { type: 'profile_ownership' },
    { type: 'entitlement', key: 'canCreateManualReleases' },
  ],
  inputSchema: releaseCreateInputSchema,
  outputSchema: releaseCreateOutputSchema,
};
