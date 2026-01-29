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

/**
 * Payload schema for Instagram import jobs.
 */
export const instagramPayloadSchema = z.object({
  creatorProfileId: z.string().uuid(),
  sourceUrl: z.string().url(),
  dedupKey: z.string().optional(),
  depth: z.number().int().min(0).max(2).default(0),
});

export type InstagramPayload = z.infer<typeof instagramPayloadSchema>;

/**
 * Payload schema for TikTok import jobs.
 */
export const tiktokPayloadSchema = z.object({
  creatorProfileId: z.string().uuid(),
  sourceUrl: z.string().url(),
  dedupKey: z.string().optional(),
  depth: z.number().int().min(0).max(2).default(0),
});

export type TikTokPayload = z.infer<typeof tiktokPayloadSchema>;

/**
 * Payload schema for Twitter import jobs.
 */
export const twitterPayloadSchema = z.object({
  creatorProfileId: z.string().uuid(),
  sourceUrl: z.string().url(),
  dedupKey: z.string().optional(),
  depth: z.number().int().min(0).max(2).default(0),
});

export type TwitterPayload = z.infer<typeof twitterPayloadSchema>;
