import { z } from 'zod';

import type {
  ActionAuth,
  ActionEvolution,
  ActionIdempotency,
} from './metadata';

/** Shared auth contract for every canonical mutation. */
export const CANONICAL_AUTH: ActionAuth = {
  requiresAuth: true,
  profileScoped: true,
  publicArtistMcpWritable: false,
} as const;

/** Shared idempotency contract: replay same-key retries, 409 on mismatch. */
export const CANONICAL_IDEMPOTENCY: ActionIdempotency = {
  required: true,
  keyField: 'idempotencyKey',
  onConflict: 'replay',
} as const;

/** Shared evolution rules (README.md is the human-readable source). */
export const CANONICAL_EVOLUTION: ActionEvolution = {
  additiveOnly: true,
  breakingChanges: 'new-action-version',
  deprecation: 'successor-required',
} as const;

/**
 * Fields every canonical mutation input carries. Keeping them in one place
 * prevents per-adapter drift in identity and idempotency handling.
 */
export const mutationBaseFields = {
  /** Creator profile the action is scoped to (resolved server-side). */
  profileId: z.uuid(),
  /**
   * Client-supplied idempotency key. Retried submissions with the same key
   * must replay the recorded result, never double-write.
   */
  idempotencyKey: z.string().min(8).max(128),
} as const;

export const mutationBaseSchema = z.object(mutationBaseFields);

/** ISO calendar date, YYYY-MM-DD. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
