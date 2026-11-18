import { z } from 'zod';
import type { EnforcedArtistRule } from '@/lib/artist-rules/gate';
import type { CanvasStatus } from '@/lib/services/canvas/types';

/**
 * Zod schema for validating client-provided artist context.
 * Used when profileId is not provided (backward compatibility).
 */
// Not a chat tool schema — artist context validation for the HTTP route.
// eslint-disable-next-line @jovie/chat-tool-schema-strict -- request DTO, not LLM tool input
export const artistContextSchema = z.object({
  displayName: z.string().max(100),
  username: z.string().max(50),
  bio: z.string().max(500).nullable(),
  genres: z.array(z.string().max(50)).max(10),
  spotifyFollowers: z.number().int().nonnegative().nullable(),
  spotifyPopularity: z.number().int().min(0).max(100).nullable(),
  spotifyUrl: z.string().url().nullable().optional(),
  appleMusicUrl: z.string().url().nullable().optional(),
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

/**
 * `artistRules` is loaded server-side only; the client schema strips it, so a
 * client-provided context can never carry rules.
 */
export type ArtistContext = z.infer<typeof artistContextSchema> & {
  readonly artistRules?: readonly EnforcedArtistRule[];
};

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

/** Catalog read health for one chat turn. */
export type ReleaseCatalogStatus = 'ok' | 'unavailable';

/**
 * Catalog counts for one chat turn. `total` is the number of live releases in
 * the artist's catalog (not just the loaded slice); null when the count is
 * unknown because the catalog could not be read.
 */
export interface ReleaseCatalogMeta {
  readonly status: ReleaseCatalogStatus;
  readonly total: number | null;
}

/**
 * Per-turn release catalog snapshot: the loaded prompt/tool slice plus the
 * whole-catalog count and read health. `status: 'unavailable'` means the read
 * failed; the artist may still have releases, so callers must never render it
 * as "no releases exist".
 */
export interface ReleaseCatalogSnapshot extends ReleaseCatalogMeta {
  readonly releases: ReleaseContext[];
}

/**
 * An owned release resolved from the full catalog (beyond the per-turn
 * slice), with the evidence a chat tool needs to ground a statement about it:
 * date/type/identity plus catalog identifiers and provider links.
 */
export interface ChatReleaseLookup extends ReleaseContext {
  readonly upc: string | null;
  readonly label: string | null;
  readonly distributor: string | null;
  readonly providerLinks: readonly {
    readonly provider: string;
    readonly url: string;
    readonly isPrimary: boolean;
  }[];
}

/**
 * Telemetry hooks for the chat turn pipeline.
 *
 * In the production route handler these wrap Sentry. In eval scripts and
 * unit tests they can be no-ops or write to a local sink. Decoupling lets
 * `executeChatTurn` stay free of Sentry imports without losing observability.
 */
export interface ChatTelemetryBreadcrumb {
  category: string;
  message: string;
  level?: 'debug' | 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
}

export interface ChatTelemetry {
  setTags?(tags: Record<string, string>): void;
  setExtra?(key: string, value: unknown): void;
  addBreadcrumb?(breadcrumb: ChatTelemetryBreadcrumb): void;
  captureException?(
    error: unknown,
    context: { tags?: Record<string, string>; extra?: Record<string, unknown> }
  ): void | Promise<void>;
}
