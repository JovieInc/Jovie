/**
 * `pnpm factory:run --family <f> --slug <s> [--dry] [--from-stage <stage>]`
 * (JOV-7276, epic JOV-7244).
 *
 * Runs FACTORY_STAGES in order for one page. Each stage gets up to
 * FACTORY_STAGE_MAX_ATTEMPTS attempts; every retry receives the previous
 * attempt's failed invariants and judge critique. Only this harness sets
 * `passed`, through applyStagePassedBit. An unreachable model, render or
 * media provider stops the run as `credentials-unavailable`, never a pass.
 * Receipts land in runs/factory/<pageId>/ (gitignored); publish is always
 * `shadow` until the ramp ships.
 */

import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { routedTransport } from '@jovie/copy/transport';
import {
  applyStagePassedBit,
  FACTORY_CERTIFIER_HARNESS,
  FACTORY_RECEIPT_SCHEMA,
  FACTORY_STAGE_ARTIFACT_SCHEMAS,
  FACTORY_STAGE_MAX_ATTEMPTS,
  FACTORY_STAGES,
  type FactoryStage,
  type StageReceipt,
} from '../../data/marketing/factory/spine';
import {
  type FactoryPageBrief,
  factoryPageId,
  loadFactoryBrief,
} from './brief';
import {
  type FactoryPaidBudgetConfig,
  FactoryPaidBudgetConfigSchema,
  openFactoryPaidBudget,
} from './budget';
import { preflightFactoryRun } from './preflight';
import {
  dryProviders,
  type FactoryProviders,
  liveProviders,
} from './providers';
import {
  attemptFileName,
  digestOf,
  FACTORY_RUN_SCHEMA,
  FACTORY_RUNS_DIR,
  type FactoryRunManifest,
  FactoryRunManifestSchema,
  factoryStageSourceDigest,
  readJson,
  type StageAttemptRecord,
  stageInputDigest,
  verifyFactoryRun,
  writeJson,
} from './receipts';
import type { StageContext, StageResult, StageRunner } from './stage-kit';
import { FACTORY_STAGE_RUNNERS } from './stages';

const MODEL_JUDGED = new Set(['llm', 'vision']);

export interface RunFactoryOptions {
  readonly family: string;
  readonly slug: string;
  readonly dry?: boolean;
  readonly fromStage?: FactoryStage;
  readonly brief?: FactoryPageBrief;
  readonly providers?: FactoryProviders;
  readonly runsDir?: string;
  /** Explicit reviewed allowance for one canary; credentials alone enable no paid calls. */
  readonly paidBudget?: FactoryPaidBudgetConfig;
  /** Stage runners; defaults to FACTORY_STAGE_RUNNERS. Missing = incomplete. */
  readonly runners?: Partial<Record<FactoryStage, StageRunner>>;
  /** Development only: skip the preflight and stop at the first gap instead. */
  readonly allowPartial?: boolean;
}

async function runStage(
  runner: StageRunner,
  ctx: StageContext
): Promise<StageResult> {
  try {
    return await runner(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      artifact: null,
      producer: null,
      evaluators: [],
      invariantsPassed: [],
      invariantsFailed: ['stage-error'],
      feedback: [`stage-error: ${message}`],
      notes: {},
      unavailable: null,
    };
  }
}

/** Harness-owned invariants every stage gets on top of its own. */
function harnessInvariants(stage: FactoryStage, result: StageResult) {
  const failed: string[] = [];
  const feedback: string[] = [];
  if (result.unavailable) {
    return {
      failed: ['credentials-unavailable'],
      feedback: [result.unavailable],
    };
  }
  const parsed = FACTORY_STAGE_ARTIFACT_SCHEMAS[stage].safeParse(
    result.artifact
  );
  if (!parsed.success) {
    failed.push('artifact-schema');
    feedback.push(
      ...parsed.error.issues.map(
        issue => `artifact-schema ${issue.path.join('.')}: ${issue.message}`
      )
    );
  }
  const producerFamily = result.producer?.family;
  const selfReview = result.evaluators.filter(
    evaluator =>
      MODEL_JUDGED.has(evaluator.kind) && evaluator.family === producerFamily
  );
  if (selfReview.length > 0) {
    failed.push('cross-family-evaluator');
    feedback.push(
      `cross-family-evaluator: ${selfReview.map(e => e.id).join(', ')} share the producer's family`
    );
  }
  return { failed, feedback };
}

function loadPriorChain(
  runDir: string,
  briefDigest: string,
  fromStage: FactoryStage
) {
  const manifest = FactoryRunManifestSchema.parse(
    readJson(join(runDir, 'run.json'))
  );
  if (manifest.briefDigest !== briefDigest) {
    throw new Error(
      '--from-stage: the brief changed since the last run; rerun from truth'
    );
  }
  const fromIndex = FACTORY_STAGES.indexOf(fromStage);
  const chain = manifest.chain.slice(0, fromIndex);
  if (chain.length !== fromIndex) {
    throw new Error(
      `--from-stage ${fromStage}: earlier stages have not passed`
    );
  }
  if (chain.some((link, index) => link.stage !== FACTORY_STAGES[index])) {
    throw new Error(
      '--from-stage: prior stage identities do not match the current spine order; rerun from truth'
    );
  }
  const issues = verifyFactoryRun(runDir).filter(issue =>
    chain.some(link => issue.startsWith(`${link.stage}#`))
  );
  if (issues.length > 0) {
    throw new Error(
      `--from-stage: prior receipts fail verify: ${issues.join('; ')}`
    );
  }
  return { manifest: { ...manifest, chain }, chain };
}

export async function runFactory(
  options: RunFactoryOptions
): Promise<FactoryRunManifest> {
  const brief = options.brief ?? loadFactoryBrief(options.family, options.slug);
  const pageId = factoryPageId(brief.family, brief.slug);
  const runsDir = options.runsDir ?? FACTORY_RUNS_DIR;
  const runDir = join(runsDir, pageId);
  const briefDigest = digestOf(brief);
  if (options.paidBudget && (options.dry || options.providers)) {
    throw new Error('paid budget requires the standard live factory providers');
  }
  const priorBudget = existsSync(join(runDir, 'run.json'))
    ? FactoryRunManifestSchema.parse(readJson(join(runDir, 'run.json')))
        .paidBudget
    : undefined;
  if (
    options.fromStage &&
    options.fromStage !== 'truth' &&
    priorBudget?.id !== options.paidBudget?.id
  ) {
    throw new Error('--from-stage: paid budget binding changed');
  }
  const paidBudget = options.paidBudget
    ? openFactoryPaidBudget({
        runsDir,
        config: options.paidBudget,
        binding: { pageId, briefDigest },
        requireExisting:
          priorBudget?.id === options.paidBudget.id ||
          Boolean(options.fromStage && options.fromStage !== 'truth'),
      })
    : undefined;
  const providers =
    options.providers ??
    (options.dry
      ? dryProviders(brief)
      : liveProviders(
          routedTransport(
            paidBudget ? process.env.AI_GATEWAY_API_KEY : undefined,
            paidBudget?.policy
          )
        ));
  const runners = options.runners ?? FACTORY_STAGE_RUNNERS;

  const artifacts: Partial<Record<FactoryStage, unknown>> = {};
  const receipts: Partial<Record<FactoryStage, StageReceipt>> = {};
  let manifest: FactoryRunManifest = {
    schema: FACTORY_RUN_SCHEMA,
    pageId,
    family: brief.family,
    slug: brief.slug,
    mode: providers.mode,
    briefDigest,
    status: 'failed',
    stoppedAt: null,
    reason: null,
    chain: [],
    attempts: [],
    ...(paidBudget ? { paidBudget: paidBudget.reference } : {}),
  };

  if (paidBudget?.snapshot().stages.includes(options.fromStage ?? 'truth')) {
    // Refuse before deleting or overwriting earlier receipts on a fresh run.
    return {
      ...manifest,
      status: 'budget-blocked',
      stoppedAt: options.fromStage ?? 'truth',
      reason: 'paid budget: cumulative stage attempt ceiling exceeded',
    };
  }

  if (!options.allowPartial) {
    const issues = preflightFactoryRun({
      brief,
      providers,
      runners,
      fromStage: options.fromStage ?? 'truth',
    });
    const [first] = issues;
    // Refuse before any model call, and leave any earlier run untouched.
    if (first) {
      return {
        ...manifest,
        status: issues.some(i => i.code === 'credentials-unavailable')
          ? 'credentials-unavailable'
          : 'incomplete',
        stoppedAt: first.stage,
        reason: `preflight: ${issues.map(i => `${i.stage}: ${i.reason}`).join('; ')}`,
        preflight: issues,
      };
    }
  }

  if (options.fromStage && options.fromStage !== 'truth') {
    const prior = loadPriorChain(runDir, briefDigest, options.fromStage);
    manifest = {
      ...prior.manifest,
      mode: providers.mode,
      ...(paidBudget ? { paidBudget: paidBudget.reference } : {}),
    };
    for (const link of prior.chain) {
      const record = readJson<StageAttemptRecord>(join(runDir, link.file));
      artifacts[link.stage] = record.artifact;
      receipts[link.stage] = record.receipt;
    }
  } else {
    rmSync(runDir, { recursive: true, force: true });
  }
  writeJson(join(runDir, 'brief.json'), brief);

  const finish = (patch: Partial<FactoryRunManifest>) => {
    manifest = { ...manifest, ...patch };
    writeJson(join(runDir, 'run.json'), manifest);
    return manifest;
  };

  for (const stage of FACTORY_STAGES.slice(manifest.chain.length)) {
    const runner = runners[stage];
    if (!runner) {
      return finish({
        status: 'incomplete',
        stoppedAt: stage,
        reason: `no runner registered for ${stage}`,
      });
    }
    const inputDigest = stageInputDigest(
      briefDigest,
      manifest.chain.map(link => link.outputDigest),
      factoryStageSourceDigest(stage, brief)
    );
    let feedback: readonly string[] = [];
    let passed = false;
    const maxAttempts = paidBudget ? 1 : FACTORY_STAGE_MAX_ATTEMPTS;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        paidBudget?.beginStage(stage);
      } catch (error) {
        return finish({
          status: 'budget-blocked',
          stoppedAt: stage,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
      const result = await runStage(runner, {
        pageId,
        brief,
        providers,
        artifacts,
        receipts,
        attempt,
        feedback,
        runDir,
      });
      const harness = harnessInvariants(stage, result);
      const receipt = applyStagePassedBit(
        {
          schema: FACTORY_RECEIPT_SCHEMA,
          pageId,
          stage,
          attempt,
          inputDigest,
          outputDigest: digestOf(result.artifact),
          producer: result.producer,
          evaluators: [...result.evaluators],
          invariantsPassed: [...result.invariantsPassed],
          invariantsFailed: [...result.invariantsFailed, ...harness.failed],
          at: providers.now().toISOString(),
        },
        { certifier: FACTORY_CERTIFIER_HARNESS }
      );
      const file = attemptFileName(stage, attempt);
      const record: StageAttemptRecord = {
        receipt,
        artifact: result.artifact,
        feedbackIn: feedback,
        notes: result.notes,
        unavailable: result.unavailable,
      };
      writeJson(join(runDir, file), record);
      manifest = { ...manifest, attempts: [...manifest.attempts, file] };

      if (paidBudget?.blockedReason) {
        return finish({
          status: 'budget-blocked',
          stoppedAt: stage,
          reason: paidBudget.blockedReason,
        });
      }
      if (result.unavailable) {
        return finish({
          status: 'credentials-unavailable',
          stoppedAt: stage,
          reason: result.unavailable,
        });
      }
      if (receipt.passed) {
        artifacts[stage] = result.artifact;
        receipts[stage] = receipt;
        manifest = {
          ...manifest,
          chain: [
            ...manifest.chain,
            { stage, attempt, file, outputDigest: receipt.outputDigest },
          ],
        };
        if (result.notes.record) {
          writeJson(join(runDir, 'page-record.json'), result.notes.record);
        }
        finish({});
        passed = true;
        break;
      }
      feedback = [
        ...receipt.invariantsFailed,
        ...harness.feedback,
        ...result.feedback,
        ...(receipt.evaluators.some(e => e.verdict !== 'pass')
          ? ['judges: at least one evaluator did not pass']
          : []),
      ];
    }
    if (!passed) {
      return finish({
        status: 'failed',
        stoppedAt: stage,
        reason: `failed ${maxAttempts} attempts: ${feedback.join('; ')}`,
      });
    }
  }
  return finish({ status: 'complete', stoppedAt: null, reason: null });
}

const EXIT_CODES: Readonly<Record<FactoryRunManifest['status'], number>> = {
  complete: 0,
  failed: 1,
  'credentials-unavailable': 3,
  incomplete: 4,
  'budget-blocked': 5,
};

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      family: { type: 'string' },
      slug: { type: 'string' },
      dry: { type: 'boolean', default: false },
      'from-stage': { type: 'string' },
      'allow-partial': { type: 'boolean', default: false },
      'paid-budget': { type: 'string' },
    },
  });
  const fromStage = values['from-stage'];
  if (!values.family || !values.slug) {
    throw new Error(
      'usage: factory:run --family <f> --slug <s> [--dry] [--from-stage <stage>] [--allow-partial] [--paid-budget <reviewed-json>]'
    );
  }
  if (fromStage && !(FACTORY_STAGES as readonly string[]).includes(fromStage)) {
    throw new Error(`--from-stage must be one of ${FACTORY_STAGES.join(', ')}`);
  }
  const manifest = await runFactory({
    family: values.family,
    slug: values.slug,
    dry: values.dry,
    fromStage: fromStage as FactoryStage | undefined,
    allowPartial: values['allow-partial'],
    paidBudget: values['paid-budget']
      ? FactoryPaidBudgetConfigSchema.parse(readJson(values['paid-budget']))
      : undefined,
  });
  console.log(
    `factory:run ${manifest.pageId} [${manifest.mode}] ${manifest.status}: ${manifest.chain.length}/${FACTORY_STAGES.length} stages passed`
  );
  if (manifest.preflight) {
    console.log('  preflight refused the run; no model was called:');
    for (const issue of manifest.preflight) {
      console.log(`  - ${issue.stage} [${issue.code}]: ${issue.reason}`);
    }
  } else if (manifest.reason) {
    console.log(`  ${manifest.stoppedAt}: ${manifest.reason}`);
  }
  console.log(`  receipts: ${join(FACTORY_RUNS_DIR, manifest.pageId)}`);
  process.exitCode = EXIT_CODES[manifest.status];
}

if (process.argv[1] === import.meta.filename) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
