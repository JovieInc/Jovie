import { z } from 'zod';
import { ARTIST_PROFILE_FIELDS } from './artist-profile-contract';
import { digest } from './profile-writes/contract';
import {
  PROFILE_ACCEPT_OBSERVATION_KIND,
  PROFILE_WRITE_DESTINATION_KIND,
} from './suggested-action-kinds';
import { CONNECTOR_PROVIDER_IDS } from './types';

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const reference = z.string().trim().min(1).max(2_000);
const url = z
  .string()
  .url()
  .refine(value => {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  });

export const profileActionValuesSchema = z.strictObject({
  bio: z.string().max(10_000).nullable().optional(),
  bio_link: url.nullable().optional(),
  image: url.nullable().optional(),
  website: url.nullable().optional(),
});

export const profileActionKindSchema = z.enum([
  PROFILE_ACCEPT_OBSERVATION_KIND,
  PROFILE_WRITE_DESTINATION_KIND,
]);
export type ProfileActionKind = z.infer<typeof profileActionKindSchema>;

export function isProfileActionKind(kind: string): kind is ProfileActionKind {
  return profileActionKindSchema.safeParse(kind).success;
}

export const profileActionProposalSchema = z.strictObject({
  schemaVersion: z.literal(1),
  creatorProfileId: z.string().uuid(),
  target: z.strictObject({
    connectorAccountId: z.string().uuid(),
    provider: z.enum(CONNECTOR_PROVIDER_IDS),
    providerAccountId: reference,
  }),
  fields: z.array(z.enum(ARTIST_PROFILE_FIELDS)).min(1).max(4),
  values: profileActionValuesSchema,
  canonicalRevision: checksum,
  /** Content-addressed version of the validated artist-profile manifest. */
  manifestVersion: checksum,
  observation: z.strictObject({ id: z.string().uuid(), checksum }).nullable(),
  evidenceRefs: z.array(reference).min(1).max(50),
  rationale: reference,
  requiredConfirmationMode: z.literal('exact_preview'),
});

export const profileActionPayloadSchema = z
  .strictObject({
    proposal: profileActionProposalSchema,
    previewChecksum: checksum,
    consent: z
      .strictObject({
        mode: z.literal('exact_preview'),
        previewChecksum: checksum,
        actorId: z.string().uuid(),
        confirmedAt: z.string().datetime(),
      })
      .nullable(),
  })
  .superRefine(({ proposal, previewChecksum, consent }, ctx) => {
    const keys = Object.keys(proposal.values).sort();
    if (
      digest(keys) !== digest([...proposal.fields].sort()) ||
      proposal.fields.some(field => proposal.values[field] === undefined)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Fields must match exact values',
      });
    }
    if (consent && consent.previewChecksum !== previewChecksum) {
      ctx.addIssue({ code: 'custom', message: 'Consent must match preview' });
    }
  });

export type ProfileActionPayload = z.infer<typeof profileActionPayloadSchema>;
export type ProfileActionProposal = ProfileActionPayload['proposal'];

export const profileActionConfirmationSchema = z.strictObject({
  mode: z.literal('exact_preview'),
  previewChecksum: checksum,
});

export function profilePreviewChecksum(input: {
  id: string;
  userId: string;
  kind: ProfileActionKind;
  proposal: ProfileActionProposal;
}): string {
  return digest(input);
}

export function parseProfileAction(kind: string, payload: unknown) {
  if (!isProfileActionKind(kind)) return null;
  const parsed = profileActionPayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const inbound = kind === PROFILE_ACCEPT_OBSERVATION_KIND;
  return inbound === Boolean(parsed.data.proposal.observation)
    ? parsed.data
    : null;
}
