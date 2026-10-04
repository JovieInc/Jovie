/**
 * Factory receipt store and verifier (JOV-7276).
 *
 * A run writes runs/factory/<pageId>/: brief.json, one file per stage
 * attempt (receipt + artifact + the feedback it was given) and run.json,
 * the chain of passing attempts. Each stage's input digest binds the brief
 * and every earlier stage's output digest, so editing any artifact or brief
 * breaks every later link. `verifyFactoryRun` re-derives all of it.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  FACTORY_CERTIFIER_HARNESS,
  FACTORY_STAGE_ARTIFACT_SCHEMAS,
  FACTORY_STAGES,
  type FactoryStage,
  type StageReceipt,
  validateStageReceipt,
} from '../../data/marketing/factory/spine';

export const FACTORY_RUN_SCHEMA = 'jovie.factory-run/v1' as const;

export const FACTORY_RUNS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../runs/factory'
);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)])
    );
  }
  return value;
}

/** sha256 over key-sorted JSON, in the spine's `sha256:<hex>` form. */
export function digestOf(value: unknown): string {
  const json = JSON.stringify(canonical(value)) ?? 'undefined';
  return `sha256:${createHash('sha256').update(json).digest('hex')}`;
}

export function stageInputDigest(
  briefDigest: string,
  priorOutputDigests: readonly string[]
): string {
  return digestOf({ brief: briefDigest, prior: priorOutputDigests });
}

export interface StageAttemptRecord {
  readonly receipt: StageReceipt;
  readonly artifact: unknown;
  readonly feedbackIn: readonly string[];
  readonly notes: Readonly<Record<string, unknown>>;
  readonly unavailable: string | null;
}

/** `incomplete` = a stage has no registered runner yet. */
const RUN_STATUSES = [
  'complete',
  'failed',
  'credentials-unavailable',
  'incomplete',
  'budget-blocked',
] as const;

export const FactoryRunManifestSchema = z.object({
  schema: z.literal(FACTORY_RUN_SCHEMA),
  pageId: z.string().min(1),
  family: z.string().min(1),
  slug: z.string().min(1),
  mode: z.enum(['dry', 'live']),
  briefDigest: z.string().min(1),
  status: z.enum(RUN_STATUSES),
  stoppedAt: z.enum(FACTORY_STAGES).nullable(),
  reason: z.string().nullable(),
  chain: z.array(
    z.object({
      stage: z.enum(FACTORY_STAGES),
      attempt: z.number().int().min(1),
      file: z.string().min(1),
      outputDigest: z.string().min(1),
    })
  ),
  attempts: z.array(z.string().min(1)),
  /** Each rejection routed back to its owning stage, oldest first. */
  reworks: z
    .array(
      z.object({
        iteration: z.number().int().min(1),
        rejectedAt: z.enum(FACTORY_STAGES),
        reworkFrom: z.enum(FACTORY_STAGES),
        /** The render output the rejection judged; a rework must replace it. */
        rejectedRenderDigest: z.string().min(1).nullable(),
        findings: z.array(z.string()),
      })
    )
    .optional(),
  paidBudget: z
    .object({
      id: z.string().min(1),
      policyDigest: z.string().min(1),
      ledgerPath: z.string().min(1),
    })
    .optional(),
  /** Set when the preflight refused the run before any stage ran. */
  preflight: z
    .array(
      z.object({
        stage: z.enum(FACTORY_STAGES),
        code: z.enum(['no-runner', 'credentials-unavailable']),
        reason: z.string().min(1),
      })
    )
    .optional(),
});

export type FactoryRunManifest = z.infer<typeof FactoryRunManifestSchema>;

export function attemptFileName(
  stage: FactoryStage,
  attempt: number,
  rework = 0
): string {
  const index = String(FACTORY_STAGES.indexOf(stage) + 1).padStart(2, '0');
  const pass = rework > 0 ? `.rework-${rework}` : '';
  return `${index}-${stage}${pass}.attempt-${attempt}.json`;
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function verifyLink(
  runDir: string,
  manifest: FactoryRunManifest,
  index: number
): string[] {
  const entry = manifest.chain[index];
  if (!entry) return [];
  const where = `${entry.stage}#${entry.attempt}`;
  const path = join(runDir, entry.file);
  if (!existsSync(path)) return [`${where}: missing ${entry.file}`];
  const record = readJson<StageAttemptRecord>(path);
  const issues = validateStageReceipt(record.receipt).map(
    issue => `${where}: ${issue}`
  );
  const receipt = record.receipt;
  if (!receipt || typeof receipt !== 'object') return issues;

  if (
    receipt.stage !== FACTORY_STAGES[index] ||
    entry.stage !== receipt.stage
  ) {
    issues.push(`${where}: out of spine order`);
  }
  if (receipt.pageId !== manifest.pageId) {
    issues.push(`${where}: pageId ${receipt.pageId} is not ${manifest.pageId}`);
  }
  if (receipt.attempt !== entry.attempt) {
    issues.push(`${where}: receipt attempt ${receipt.attempt} disagrees`);
  }
  if (!receipt.passed || receipt.certifier !== FACTORY_CERTIFIER_HARNESS) {
    issues.push(`${where}: chain link is not a harness-passed receipt`);
  }
  const schema = FACTORY_STAGE_ARTIFACT_SCHEMAS[entry.stage];
  if (!schema.safeParse(record.artifact).success) {
    issues.push(`${where}: artifact fails the ${entry.stage} schema`);
  }
  const outputDigest = digestOf(record.artifact);
  if (receipt.outputDigest !== outputDigest) {
    issues.push(`${where}: artifact digest does not match the receipt`);
  }
  if (entry.outputDigest !== receipt.outputDigest) {
    issues.push(`${where}: run.json digest does not match the receipt`);
  }
  const prior = manifest.chain.slice(0, index).map(link => link.outputDigest);
  if (receipt.inputDigest !== stageInputDigest(manifest.briefDigest, prior)) {
    issues.push(`${where}: input digest does not bind the prior chain`);
  }
  if (
    entry.stage === 'publish' &&
    (record.artifact as { rampState?: string }).rampState !== 'shadow'
  ) {
    issues.push(`${where}: publish must stay in shadow`);
  }
  return issues;
}

/** Re-checks every receipt digest and rule in a run directory. Empty = valid. */
export function verifyFactoryRun(runDir: string): string[] {
  const manifestPath = join(runDir, 'run.json');
  if (!existsSync(manifestPath)) return [`no run.json in ${runDir}`];
  const parsed = FactoryRunManifestSchema.safeParse(readJson(manifestPath));
  if (!parsed.success) {
    return parsed.error.issues.map(
      issue => `run.json ${issue.path.join('.')}: ${issue.message}`
    );
  }
  const manifest = parsed.data;
  const issues: string[] = [];
  const briefPath = join(runDir, 'brief.json');
  if (!existsSync(briefPath)) {
    issues.push('missing brief.json');
  } else if (digestOf(readJson(briefPath)) !== manifest.briefDigest) {
    issues.push('brief.json digest does not match run.json');
  }
  if (
    manifest.status === 'complete' &&
    manifest.chain.length !== FACTORY_STAGES.length
  ) {
    issues.push(
      `complete run has ${manifest.chain.length}/${FACTORY_STAGES.length} stages`
    );
  }
  for (let index = 0; index < manifest.chain.length; index++) {
    issues.push(...verifyLink(runDir, manifest, index));
  }
  return issues;
}
