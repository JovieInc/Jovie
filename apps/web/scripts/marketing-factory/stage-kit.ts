/**
 * Factory stage kit (JOV-7276): the contract between stages and the harness
 * in run.ts, plus the shared producer selection, cross-family judging and
 * model-stage loop. Stages report artifacts, evaluators and invariants; they
 * never set `passed`.
 */

import { type CopyTier, modelFamily } from '@jovie/copy';
import type {
  FactoryStage,
  FactoryStageArtifact,
  StageReceipt,
} from '../../data/marketing/factory/spine';
import {
  type MarketingCreativeRole,
  selectMarketingModelWithReceipt,
} from '../../data/marketing/generation';
import type { FactoryPageBrief } from './brief';
import type { FactoryProviders, GeneratedStage } from './providers';

export type Evaluator = StageReceipt['evaluators'][number];

export interface StageContext {
  readonly pageId: string;
  readonly brief: FactoryPageBrief;
  readonly providers: FactoryProviders;
  /** Artifacts of stages that already passed, keyed by stage. */
  readonly artifacts: Partial<Record<FactoryStage, unknown>>;
  readonly receipts: Partial<Record<FactoryStage, StageReceipt>>;
  readonly attempt: number;
  readonly feedback: readonly string[];
  readonly runDir: string;
}

export interface StageResult {
  readonly artifact: unknown;
  readonly producer: StageReceipt['producer'];
  readonly evaluators: readonly Evaluator[];
  readonly invariantsPassed: readonly string[];
  readonly invariantsFailed: readonly string[];
  /** Instructions for the next attempt, beyond the failed invariant ids. */
  readonly feedback: readonly string[];
  readonly notes: Readonly<Record<string, unknown>>;
  /** Set when a model, render or media provider is unreachable. */
  readonly unavailable: string | null;
  /**
   * A rejection that retrying this stage cannot fix: the harness reruns
   * from `stage` with `findings` as its feedback, then re-renders and
   * re-judges, instead of retrying here on the same inputs.
   */
  readonly rework?: {
    readonly stage: FactoryStage;
    readonly findings: readonly string[];
  } | null;
}

export type StageRunner = (ctx: StageContext) => Promise<StageResult>;

export class Checks {
  readonly passed: string[] = [];
  readonly failed: string[] = [];
  readonly feedback: string[] = [];

  check(id: string, ok: boolean, message?: string): boolean {
    (ok ? this.passed : this.failed).push(id);
    if (!ok && message) this.feedback.push(`${id}: ${message}`);
    return ok;
  }
}

export function result(
  checks: Checks,
  artifact: unknown,
  extra: Partial<StageResult> = {}
): StageResult {
  return {
    artifact,
    producer: null,
    evaluators: [],
    invariantsPassed: checks.passed,
    invariantsFailed: checks.failed,
    feedback: checks.feedback,
    notes: {},
    unavailable: null,
    ...extra,
  };
}

export function artifactOf<S extends FactoryStage>(
  ctx: StageContext,
  stage: S
): FactoryStageArtifact<S> {
  return ctx.artifacts[stage] as FactoryStageArtifact<S>;
}

export function selectProducer(ctx: StageContext, role: MarketingCreativeRole) {
  const { candidate, receipt } = selectMarketingModelWithReceipt({ role });
  if (!candidate) return { model: null, producer: null, selection: receipt };
  const channel: NonNullable<StageReceipt['producer']>['channel'] =
    ctx.providers.mode === 'dry'
      ? 'harness'
      : candidate.channel === 'gateway' || candidate.channel === 'api'
        ? 'ai-gateway'
        : 'subscription-cli';
  return {
    model: candidate.id,
    producer: {
      modelId: ctx.providers.label(candidate.id),
      family: candidate.provider,
      channel,
    },
    selection: receipt,
  };
}

const MIN_JUDGES: Readonly<Record<CopyTier, number>> = {
  flagship: 2,
  standard: 1,
  volume: 0,
};

interface JudgeReply {
  readonly score?: number;
  readonly verdict?: string;
  readonly critique?: readonly string[];
  readonly unsupportedClaims?: readonly string[];
}

export async function judge(
  ctx: StageContext,
  input: {
    readonly rubric: string;
    readonly tier: CopyTier;
    readonly producerModel: string | undefined;
    readonly instruction: string;
    readonly subject: unknown;
  }
): Promise<{
  evaluators: Evaluator[];
  critique: string[];
  unsupportedClaims: string[];
  unavailable: string | null;
}> {
  const transport = ctx.providers.transport;
  const models = transport
    ? ctx.providers.selectJudges(
        input.tier,
        input.producerModel ?? '',
        transport.available
      )
    : [];
  if (!transport || models.length < MIN_JUDGES[input.tier]) {
    return {
      evaluators: [],
      critique: [],
      unsupportedClaims: [],
      unavailable: `${input.rubric} needs ${MIN_JUDGES[input.tier]} cross-family judge(s); seated ${models.length}`,
    };
  }
  const system = [
    `You are a strict ${input.rubric} reviewer for a marketing page. ${input.instruction}`,
    'Only the FACTS and CLAIMS supplied are true. Reply with JSON only:',
    '{"score":0-1,"verdict":"pass|revise|fail","critique":["..."],"unsupportedClaims":["..."]}',
  ].join('\n');
  const prompt = JSON.stringify(input.subject, null, 2);
  const replies = await Promise.all(
    models.map(async model => {
      try {
        const raw = await transport({ model, system, prompt });
        return {
          model,
          reply: JSON.parse(
            raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
          ) as JudgeReply,
        };
      } catch (error) {
        return {
          model,
          reply: { score: 0, verdict: 'fail', critique: [String(error)] },
        };
      }
    })
  );
  return {
    evaluators: replies.map(({ model, reply }) => ({
      id: ctx.providers.label(model),
      family: modelFamily(model),
      kind: 'llm' as const,
      verdict:
        reply.verdict === 'pass' || reply.verdict === 'revise'
          ? reply.verdict
          : 'fail',
      score: Math.min(1, Math.max(0, Number(reply.score) || 0)),
      rubricVersion: `factory-${input.rubric}/1`,
    })),
    critique: [
      ...new Set(replies.flatMap(({ reply }) => reply.critique ?? [])),
    ],
    unsupportedClaims: [
      ...new Set(replies.flatMap(({ reply }) => reply.unsupportedClaims ?? [])),
    ],
    unavailable: null,
  };
}

/** Shared shape for the strategist and copywriter stages. */
export async function modelStage(
  ctx: StageContext,
  stage: GeneratedStage,
  role: MarketingCreativeRole,
  task: string,
  context: unknown,
  evaluate: (
    value: Record<string, unknown>,
    checks: Checks,
    model: string
  ) => Promise<{
    artifact: unknown;
    evaluators?: Evaluator[];
    critique?: string[];
    unavailable?: string | null;
  }>
): Promise<StageResult> {
  const checks = new Checks();
  const { model, producer, selection } = selectProducer(ctx, role);
  if (!model) {
    return result(checks, null, {
      unavailable: `no healthy ${role} model`,
      notes: { selection },
    });
  }
  const generated = await ctx.providers.generate({
    stage,
    model,
    system: `You are the ${role} for a Jovie marketing page. ${task} Never invent metrics, quotes, testimonials or logos. No em dashes. Reply with JSON only.`,
    prompt: JSON.stringify(
      { context, previousFailures: ctx.feedback },
      null,
      2
    ),
    feedback: ctx.feedback,
    attempt: ctx.attempt,
  });
  if (generated.status !== 'ok') {
    return result(checks, null, {
      producer,
      unavailable: generated.reason,
      notes: { selection },
    });
  }
  const value =
    generated.value && typeof generated.value === 'object'
      ? (generated.value as Record<string, unknown>)
      : {};
  const evaluated = await evaluate(value, checks, model);
  return result(checks, evaluated.artifact, {
    producer,
    evaluators: evaluated.evaluators ?? [],
    feedback: [...checks.feedback, ...(evaluated.critique ?? [])],
    unavailable: evaluated.unavailable ?? null,
    notes: { selection },
  });
}

export function claimIdsOf(ctx: StageContext): Set<string> {
  return new Set(artifactOf(ctx, 'truth').claims.map(claim => claim.id));
}

export function sectionIdsOf(ctx: StageContext): Set<string> {
  return new Set(
    artifactOf(ctx, 'narrative').sections.map(
      section => section.sectionInstanceId
    )
  );
}

export function allIn(values: readonly string[], known: Set<string>): string[] {
  return values.filter(value => !known.has(value));
}
