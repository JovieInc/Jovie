import { z } from 'zod';

import { actionErrorSchemaFor, COMMON_ERROR_CODES } from '../envelope';
import type { ActionDefinition } from '../metadata';
import {
  CANONICAL_AUTH,
  CANONICAL_EVOLUTION,
  CANONICAL_IDEMPOTENCY,
  isoDateSchema,
  mutationBaseSchema,
} from '../shared';

export const RELEASE_CREATE_DOMAIN_ERROR_CODES = [
  'RELEASE_SLUG_CONFLICT',
] as const;

/** Canonical superset of the divergent per-surface release type enums. */
export const RELEASE_TYPES = [
  'single',
  'ep',
  'album',
  'compilation',
  'live',
  'mixtape',
  'other',
] as const;

export const releaseCreateInputSchema = mutationBaseSchema.extend({
  title: z.string().min(1).max(200),
  releaseType: z.enum(RELEASE_TYPES),
  releaseDate: isoDateSchema.optional(),
  label: z.string().min(1).max(200).optional(),
  upc: z.string().min(1).max(20).optional(),
});

export const releaseCreateOutputSchema = z.object({
  releaseId: z.uuid(),
  slug: z.string().min(1),
  /** False when the idempotency key replayed an existing release. */
  created: z.boolean(),
});

const errorCodes = [
  ...COMMON_ERROR_CODES,
  ...RELEASE_CREATE_DOMAIN_ERROR_CODES,
];

export const releaseCreateErrorSchema = actionErrorSchemaFor(
  errorCodes as [string, ...string[]]
);

export type ReleaseCreateInput = z.infer<typeof releaseCreateInputSchema>;
export type ReleaseCreateOutput = z.infer<typeof releaseCreateOutputSchema>;

export const releaseCreateAction: ActionDefinition<
  typeof releaseCreateInputSchema,
  typeof releaseCreateOutputSchema,
  typeof releaseCreateErrorSchema
> = {
  id: 'release.create',
  version: '1',
  kind: 'mutation',
  discovery: {
    title: 'Create release',
    summary:
      'Create a discography release (single, EP, album, …) on the authenticated creator profile.',
    category: 'releases',
    bindings: [
      {
        kind: 'web-api',
        status: 'existing',
        note: 'Legacy paths: createRelease server action, createRelease chat tool, album-art create-release-and-apply, chat audio upload, Spotify ingestion.',
      },
      {
        kind: 'chat-tool',
        status: 'contract-only',
      },
      {
        kind: 'swift',
        status: 'contract-only',
      },
    ],
  },
  auth: CANONICAL_AUTH,
  idempotency: CANONICAL_IDEMPOTENCY,
  evolution: CANONICAL_EVOLUTION,
  domainErrorCodes: RELEASE_CREATE_DOMAIN_ERROR_CODES,
  entitlementKeys: ['canCreateManualReleases'],
  input: releaseCreateInputSchema,
  output: releaseCreateOutputSchema,
  error: releaseCreateErrorSchema,
};
