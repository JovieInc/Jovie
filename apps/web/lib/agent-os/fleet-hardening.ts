import { z } from 'zod';
import { computeRatePercent } from '@/lib/analytics/metrics';

export const FLEET_INVOCATION_SCHEMA = 'jovie.fleet-invocation/v1' as const;

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasUnredactedSecret(argv: readonly string[]): boolean {
  const secretFlag = /^--?(?:api[-_]?key|password|secret|token)$/i;
  return argv.some(
    (arg, index) =>
      /^(?:bearer\s+\S+|jwf\.|sk-[a-z0-9_-]{16,})/i.test(arg) ||
      (/^--?(?:api[-_]?key|password|secret|token)=/i.test(arg) &&
        !arg.endsWith('=[redacted]')) ||
      (secretFlag.test(arg) && argv[index + 1] !== '[redacted]')
  );
}

const text = z.string().trim().min(1);
const repairSchema = z
  .object({
    linearIssueId: text,
    detectedAt: z.iso.datetime(),
    repairedAt: z.iso.datetime().nullable(),
    recertifiedAt: z.iso.datetime().nullable(),
    regressionTestRef: text.nullable(),
  })
  .strict()
  .superRefine((repair, context) => {
    if (
      repair.recertifiedAt !== null &&
      (repair.repairedAt === null || repair.regressionTestRef === null)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'recertification requires repair and permanent regression proof',
      });
    }
  });

const invocationSchema = z
  .object({
    schema: z.literal(FLEET_INVOCATION_SCHEMA),
    caller: z
      .object({ id: text, model: text, runtime: text, host: text })
      .strict(),
    capability: z
      .object({ id: text, version: text, revision: text.nullable() })
      .strict(),
    command: z
      .object({
        surface: text,
        redactedArgv: z
          .array(text)
          .min(1)
          .refine(
            argv => !hasUnredactedSecret(argv),
            'command contains an unredacted secret'
          ),
      })
      .strict(),
    intendedTask: text,
    expectedResult: text,
    actualResult: text,
    executionStatus: z.enum(['completed', 'failed', 'timed_out', 'canceled']),
    exitCode: z.number().int().nullable(),
    attempt: z.number().int().positive(),
    latencyMs: z.number().nonnegative(),
    workaroundUsed: z.boolean(),
    bypassUsed: z.boolean(),
    canonicalComparison: z
      .object({
        status: z.enum(['matched', 'mismatched', 'not_applicable']),
        sourceRef: z.string().nullable(),
        discrepancy: z.string().nullable(),
      })
      .strict(),
    defectFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    repair: repairSchema.nullable(),
  })
  .strict();

export type FleetInvocationEvidence = Readonly<
  z.infer<typeof invocationSchema>
>;
export type FleetInvocationInput = Readonly<
  Omit<FleetInvocationEvidence, 'schema' | 'latencyMs'>
>;

export function validateFleetInvocation(value: unknown): string[] {
  const result = invocationSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map(issue => issue.message);
}

export function buildFleetInvocation(
  input: FleetInvocationInput,
  startedAt: string,
  completedAt: string
): FleetInvocationEvidence {
  const evidence: FleetInvocationEvidence = {
    ...input,
    latencyMs: Date.parse(completedAt) - Date.parse(startedAt),
    schema: FLEET_INVOCATION_SCHEMA,
  };
  const errors = validateFleetInvocation(evidence);
  if (errors.length > 0) {
    throw new Error(`invalid fleet invocation: ${errors.join('; ')}`);
  }
  return evidence;
}

export interface FleetRateMetric {
  readonly value: number | null;
  readonly sampleSize: number;
}

export interface FleetHardeningMetrics {
  readonly totalInvocations: number;
  readonly successRate: FleetRateMetric;
  readonly firstAttemptSuccessRate: FleetRateMetric;
  readonly workaroundBypassRate: FleetRateMetric;
  readonly retryRate: FleetRateMetric;
  readonly defectRatePer100: FleetRateMetric;
  readonly latencyMs: {
    readonly p50: number | null;
    readonly p95: number | null;
    readonly sampleSize: number;
  };
  readonly meanDefectToRecertificationMs: FleetRateMetric;
  readonly regressionsPromoted: number;
  readonly coverage: Readonly<
    Record<
      'callers' | 'models' | 'runtimes' | 'hosts' | 'commandSurfaces',
      Readonly<Record<string, number>>
    >
  >;
}

interface HardeningReceipt {
  readonly outcome: 'passed' | 'failed' | 'blocked';
  readonly invocation?: FleetInvocationEvidence | null;
}

function rate(count: number, total: number): FleetRateMetric {
  return { value: total === 0 ? null : count / total, sampleSize: total };
}

function coverage(
  invocations: readonly FleetInvocationEvidence[],
  select: (invocation: FleetInvocationEvidence) => string
): Readonly<Record<string, number>> {
  const counts = new Map<string, number>();
  for (const invocation of invocations) {
    const key = select(invocation);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b)));
}

function percentile(sorted: readonly number[], value: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.ceil((value / 100) * sorted.length) - 1] ?? null;
}

export function computeFleetHardeningMetrics(
  receipts: readonly HardeningReceipt[]
): FleetHardeningMetrics {
  const commandReceipts = receipts.filter(
    (
      receipt
    ): receipt is HardeningReceipt & { invocation: FleetInvocationEvidence } =>
      receipt.invocation != null
  );
  const invocations = commandReceipts.map(receipt => receipt.invocation);
  const total = invocations.length;
  const latencies = invocations
    .map(item => item.latencyMs)
    .sort((a, b) => a - b);
  const repaired = invocations.filter(
    item => item.repair?.recertifiedAt != null
  );
  const recertificationTimes = repaired.map(
    item =>
      Date.parse(item.repair?.recertifiedAt ?? '') -
      Date.parse(item.repair?.detectedAt ?? '')
  );
  const regressionTests = new Set(
    repaired.map(item => item.repair?.regressionTestRef).filter(nonEmpty)
  );
  return {
    totalInvocations: total,
    successRate: rate(
      commandReceipts.filter(receipt => receipt.outcome === 'passed').length,
      total
    ),
    firstAttemptSuccessRate: rate(
      commandReceipts.filter(
        receipt =>
          receipt.outcome === 'passed' && receipt.invocation.attempt === 1
      ).length,
      total
    ),
    workaroundBypassRate: rate(
      invocations.filter(item => item.workaroundUsed || item.bypassUsed).length,
      total
    ),
    retryRate: rate(invocations.filter(item => item.attempt > 1).length, total),
    defectRatePer100: {
      value:
        total === 0
          ? null
          : computeRatePercent(
              invocations.filter(item => item.defectFingerprint !== null)
                .length,
              total
            ),
      sampleSize: total,
    },
    latencyMs: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      sampleSize: total,
    },
    meanDefectToRecertificationMs: {
      value:
        recertificationTimes.length === 0
          ? null
          : recertificationTimes.reduce((sum, value) => sum + value, 0) /
            recertificationTimes.length,
      sampleSize: recertificationTimes.length,
    },
    regressionsPromoted: regressionTests.size,
    coverage: {
      callers: coverage(invocations, item => item.caller.id),
      models: coverage(invocations, item => item.caller.model),
      runtimes: coverage(invocations, item => item.caller.runtime),
      hosts: coverage(invocations, item => item.caller.host),
      commandSurfaces: coverage(invocations, item => item.command.surface),
    },
  };
}
