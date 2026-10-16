import { z } from 'zod';
import { artistProfileContractSchema } from './artist-profile-contract';

const reference = z.string().trim().min(1);
const positive = z.number().int().positive();
const urlRules = {
  policyRef: reference,
  transform: z.enum(['identity', 'trim']),
  maxLength: positive,
  allowedProtocols: z.array(z.enum(['https:', 'http:'])).min(1),
};
const textRules = z
  .strictObject({
    policyRef: reference,
    transform: z.enum(['identity', 'trim']),
    minLength: z.number().int().nonnegative(),
    maxLength: positive,
    lengthUnit: z.enum(['utf16', 'code_points', 'utf8_bytes']),
  })
  .refine(rule => rule.minLength <= rule.maxLength);
const imageRules = z
  .strictObject({
    ...urlRules,
    mimeTypes: z.array(z.string().regex(/^image\/[a-z0-9.+-]+$/)).min(1),
    maxBytes: positive,
    minWidth: positive,
    minHeight: positive,
    maxWidth: positive,
    maxHeight: positive,
  })
  .refine(
    rule => rule.minWidth <= rule.maxWidth && rule.minHeight <= rule.maxHeight
  );

/** Versioned, machine-readable policies; a documentation link alone is insufficient. */
export const artistProfilePreviewManifestSchema = z.strictObject({
  providerId: reference,
  version: reference,
  artistProfile: artistProfileContractSchema,
  constraints: z.strictObject({
    bio: textRules.optional(),
    bio_link: z.strictObject(urlRules).optional(),
    image: imageRules.optional(),
    website: z.strictObject(urlRules).optional(),
  }),
  termsEvidence: z.record(
    reference,
    z.strictObject({
      reviewedAt: z.iso.datetime(),
      expiresAt: z.iso.datetime(),
    })
  ),
  execution: z.union([
    z.strictObject({
      status: z.literal('documented'),
      timeoutMs: positive,
      maxAttempts: positive,
    }),
    z.strictObject({ status: z.literal('unknown'), reason: reference }),
  ]),
});
export type ArtistProfilePreviewManifest = z.infer<
  typeof artistProfilePreviewManifestSchema
>;

export const profileImageEvidenceSchema = z.strictObject({
  /** Metadata must describe this exact outbound asset, not another canonical image. */
  value: z.string(),
  mimeType: z.string(),
  bytes: positive,
  width: positive,
  height: positive,
  evidenceRef: reference,
});
export type ProfileImageEvidence = z.infer<typeof profileImageEvidenceSchema>;

export const profileFieldObservationSchema = z.strictObject({
  value: z.string().nullable(),
  version: z
    .string()
    .min(1)
    .refine(value => value.trim().length > 0),
  observedAt: z.iso.datetime(),
});
export const profilePreviewTimeSchema = z.iso.datetime();
