import { z } from 'zod';
import { GOLDEN_JOURNEY_AUTH_STATES } from './routes';

export const GOLDEN_JOURNEY_JURY_VERDICTS = [
  'improvement',
  'neutral',
  'regression',
  'broken',
] as const;

export type GoldenJourneyJuryVerdict =
  (typeof GOLDEN_JOURNEY_JURY_VERDICTS)[number];

export const GoldenJourneyJuryFindingSchema = z
  .object({
    summary: z.string().trim().min(1).max(500),
    severity: z.enum(['low', 'medium', 'high']),
  })
  .strict();

export const GoldenJourneyJuryResultSchema = z
  .object({
    verdict: z.enum(GOLDEN_JOURNEY_JURY_VERDICTS),
    findings: z.array(GoldenJourneyJuryFindingSchema).max(10),
    reasoning: z.string().trim().min(1).max(2000),
  })
  .strict();

export type GoldenJourneyJuryResult = z.infer<
  typeof GoldenJourneyJuryResultSchema
>;

export const GoldenJourneyRouteResultSchema = z
  .object({
    routeId: z.string().trim().min(1),
    path: z.string().trim().min(1),
    authState: z.enum(GOLDEN_JOURNEY_AUTH_STATES),
    screenshot: z.string().trim().min(1),
    /** True when no baseline existed and this capture seeded it. */
    bootstrapped: z.boolean(),
    diff: z.union([
      z
        .object({
          rawDiffRatio: z.number().min(0).max(1),
          weightedDriftScore: z.number().min(0).max(1),
          flagged: z.boolean(),
        })
        .strict(),
      z.null(),
    ]),
    jury: z.union([
      z
        .object({
          model: z.string().trim().min(1),
          result: GoldenJourneyJuryResultSchema,
        })
        .strict(),
      z
        .object({
          skipped: z.literal(true),
          reason: z.string().trim().min(1),
        })
        .strict(),
      z.null(),
    ]),
  })
  .strict();

export type GoldenJourneyRouteResult = z.infer<
  typeof GoldenJourneyRouteResultSchema
>;

export const GoldenJourneyIssueFilingSchema = z
  .object({
    routeId: z.string().trim().min(1),
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1),
  })
  .strict();

export type GoldenJourneyIssueFiling = z.infer<
  typeof GoldenJourneyIssueFilingSchema
>;

export const GoldenJourneySweepManifestSchema = z
  .object({
    runId: z.string().trim().min(1).max(80),
    gitSha: z.union([z.string().trim().min(1).max(64), z.null()]),
    computedAt: z.string().datetime(),
    routes: z.array(GoldenJourneyRouteResultSchema),
    issueFilings: z.array(GoldenJourneyIssueFilingSchema),
    summary: z
      .object({
        routesTotal: z.number().int().min(0),
        routesFlagged: z.number().int().min(0),
        routesBootstrapped: z.number().int().min(0),
        routesMissingCapture: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();

export type GoldenJourneySweepManifest = z.infer<
  typeof GoldenJourneySweepManifestSchema
>;
