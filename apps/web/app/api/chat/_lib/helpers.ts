import { z } from 'zod';
import type { CanvasStatus } from '@/lib/services/canvas/types';

/**
 * Editable profile fields by tier:
 * - Tier 1 (Safe): Non-destructive fields that can be freely edited
 * - Tier 2 (Careful): Fields that need confirmation before applying
 * - Tier 3 (Blocked): Cannot be edited via chat - requires settings page
 */
export const EDITABLE_FIELDS = {
  tier1: ['displayName', 'bio'] as const,
  tier2: ['genres'] as const,
  blocked: ['username', 'avatarUrl', 'spotifyId'] as const,
};

export type EditableField =
  | (typeof EDITABLE_FIELDS.tier1)[number]
  | (typeof EDITABLE_FIELDS.tier2)[number];

export const FIELD_DESCRIPTIONS: Record<EditableField, string> = {
  displayName: 'Display name shown on your profile',
  bio: 'Artist bio/description',
  genres: 'Music genres (comma-separated)',
};

/**
 * Zod schema for validating client-provided artist context.
 * Used when profileId is not provided (backward compatibility).
 */
export const artistContextSchema = z.object({
  displayName: z.string().max(100),
  username: z.string().max(50),
  bio: z.string().max(500).nullable(),
  genres: z.array(z.string().max(50)).max(10),
  spotifyFollowers: z.number().int().nonnegative().nullable(),
  spotifyPopularity: z.number().int().min(0).max(100).nullable(),
  profileViews: z.number().int().nonnegative(),
  hasSocialLinks: z.boolean(),
  hasMusicLinks: z.boolean(),
  tippingStats: z.object({
    tipClicks: z.number().int().nonnegative(),
    tipsSubmitted: z.number().int().nonnegative(),
    totalReceivedCents: z.number().int().nonnegative(),
    monthReceivedCents: z.number().int().nonnegative(),
  }),
});

export type ArtistContext = z.infer<typeof artistContextSchema>;

/** Lightweight release info for chat context (avoids loading full provider data). */
export interface ReleaseContext {
  readonly id: string;
  readonly title: string;
  readonly releaseType: string;
  readonly releaseDate: string | null;
  readonly artworkUrl: string | null;
  readonly spotifyPopularity: number | null;
  readonly totalTracks: number;
  readonly canvasStatus: CanvasStatus;
  readonly metadata: Record<string, unknown> | null;
}

/**
 * Find a release by title (exact match first, then partial).
 * Returns null if no match found.
 */
export function findReleaseByTitle(
  releases: ReleaseContext[],
  title: string
): ReleaseContext | null {
  const lower = title.toLowerCase();
  return (
    releases.find(r => r.title.toLowerCase() === lower) ??
    releases.find(r => r.title.toLowerCase().includes(lower)) ??
    null
  );
}

/** Format available release titles for error messages. */
export function formatAvailableReleases(releases: ReleaseContext[]): string {
  return releases
    .slice(0, 10)
    .map(r => r.title)
    .join(', ');
}
