import { z } from 'zod';
import type { CanvasStatus } from '@/lib/services/canvas/types';

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
 * Telemetry hooks for the chat turn pipeline.
 *
 * In the production route handler these wrap Sentry. In eval scripts and
 * unit tests they can be no-ops or write to a local sink. Decoupling lets
 * `executeChatTurn` stay free of Sentry imports without losing observability.
 */
export interface ChatTelemetry {
  setTags?(tags: Record<string, string>): void;
  setExtra?(key: string, value: unknown): void;
  captureException?(
    error: unknown,
    context: { tags?: Record<string, string>; extra?: Record<string, unknown> }
  ): void;
}

/**
 * One canon doc retrieved for a chat answer. Sent to the client via the
 * AI SDK's `messageMetadata` callback so source chips can render below
 * the assistant bubble.
 */
export interface RetrievedChatSource {
  /** Canon doc title (max 60 chars). Renders in the chip. */
  readonly title: string;
  /** Optional public URL — when present, the chip is clickable. */
  readonly sourceUrl: string | null;
  /** Cosine score (0..1). Surfaced in `title=` tooltip for debugging. */
  readonly score: number;
}

/**
 * Metadata attached to every Jovie chat assistant message. Reaches the
 * client via AI SDK's `messageMetadata` on `streamText().toUIMessageStreamResponse`.
 *
 * The client uses `chatTraceId` for feedback POSTs and renders
 * `retrievedSources` as source chips below the reply bubble.
 */
export interface JovieChatMessageMetadata {
  readonly chatTraceId: string;
  readonly retrievedSources: readonly RetrievedChatSource[];
  /** Composite version stamp; useful for "report bug" affordance. */
  readonly retrievalVersion: string;
}
