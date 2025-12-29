import { z } from 'zod';
import { isValidSocialPlatform } from '@/types';

/**
 * Schema for updating social links (PUT request).
 */
export const updateSocialLinksSchema = z.object({
  profileId: z.string().min(1),
  idempotencyKey: z.string().max(128).optional(),
  expectedVersion: z.number().int().min(1).optional(),
  links: z
    .array(
      z.object({
        platform: z
          .string()
          .min(1)
          .refine(isValidSocialPlatform, { message: 'Invalid platform' }),
        platformType: z.string().min(1).optional(),
        url: z.string().min(1).max(2048),
        sortOrder: z.number().int().min(0).optional(),
        isActive: z.boolean().optional(),
        displayText: z.string().max(256).optional(),
        state: z.enum(['active', 'suggested', 'rejected']).optional(),
        confidence: z.number().min(0).max(1).optional(),
        sourcePlatform: z.string().max(128).optional(),
        sourceType: z.enum(['manual', 'admin', 'ingested']).optional(),
        evidence: z
          .object({
            sources: z.array(z.string()).optional(),
            signals: z.array(z.string()).optional(),
          })
          .optional(),
      })
    )
    .max(100)
    .optional(),
});

export type UpdateSocialLinksInput = z.infer<typeof updateSocialLinksSchema>;

/**
 * Schema for updating link state (PATCH request).
 */
export const updateLinkStateSchema = z.object({
  profileId: z.string().min(1),
  linkId: z.string().min(1),
  action: z.enum(['accept', 'dismiss']),
  expectedVersion: z.number().int().min(1).optional(),
});

export type UpdateLinkStateInput = z.infer<typeof updateLinkStateSchema>;
