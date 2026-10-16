import { z } from 'zod';

/** Closed vocabulary; values are projections of existing profile sources. */
export const ARTIST_PROFILE_FIELDS = [
  'bio',
  'bio_link',
  'image',
  'website',
] as const;
export type ArtistProfileField = (typeof ARTIST_PROFILE_FIELDS)[number];

const reference = z.string().trim().min(1);
const scope = reference.regex(/^\S+$/).refine(value => !value.includes('*'), {
  message: 'Authorization must name exact OAuth scopes',
});
const unavailable = z.strictObject({
  status: z.enum(['unknown', 'unsupported']),
  reason: reference,
});
const documented = z.strictObject({
  status: z.literal('documented'),
  policyRef: reference,
});
const required = z.strictObject({
  status: z.literal('required'),
  policyRef: reference,
  /** Approval must bind the destination, field, and exact previewed value. */
  binding: z.literal('destination_field_value'),
});
const authorization = z.union([
  z.strictObject({
    status: z.literal('verified'),
    mechanism: z.literal('oauth'),
    requiredScopes: z.array(scope).min(1).readonly(),
    /** Exact provider resource selector, resolved against the existing connection. */
    resource: reference,
    requiredRole: z.enum(['owner', 'owner_or_manager']),
    evidenceRef: reference,
  }),
  z.strictObject({
    status: z.literal('public'),
    resource: reference,
    evidenceRef: reference,
  }),
  unavailable,
]);
const rateLimit = z.union([
  z.strictObject({
    status: z.literal('documented'),
    policyRef: reference,
    key: z.enum(['connection', 'provider']),
    maxRequests: z.number().int().positive(),
    windowSeconds: z.number().int().positive(),
    onLimit: z.literal('respect_retry_after'),
  }),
  unavailable,
]);
const audit = z.union([
  z.strictObject({ mode: z.literal('before_after'), policyRef: reference }),
  z.strictObject({
    mode: z.enum(['unknown', 'unsupported']),
    reason: reference,
  }),
]);
const rollback = z.union([
  z.strictObject({
    mode: z.enum(['snapshot_restore', 'compensating_write']),
    policyRef: reference,
    evidenceRef: reference,
  }),
  z.strictObject({
    mode: z.enum(['unknown', 'unsupported']),
    reason: reference,
  }),
]);
const termsApi = z.union([
  z.strictObject({
    status: z.literal('approved'),
    api: z.enum(['official', 'partner']),
    apiRef: reference,
    termsRef: reference,
    evidenceRef: reference,
  }),
  unavailable,
]);
const evidence = z.union([
  z.strictObject({
    status: z.literal('documented'),
    requirements: z
      .array(
        z.enum([
          'authorization',
          'before_after',
          'confirmation',
          'documentation',
          'preview',
          'readback',
          'rollback',
          'validation',
        ])
      )
      .min(1)
      .readonly(),
    refs: z.array(reference).min(1).readonly(),
  }),
  unavailable,
]);

const fieldSchema = z
  .strictObject({
    read: z.enum(['supported', 'unsupported', 'unknown']),
    /** Supported means write readiness is known, with every policy below satisfied. */
    write: z.enum(['supported', 'unsupported', 'unknown']),
    authorization: z.strictObject({
      read: authorization,
      write: authorization,
    }),
    validation: z.union([documented, unavailable]),
    preview: z.union([required, unavailable]),
    confirmation: z.union([required, unavailable]),
    rateLimit,
    audit,
    rollback,
    termsApi,
    evidence,
  })
  .superRefine((field, ctx) => {
    const reject = (path: string[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    const canRead = field.read === 'supported';
    const canWrite = field.write === 'supported';
    if (canRead || canWrite) {
      if (field.validation.status !== 'documented')
        reject(
          ['validation'],
          'Supported operations require a validation policy'
        );
      if (field.rateLimit.status !== 'documented')
        reject(
          ['rateLimit'],
          'Supported operations require a rate-limit policy'
        );
      if (field.termsApi.status !== 'approved')
        reject(
          ['termsApi'],
          'Supported operations require approved terms/API evidence'
        );
      if (field.evidence.status !== 'documented') {
        reject(['evidence'], 'Supported operations require evidence');
      } else {
        for (const requirement of [
          'authorization',
          'documentation',
          'validation',
        ] as const) {
          if (!field.evidence.requirements.includes(requirement))
            reject(
              ['evidence', 'requirements'],
              `Missing ${requirement} evidence requirement`
            );
        }
      }
    }
    if (
      canRead &&
      !['verified', 'public'].includes(field.authorization.read.status)
    )
      reject(
        ['authorization', 'read'],
        'Supported reads require exact authorization'
      );
    if (canWrite) {
      if (field.authorization.write.status !== 'verified')
        reject(
          ['authorization', 'write'],
          'Supported writes require verified OAuth authorization'
        );
      if (field.preview.status !== 'required')
        reject(['preview'], 'Supported writes require an exact-value preview');
      if (field.confirmation.status !== 'required')
        reject(
          ['confirmation'],
          'Supported writes require exact-value confirmation'
        );
      if (field.audit.mode !== 'before_after')
        reject(['audit'], 'Supported writes require before/after audit');
      if (field.rollback.mode === 'unknown')
        reject(['rollback'], 'Write readiness requires a known rollback mode');
      if (field.evidence.status === 'documented') {
        const requirements = [
          'before_after',
          'confirmation',
          'preview',
          'readback',
        ] as const;
        for (const requirement of requirements) {
          if (!field.evidence.requirements.includes(requirement))
            reject(
              ['evidence', 'requirements'],
              `Missing ${requirement} evidence requirement`
            );
        }
      }
    }
    if (
      ['snapshot_restore', 'compensating_write'].includes(field.rollback.mode)
    ) {
      if (!canWrite || field.audit.mode !== 'before_after')
        reject(
          ['rollback'],
          'Rollback requires a supported write and before/after audit'
        );
      if (field.rollback.mode === 'snapshot_restore' && !canRead)
        reject(
          ['rollback'],
          'Snapshot restore requires a supported read of the previous value'
        );
      if (
        field.evidence.status !== 'documented' ||
        !field.evidence.requirements.includes('rollback')
      )
        reject(['evidence'], 'Rollback claims require rollback evidence');
    }
  });

export const artistProfileContractSchema = z.strictObject({
  fields: z.strictObject({
    bio: fieldSchema,
    bio_link: fieldSchema,
    image: fieldSchema,
    website: fieldSchema,
  }),
});
export type ArtistProfileContract = z.infer<typeof artistProfileContractSchema>;

/** No provider permission or implementation readiness is inferred from its other capabilities. */
export function unknownArtistProfileContract(
  reason: string
): ArtistProfileContract {
  const unknown = { status: 'unknown', reason } as const;
  const field: ArtistProfileContract['fields'][ArtistProfileField] = {
    read: 'unknown',
    write: 'unknown',
    authorization: { read: unknown, write: unknown },
    validation: unknown,
    preview: unknown,
    confirmation: unknown,
    rateLimit: unknown,
    audit: { mode: 'unknown', reason },
    rollback: { mode: 'unknown', reason },
    termsApi: unknown,
    evidence: unknown,
  };
  return artistProfileContractSchema.parse({
    fields: { bio: field, bio_link: field, image: field, website: field },
  });
}
