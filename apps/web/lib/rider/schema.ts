import { z } from 'zod';
import { RIDER_VISIBILITIES } from './types';

/** Bounded section shape keeps stored JSONB deterministic and small. */
export const riderSectionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  items: z.array(z.string().trim().min(1).max(300)).max(60),
});

const riderSectionListSchema = z.array(riderSectionSchema).max(24);

export const riderVisibilitySchema = z.enum(RIDER_VISIBILITIES);

export const riderDocumentSchema = z.object({
  technical: riderSectionListSchema,
  hospitality: riderSectionListSchema,
});

export const riderUpdateSchema = z.object({
  technical: riderSectionListSchema,
  hospitality: riderSectionListSchema,
  visibility: riderVisibilitySchema,
  /**
   * Rider-only password gate. A non-empty string replaces the stored hash,
   * `null` clears the gate, and `undefined` leaves it unchanged.
   */
  password: z.string().min(4).max(200).nullish(),
});

export const riderPutSchema = z.object({
  profileId: z.string().uuid(),
  expectedVersion: z.number().int().min(0).optional(),
  rider: riderUpdateSchema,
});
