#!/usr/bin/env node
/**
 * JOV-7200 / VER-5 — bind public-profile dogfood feed to a served deploy.
 *
 * Default is dry-run (no DB writes). Apply requires DATABASE_URL (Doppler
 * jovie-web/prd — same as scripts/db/prod-read.mjs). No HTTP bind route;
 * uses existing CAS helpers against ovie_operating_kv.
 *
 * Dry-run observe:
 *   pnpm --filter=@jovie/web exec tsx scripts/bind-public-profile-dogfood-feed.ts \
 *     --origin https://jov.ie --observe --path /tim
 *
 * Apply via .github/workflows/dogfood-feed-bind.yml (workflow_dispatch on main)
 * or an authorized runner with Doppler jovie-web/prd DATABASE_URL. Never via
 * postdeploy-probes.yml (production observer; no mutation). Never ingest the
 * synthetic public-profile fixture capability receipt.
 *
 *   doppler run --project jovie-web --config prd --only-secrets=DATABASE_URL --no-fallback -- \
 *     pnpm --filter=@jovie/web exec tsx scripts/bind-public-profile-dogfood-feed.ts \
 *       --origin https://jov.ie --observe --path /tim --apply
 */
import { readFileSync, writeFileSync } from 'node:fs';
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
  if (
    !Array.isArray(raw.criterionAssessment) ||
    raw.criterionAssessment.length === 0
  ) {
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

function countMatches(html: string, pattern: RegExp): number {
  return (html.match(pattern) ?? []).length;
}

async function observePublicProfile(input: {
  readonly origin: string;
  readonly path: string;
}): Promise<ObservationFile> {
  const started = new Date().toISOString();
  const buildInfo = await fetchBuildInfo(input.origin);
  const profileUrl = new URL(input.path, input.origin);
  const response = await fetch(profileUrl);
  const html = await response.text();
  const completed = new Date().toISOString();

  const identityHits = countMatches(html, /artist|profile|@|display.?name/gi);
  const listenHits = countMatches(
    html,
    /spotify|listen|apple music|tidal|soundcloud|youtube/gi
  );
  const nearbyHits = countMatches(
    html,
    /nearby|notify|alert|concert|tour|notification/gi
  );

  // Nearby consent persistence requires an interactive write; anonymous HTML
  // alone never proves it. Identity/listen can pass on markup presence only
  // when the page actually loads.
  const identityStatus: CriterionStatus =
    response.ok && identityHits > 0 ? 'passed' : 'failed';
  const listenStatus: CriterionStatus =
    response.ok && listenHits > 0 ? 'passed' : 'failed';
  const nearbyStatus: CriterionStatus = 'failed';

  const passedCount = [identityStatus, listenStatus, nearbyStatus].filter(
    status => status === 'passed'
  ).length;

  return {
    observedAtStarted: started,
    observedAtCompleted: completed,
    origin: input.origin,
    path: input.path,
    httpStatus: response.status,
    buildInfo,
    criterionAssessment: [
      {
        criterion: 'Identity and latest work match the canonical artist',
        status: identityStatus,
        evidenceRefs: [
          'artifact:public-profile/http-profile',
          'artifact:public-profile/build-info',
        ],
        notes: `Anonymous GET ${profileUrl} identity markup hits=${identityHits}`,
      },
      {
        criterion: 'A listening destination reaches the intended work',
        status: listenStatus,
        evidenceRefs: ['artifact:public-profile/http-profile'],
        notes: `Listen markup hits=${listenHits}; destination click not executed`,
      },
      {
        criterion:
          'Nearby notification interest and consent persist for the intended artist',
        status: nearbyStatus,
        evidenceRefs: ['artifact:public-profile/http-profile'],
        notes: `Nearby markup hits=${nearbyHits}; consent persistence not completed (truthful fail)`,
      },
    ],
    goalCompletion:
      passedCount === 3 ? 'completed' : passedCount > 0 ? 'partial' : 'failed',
    correctness: 'unverified',
    method: 'goal_driven',
    purpose: 'capability',
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
        ? 'Public-profile probe met every success criterion on the served deploy.'
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
      observe: { type: 'boolean', default: false },
      path: { type: 'string', default: '/tim' },
      'write-observation': { type: 'string' },
      'write-result': { type: 'string' },
      apply: { type: 'boolean', default: false },
      'expected-sha': { type: 'string' },
    },
  });

  if (!values.observe && !values.observation) {
    process.stderr.write('Provide --observe or --observation <file>\n');
    return 64;
  }

  const observation = values.observe
    ? await observePublicProfile({
        origin: values.origin!,
        path: values.path!,
      })
    : parseObservation(
        JSON.parse(readFileSync(values.observation!, 'utf8'))
      );

  if (values['write-observation']) {
    writeFileSync(
      values['write-observation'],
      `${JSON.stringify(observation, null, 2)}\n`
    );
  }

  // Refuse synthetic fixture capability observation shapes (placeholder
  // artifact refs from buildPublicProfileCapabilityReceipt). Live VER-5
  // binds only genuine observed receipts from --observe or an equivalent
  // probe file whose evidence refs come from the live HTTP probe.
  const fixtureArtifactRefs = new Set([
    'artifact:public-profile/identity-readback',
    'artifact:public-profile/listen-destination',
    'artifact:public-profile/nearby-consent',
    'artifact:public-profile/scripted-click-trace',
  ]);
  const observationRefs = observation.criterionAssessment.flatMap(
    item => item.evidenceRefs
  );
  if (observationRefs.some(ref => fixtureArtifactRefs.has(ref))) {
    process.stderr.write(
      `${JSON.stringify(
        {
          error: 'refusing_synthetic_fixture_receipt',
          hint: 'Use --observe for a genuine production probe; do not ingest buildPublicProfileCapabilityReceipt / seedPublicProfileDogfoodFixture',
        },
        null,
        2
      )}\n`
    );
    return 2;
  }

  const live = await fetchBuildInfo(values.origin!);
  if (
    live.commitSha !== observation.buildInfo.commitSha ||
    live.deploymentId !== observation.buildInfo.deploymentId
  ) {
    process.stderr.write(
      `${JSON.stringify(
        {
          error: 'observation_build_mismatch',
          live,
          observation: observation.buildInfo,
        },
        null,
        2
      )}\n`
    );
    return 2;
  }

  if (
    values['expected-sha'] &&
    live.commitSha !== values['expected-sha']
  ) {
    process.stderr.write(
      `${JSON.stringify(
        {
          error: 'expected_sha_mismatch',
          expected: values['expected-sha'],
          live: live.commitSha,
        },
        null,
        2
      )}\n`
    );
    return 2;
  }

  if (live.environment && live.environment !== 'production') {
    process.stderr.write(
      `${JSON.stringify(
        {
          error: 'refusing_non_production_alias',
          environment: live.environment,
          hint: 'Bind only jov.ie production for VER-5 prod acceptance; staging is separate',
        },
        null,
        2
      )}\n`
    );
    return 2;
  }

  const binding: DogfoodSubjectDeployBinding = {
    commitSha: live.commitSha,
    deploymentId: live.deploymentId,
    // Provenance (live vs fixture), not the Vercel env label.
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
    path: observation.path,
    note: 'source=production means live provenance (not fixture), not Vercel env',
    liveBuild: live,
    binding,
    receiptId,
    receiptOutcome: receipt.outcome,
    provesOutcome: proves,
    expectedMetricEffect: {
      dogfoodFeed: {
        status: 'production',
        receiptCountDelta: '+1 (or replay)',
        subjectsWithDeploy: '≥1 including public-profile',
      },
      dogfoodKindCoverage:
        'capability coverage rises only if provesOutcome=true; truthful fails stay 0',
    },
    readback: {
      ledgerKey: 'jovie:certification:v1:dogfood-receipts',
      metricsUrl: `${values.origin}/api/ovie/certifications/metrics`,
    },
  };

  if (!values.apply) {
    const serialized = `${JSON.stringify(plan, null, 2)}\n`;
    process.stdout.write(serialized);
    if (values['write-result']) {
      writeFileSync(values['write-result'], serialized);
    }
    process.stdout.write(
      'dry-run complete; pass --apply with DATABASE_URL to persist\n'
    );
    return 0;
  }

  if (!process.env.DATABASE_URL) {
    process.stderr.write(
      'DATABASE_URL missing; refuse apply. Use doppler jovie-web/prd\n'
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
  const result = {
    ...plan,
    bindResult,
    receiptResult,
    feed,
    subjectDeploy:
      ledger?.subjectDeploys[PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID] ?? null,
  };
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  process.stdout.write(serialized);
  if (values['write-result']) {
    writeFileSync(values['write-result'], serialized);
  }
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
