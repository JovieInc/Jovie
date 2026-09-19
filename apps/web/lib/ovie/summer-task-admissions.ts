import { z } from 'zod';

const sha = z.string().regex(/^[a-f0-9]{40}$/u);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const timestamp = z.string().datetime({ offset: true });
const observation = z
  .object({
    state: z.enum(['ALLOWED', 'HELD', 'UNKNOWN']),
    observedAt: timestamp.nullable(),
    expiresAt: timestamp.nullable(),
    sourceDigest: digest.nullable(),
    reason: z.string().regex(/^[a-z][a-z0-9-]{1,127}$/u),
  })
  .strict();

// Mirrors Summer's v1 task evidence contract. This bridge authenticates evidence;
// the receiver evaluates exact assignment/runtime binding and 600s freshness.
// A schema-valid observation (including stale or crossed evidence) is not a grant.
export const summerTaskAdmissionsSchema = z
  .object({
    schema: z.literal('jovie.eve.summer-task-admissions/v1'),
    assignmentDigest: digest,
    selectedId: z.string().min(1).max(128),
    sourceRevision: sha,
    runtimeRevision: sha,
    runtimeGeneration: digest,
    runtimeInvocationId: z.string().regex(/^[a-f0-9]{32}$/u),
    providerEligibility: observation,
    downstreamHealth: observation,
    providerObservation: z
      .object({
        providerGrantDigest: digest,
        provider: z.literal('grok'),
        model: z.literal('grok-4.6'),
        accountUserId: z.uuid(),
        authPoolIdentity: digest,
        executableDigest: digest,
        routerDigest: digest,
        outputDigest: digest,
        quotaObservedAt: timestamp,
        quotaSourceDigest: digest,
        includedRemainingPercent: z.number().int().min(0).max(100),
      })
      .strict()
      .nullable(),
  })
  .strict();
