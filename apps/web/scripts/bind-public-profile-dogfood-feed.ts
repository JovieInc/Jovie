#!/usr/bin/env node
/**
 * JOV-7200 / VER-5 — bind public-profile dogfood feed to a served deploy.
 *
 * Default is dry-run (no DB writes). Apply requires DATABASE_URL (same Doppler
 * jovie-web/prd path as scripts/db/prod-read.mjs). Does not add an HTTP bind
 * route; uses existing CAS helpers against ovie_operating_kv.
 *
 *   pnpm --filter=@jovie/web exec tsx scripts/bind-public-profile-dogfood-feed.ts \
 *     --origin https://jov.ie \
 *     --observation /path/to/public-profile-observation.json
 *
 *   doppler run -p jovie-web -c prd -- \
 *     pnpm --filter=@jovie/web exec tsx scripts/bind-public-profile-dogfood-feed.ts \
 *       --origin https://jov.ie \
 *       --observation /path/to/public-profile-observation.json \
 *       --apply
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  dogfoodReceiptFromOutcomeMission,
  dogfoodReceiptProvesOutcome,
} from '@/lib/agent-os/dogfood-receipt';
import { getCanonicalSurface } from '@/lib/canonical-surfaces';
import {
  bindDogfoodSubjectDeploy,
  dogfoodFeedStatus,
  dogfoodReceiptKey,
  type DogfoodSubjectDeployBinding,
  readDogfoodReceiptLedger,
  recordDogfoodReceipt,
} from '@/lib/ovie/certifications/dogfood-receipt-ledger';
import { PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID } from '@/lib/ovie/certifications/public-profile-dogfood-fixture';

const MERGE_SHA = 'c35613ecd6910e9575109182d6cd28beb0c3519d';
const COMMIT_SHA = /^[0-9a-f]{40}$/i;

type CriterionStatus = 'passed' | 'failed' | 'blocked' | 'skipped';

interface ObservationFile {
  readonly observedAtStarted: string;
  readonly observedAtCompleted: string;
  readonly origin: string;
  readonly path: string;
  readonly httpStatus: number;
  readonly buildInfo: {
    readonly commitSha: string;
    readonly deploymentId: string;
    readonly environment?: string;
  };
  readonly criterionAssessment: ReadonlyArray<{
    readonly criterion: string;
    readonly status: CriterionStatus;
    readonly evidenceRefs: readonly string[];
    readonly notes?: string;
  }>;
  readonly goalCompletion: 'completed' | 'partial' | 'failed' | 'abandoned';
  readonly correctness: 'correct' | 'incorrect' | 'unverified';
  readonly method: 'goal_driven' | 'scripted';
  readonly purpose: 'capability' | 'regression';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseObservation(raw: unknown): ObservationFile {
  if (!isRecord(raw)) throw new Error('observation must be an object');
  if (!isRecord(raw.buildInfo)) throw new Error('observation.buildInfo required');
  const commitSha = raw.buildInfo.commitSha;
  const deploymentId = raw.buildInfo.deploymentId;
  if (typeof commitSha !== 'string' || !COMMIT_SHA.test(commitSha)) {
    throw new Error('observation.buildInfo.commitSha must be a 40-char SHA');
  }
  if (typeof deploymentId !== 'string' || deploymentId.trim().length === 0) {
    throw new Error('observation.buildInfo.deploymentId required');
  }
  if (!Array.isArray(raw.criterionAssessment) || raw.criterionAssessment.length === 0) {
    throw new Error('observation.criterionAssessment required');
  }
  return raw as unknown as ObservationFile;
}

async function fetchBuildInfo(origin: string): Promise<{
  readonly commitSha: string;
  readonly deploymentId: string;
  readonly environment?: string;
}> {
  const response = await fetch(new URL('/api/health/build-info', origin));
  if (!response.ok) {
    throw new Error(`build-info HTTP ${response.status} from ${origin}`);
  }
  const body = (await response.json()) as Record<string, unknown>;
  if (typeof body.commitSha !== 'string' || !COMMIT_SHA.test(body.commitSha)) {
    throw new Error('build-info.commitSha invalid');
  }
  if (typeof body.deploymentId !== 'string' || body.deploymentId.trim() === '') {
    throw new Error('build-info.deploymentId invalid');
  }
  return {
    commitSha: body.commitSha,
    deploymentId: body.deploymentId,
    environment:
      typeof body.environment === 'string' ? body.environment : undefined,
  };
}

function buildReceipt(observation: ObservationFile) {
  const mission = getCanonicalSurface('public-profile').outcomeMission;
  const checks = observation.criterionAssessment.map(item => ({
    criterion: item.criterion,
    status: item.status,
    evidenceRefs: [...item.evidenceRefs],
  }));
  const allPassed = checks.every(check => check.status === 'passed');
  return dogfoodReceiptFromOutcomeMission(mission, {
    subjectId: PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID,
    product: 'jov',
    kind: 'ui_agent',
    driver: 'playwright',
    actor: 'verification-ver-5-live-proof',
    environment: 'production',
    deploymentId: observation.buildInfo.deploymentId,
    commitSha: observation.buildInfo.commitSha,
    flagCohort: 'dogfood',
    startedAt: observation.observedAtStarted,
    completedAt: observation.observedAtCompleted,
    evidenceRefs: [
      ...new Set(checks.flatMap(check => check.evidenceRefs)),
      `artifact:public-profile/origin:${observation.origin}${observation.path}`,
    ],
    missionObservation: {
      purpose: observation.purpose,
      method: observation.method,
      missionRevision: mission.outcome.revision,
      goalCompletion: observation.goalCompletion,
      correctness: observation.correctness,
      resultingState: allPassed
        ? 'Anonymous/public-profile probe met every success criterion on the served deploy.'
        : `Truthful probe on ${observation.origin}${observation.path}: ${checks
            .filter(check => check.status !== 'passed')
            .map(check => `${check.criterion}=${check.status}`)
            .join('; ')}`,
      checks,
      friction: {
        assessment: allPassed ? 'acceptable' : 'unacceptable',
        details: observation.criterionAssessment
          .filter(item => item.status !== 'passed')
          .map(item => item.notes ?? `${item.criterion}: ${item.status}`),
      },
      recovery: { retries: 0, details: [] },
      durationMs:
        Date.parse(observation.observedAtCompleted) -
        Date.parse(observation.observedAtStarted),
      resources: {
        status: 'not_applicable',
        reason: 'HTTP/HTML probe; no metered provider call.',
      },
    },
  });
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      origin: { type: 'string', default: 'https://jov.ie' },
      observation: { type: 'string' },
      apply: { type: 'boolean', default: false },
      'require-contains': { type: 'string', default: MERGE_SHA },
    },
  });
  if (!values.observation) {
    process.stderr.write('--observation <file> is required\n');
    return 64;
  }

  const observation = parseObservation(
    JSON.parse(readFileSync(values.observation, 'utf8'))
  );
  const live = await fetchBuildInfo(values.origin!);
  if (
    live.commitSha !== observation.buildInfo.commitSha ||
    live.deploymentId !== observation.buildInfo.deploymentId
  ) {
    process.stderr.write(
      JSON.stringify(
        {
          error: 'observation_build_mismatch',
          live,
          observation: observation.buildInfo,
        },
        null,
        2
      ) + '\n'
    );
    return 2;
  }

  const binding: DogfoodSubjectDeployBinding = {
    commitSha: live.commitSha,
    deploymentId: live.deploymentId,
    // Provenance flag (live vs fixture seed), not Vercel environment name.
    // staging.jov.ie canary and jov.ie production both use source=production
    // when the binding names the deployment that was actually exercised.
    source: 'production',
  };

  const receipt = buildReceipt(observation);
  const mission = getCanonicalSurface('public-profile').outcomeMission;
  const proves = dogfoodReceiptProvesOutcome(receipt, {
    id: mission.id,
    required: true,
    outcome: mission.outcome,
  });
  const receiptId = dogfoodReceiptKey(receipt);

  const plan = {
    mode: values.apply ? 'apply' : 'dry-run',
    origin: values.origin,
    requireContains: values['require-contains'],
    note: 'source=production means live provenance (not fixture), not the Vercel env label',
    liveBuild: live,
    binding,
    receiptId,
    receiptOutcome: receipt.outcome,
    provesOutcome: proves,
    expectedMetricEffect: {
      dogfoodFeed: {
        status: 'production',
        receiptCountDelta: '+1 (or replay if identical key)',
        subjectsWithDeploy: '≥1 including public-profile',
      },
      dogfoodKindCoverage:
        'capability coverage increases only if provesOutcome=true; truthful fails stay 0',
      idempotency:
        'identical receipt key replays; mutated payload fails closed (immutable)',
    },
    readback: {
      ledgerKey: 'jovie:certification:v1:dogfood-receipts',
      prodReadExample: `node scripts/db/prod-read.mjs "select value->'subjectDeploys'->'public-profile' as deploy, jsonb_object_keys(value->'receipts') as receipt_keys from ovie_operating_kv where key = 'jovie:certification:v1:dogfood-receipts'"`,
      metricsUrl: `${values.origin}/api/ovie/certifications/metrics`,
      metricsAuth:
        'resolveOviePrincipal (Ovie OAuth bearer or Better Auth session) + authorizeSummerControl (isAdmin); 401=unauthenticated, 403=non-admin',
    },
  };
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);

  if (!values.apply) {
    process.stdout.write(
      'dry-run complete; pass --apply with DATABASE_URL (doppler jovie-web/prd) to persist\n'
    );
    return 0;
  }

  if (!process.env.DATABASE_URL) {
    process.stderr.write(
      'DATABASE_URL missing; refuse apply. Use doppler run -p jovie-web -c prd\n'
    );
    return 2;
  }

  const { postgresRecordBackend } = await import(
    '@/lib/ovie/mcp/postgres-backend'
  );
  const backend = postgresRecordBackend();
  const recordedAt = new Date().toISOString();
  const bindResult = await bindDogfoodSubjectDeploy({
    backend,
    subjectId: PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID,
    binding,
    recordedAt,
  });
  const receiptResult = await recordDogfoodReceipt({
    backend,
    receipt,
    recordedAt,
  });
  const ledger = await readDogfoodReceiptLedger(backend);
  const feed = dogfoodFeedStatus(ledger);
  process.stdout.write(
    `${JSON.stringify(
      {
        bindResult,
        receiptResult,
        receiptId,
        feed,
        subjectDeploy: ledger?.subjectDeploys[PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID] ?? null,
      },
      null,
      2
    )}\n`
  );
  return 0;
}

main()
  .then(code => {
    process.exitCode = code;
  })
  .catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
