import { z } from 'zod';

const sourceDate = z.union([z.iso.date(), z.iso.datetime()]).nullable();

/** Authoring evidence, never a certificate or an external-action permission. */
export const GrowthGovernanceSchema = z
  .strictObject({
    version: z.literal('growth-preparation/v1'),
    mode: z.literal('preparation_only'),
    channelPolicy: z.literal('quiet_strict'),
    allowedChannels: z.tuple([z.literal('private_preview')]),
    restrictedChannels: z.tuple([
      z.literal('social_discovery'),
      z.literal('social_write'),
      z.literal('outbound'),
      z.literal('public_publish'),
      z.literal('paid_media'),
    ]),
    sourcePolicy: z.literal('supplied_authorized_evidence_only'),
    researchWindow: z.strictObject({
      runStartedAt: z.iso.datetime(),
      since: z.iso.datetime(),
      coverage: z
        .array(
          z.strictObject({
            sourceRef: z.string().min(1),
            status: z.enum(['checked', 'failed', 'not_run']),
            detail: z.string().min(1),
          })
        )
        .min(1),
    }),
    sources: z
      .array(
        z.strictObject({
          url: z.url(),
          title: z.string().min(1),
          lane: z.enum(['evergreen', 'recent']),
          publishedAt: sourceDate,
          updatedAt: sourceDate,
          eventAt: sourceDate,
          discoveredAt: z.iso.datetime(),
          retrievedAt: z.iso.datetime(),
          claim: z.string().min(1),
          verifiedOutcome: z.string().min(1).nullable(),
        })
      )
      .min(1),
    /** Unknown economics and proposed metrics are allowed only in blocked drafts. */
    costStatus: z.literal('unmeasured'),
    metricStatus: z.literal('unbound'),
    evaluationStatus: z.literal('not_independently_evaluated'),
  })
  .superRefine((value, context) => {
    const end = Date.parse(value.researchWindow.runStartedAt);
    const start = end - 30 * 24 * 60 * 60 * 1000;
    if (Date.parse(value.researchWindow.since) !== start) {
      context.addIssue({
        code: 'custom',
        message:
          'research window must be run start minus 30 days through run start',
      });
    }
    for (const source of value.sources) {
      // A resurfaced old article and undated meaningful updates are not recent.
      // This draft contract admits recent original publication only; update-only
      // evidence needs the existing research owner's material-change review.
      const publication = source.publishedAt
        ? Date.parse(source.publishedAt)
        : NaN;
      if (
        source.lane === 'recent' &&
        !(publication >= start && publication <= end)
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'recent source requires original publication inside the rolling window',
        });
      }
      if (Date.parse(source.discoveredAt) > Date.parse(source.retrievedAt)) {
        context.addIssue({
          code: 'custom',
          message: 'source retrieval cannot precede discovery',
        });
      }
    }
  });

/**
 * The existing runtime has no growth adapter enforcing this contract. Do not
 * put these drafts into an invocable catalog, even when --register is used.
 * This also prevents empty tool lists from inheriting ambient runtime tools.
 */
export function assertPlaybookRegistrationAllowed(skill: {
  readonly id: string;
  readonly metadata: Record<string, string>;
}): void {
  if (
    skill.id.startsWith('growth-') ||
    skill.metadata.growthGovernance !== undefined
  ) {
    throw new Error(
      'growth preparation is not registrable: independent evaluation, measured cost, bound outcomes and runtime authority adapters are required'
    );
  }
}
