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
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
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
import { listProductTruthClaims } from '../../data/product-truth/claims';
import { PROOF_REGISTRY, type ProofItem } from '../../data/product-truth/proof';
import {
  type Capability,
  type Claim,
  listCapabilities,
} from '../../data/product-truth/registry';
import {
  buildTruthDigest,
  hashProof,
} from '../../data/product-truth/truth-sync';
import type { FactoryPageBrief } from './brief';
import { verifyRenderBytes } from './capture-integrity';

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
  priorOutputDigests: readonly string[],
  sourceDigest?: string | null
): string {
  const input = { brief: briefDigest, prior: priorOutputDigests };
  return digestOf(sourceDigest ? { ...input, source: sourceDigest } : input);
}

export interface FactoryTruthSources {
  readonly claims?: readonly Claim[];
  readonly capabilities?: readonly Capability[];
  readonly proofs?: readonly ProofItem[];
}

/**
 * Source records owned directly by a factory stage. These snapshots are scoped
 * to the page brief so a change for one capability does not invalidate other
 * page runs.
 */
export function factoryStageSourceDigest(
  stage: FactoryStage,
  brief: Pick<FactoryPageBrief, 'claimIds' | 'proof' | 'asOf'>,
  source: FactoryTruthSources = {}
): string | null {
  const claims = source.claims ?? listProductTruthClaims();
  const capabilities = source.capabilities ?? listCapabilities();
  const proofs = source.proofs ?? PROOF_REGISTRY;

  if (stage === 'truth') {
    const claimIds = new Set(brief.claimIds);
    const relevantClaims = claims.filter(claim => claimIds.has(claim.id));
    const capabilityIds = new Set(
      relevantClaims.map(claim => claim.capabilityId)
    );
    const relevantCapabilities = capabilities.filter(capability =>
      capabilityIds.has(capability.id)
    );
    return digestOf({
      requestedClaimIds: [...claimIds].sort(),
      truth: buildTruthDigest(relevantClaims, relevantCapabilities, []),
    });
  }

  if (stage === 'proof') {
    const claimIds = new Set(brief.proof.map(need => need.claimId));
    const capabilityByClaim = new Map(
      claims.map(claim => [claim.id, claim.capabilityId])
    );
    const evidence = proofs
      .filter(proof => claimIds.has(proof.claimId))
      .map(proof => ({
        id: proof.id,
        claimId: proof.claimId,
        capabilityId: capabilityByClaim.get(proof.claimId) ?? null,
        digest: hashProof(proof),
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
    return digestOf({
      asOf: brief.asOf,
      requestedClaimIds: [...claimIds].sort(),
      evidence,
    });
  }

  return null;
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
        /** What started the rework; absent on runs before JOV-7750. */
        trigger: z.enum(['visual-rejection', 'proof-landed']).optional(),
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

export function writeImmutableJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

export function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function verifyLink(
  runDir: string,
  manifest: FactoryRunManifest,
  index: number,
  brief: FactoryPageBrief | null,
  source: FactoryTruthSources
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
  const sourceDigest = brief
    ? factoryStageSourceDigest(entry.stage, brief, source)
    : null;
  // Archived evidence has no historical registry snapshot. Recheck its
  // structural/output bindings without judging old truth against today's sources.
  if (
    brief &&
    receipt.inputDigest !==
      stageInputDigest(manifest.briefDigest, prior, sourceDigest)
  ) {
    issues.push(`${where}: input digest does not bind current stage inputs`);
  }
  if (
    entry.stage === 'publish' &&
    (record.artifact as { rampState?: string }).rampState !== 'shadow'
  ) {
    issues.push(`${where}: publish must stay in shadow`);
  }
  return issues;
}

function verifyRetainedAttempts(
  runDir: string,
  manifest: FactoryRunManifest
): string[] {
  const issues: string[] = [];
  // Rejected and superseded attempts remain evidence, not just the final chain.
  for (const file of new Set([
    ...manifest.attempts,
    ...manifest.chain.map(link => link.file),
  ])) {
    const path = join(runDir, file);
    try {
      const record = readJson<StageAttemptRecord>(path);
      const where = `${record.receipt.stage}#${record.receipt.attempt} (${file})`;
      if (record.receipt.outputDigest !== digestOf(record.artifact)) {
        issues.push(
          `${where}: retained artifact digest does not match the receipt`
        );
      }
      const retainedRender =
        record.receipt.stage === 'render' ||
        manifest.chain.some(
          link => link.file === file && link.stage === 'render'
        );
      if (retainedRender && record.artifact !== null) {
        const parsed = FACTORY_STAGE_ARTIFACT_SCHEMAS.render.safeParse(
          record.artifact
        );
        if (parsed.success) {
          issues.push(
            ...verifyRenderBytes(parsed.data, manifest.mode).map(
              issue => `${where}: ${issue}`
            )
          );
        } else {
          issues.push(
            `${where}: retained render artifact fails the render schema`
          );
        }
      }
    } catch {
      issues.push(`retained attempt missing or unreadable: ${file}`);
    }
  }
  return issues;
}

/** Re-checks every receipt digest and rule in a run directory. Empty = valid. */
export function verifyFactoryRun(
  runDir: string,
  source: FactoryTruthSources = {}
): string[] {
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
  let brief: FactoryPageBrief | null = null;
  if (!existsSync(briefPath)) {
    issues.push('missing brief.json');
  } else {
    const savedBrief = readJson<FactoryPageBrief>(briefPath);
    brief = savedBrief;
    if (digestOf(savedBrief) !== manifest.briefDigest) {
      issues.push('brief.json digest does not match run.json');
    }
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
    issues.push(...verifyLink(runDir, manifest, index, brief, source));
  }
  issues.push(...verifyRetainedAttempts(runDir, manifest));
  const history = join(runDir, 'history');
  if (existsSync(history)) {
    for (const prior of readdirSync(history, { withFileTypes: true })) {
      if (prior.isDirectory()) {
        const priorDir = join(history, prior.name);
        try {
          const saved = FactoryRunManifestSchema.parse(
            readJson(join(priorDir, 'run.json'))
          );
          const retained: string[] = [];
          for (let index = 0; index < saved.chain.length; index++) {
            retained.push(...verifyLink(priorDir, saved, index, null, {}));
          }
          retained.push(...verifyRetainedAttempts(priorDir, saved));
          if (
            digestOf(readJson(join(priorDir, 'brief.json'))) !==
            saved.briefDigest
          ) {
            retained.push('brief digest does not match archived manifest');
          }
          issues.push(
            ...retained.map(issue => `history/${prior.name}: ${issue}`)
          );
        } catch {
          issues.push(
            `history/${prior.name}: missing or unreadable archived run`
          );
        }
      }
    }
  }
  return issues;
}
