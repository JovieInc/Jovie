import { z } from 'zod';

/**
 * Payload schema for Linktree import jobs.
 */
export const linktreePayloadSchema = z.object({
  creatorProfileId: z.string().uuid(),
  sourceUrl: z.string().url(),
  dedupKey: z.string().optional(),
  depth: z.number().int().min(0).max(3).default(0),
});

export type LinktreePayload = z.infer<typeof linktreePayloadSchema>;

/**
 * Payload schema for Laylo import jobs.
 */
export const layloPayloadSchema = z.object({
  creatorProfileId: z.string().uuid(),
  sourceUrl: z.string().url(),
  dedupKey: z.string().optional(),
  depth: z.number().int().min(0).max(3).default(0),
});

export type LayloPayload = z.infer<typeof layloPayloadSchema>;

/**
 * Payload schema for YouTube import jobs.
 */
export const youtubePayloadSchema = z.object({
  creatorProfileId: z.string().uuid(),
  sourceUrl: z.string().url(),
  dedupKey: z.string().optional(),
  depth: z.number().int().min(0).max(1).default(0),
});

export type YouTubePayload = z.infer<typeof youtubePayloadSchema>;

/**
 * Payload schema for Beacons import jobs.
 */
export const beaconsPayloadSchema = z.object({
  creatorProfileId: z.string().uuid(),
  sourceUrl: z.string().url(),
  dedupKey: z.string().optional(),
  depth: z.number().int().min(0).max(3).default(0),
});

export type BeaconsPayload = z.infer<typeof beaconsPayloadSchema>;
