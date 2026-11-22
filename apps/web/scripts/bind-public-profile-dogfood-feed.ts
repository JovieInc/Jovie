#!/usr/bin/env node
/**
 * JOV-7200 / VER-5 — bind public-profile dogfood feed to a served deploy.
 *
 * Default is dry-run (no DB writes). Apply requires DATABASE_URL (Doppler
 * jovie-web/prd) under NODE_OPTIONS=--conditions=react-server (see package.json
 * dogfood:bind-public-profile). Never via postdeploy-probes.yml. Never ingest
 * the synthetic public-profile fixture capability receipt.
 *
 * This HTTP probe is agent_on_behalf / cli / regression / scripted. It does
 * not certify capability; checks stay unverified and goalCompletion is
 * not_completed until a real browser mission runs.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  type DogfoodReceipt,
  dogfoodReceiptFromOutcomeMission,
  dogfoodReceiptProvesOutcome,
  validateDogfoodReceipt,
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
const ALLOWED_ORIGIN = 'https://jov.ie';
const PROFILE_PATH = /^\/[A-Za-z0-9._~-]+$/;
const FIXTURE_ARTIFACT_REFS = new Set([
  'artifact:public-profile/identity-readback',
  'artifact:public-profile/listen-destination',
  'artifact:public-profile/nearby-consent',
  'artifact:public-profile/scripted-click-trace',
]);

export type CriterionStatus = 'passed' | 'failed' | 'unverified';
export type GoalCompletion = 'completed' | 'partial' | 'not_completed';

export interface ObservationFile {
  readonly observedAtStarted: string;
  readonly observedAtCompleted: string;
  readonly origin: string;
  readonly path: string;
  readonly httpStatus: number;
  readonly htmlSha256: string;
  readonly htmlBytes: number;
  readonly artifactRefs: {
    readonly profileHtml: string;
    readonly buildInfo: string;
  };
  readonly buildInfo: {
    readonly commitSha: string;
    readonly deploymentId: string;
    readonly environment: string;
  };
  readonly criterionAssessment: ReadonlyArray<{
    readonly criterion: string;
    readonly status: CriterionStatus;
    readonly evidenceRefs: readonly string[];
    readonly notes?: string;
  }>;
  readonly goalCompletion: GoalCompletion;
  readonly correctness: 'correct' | 'incorrect' | 'unverified';
  readonly method: 'goal_driven' | 'scripted';
  readonly purpose: 'capability' | 'regression';
  readonly probe: {
    readonly kind: 'agent_on_behalf';
    readonly driver: 'cli';
    readonly executed: readonly string[];
    readonly unexecuted: readonly string[];
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function canonicalizeOrigin(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (trimmed !== ALLOWED_ORIGIN) {
    throw new Error(
      `origin must canonicalize to ${ALLOWED_ORIGIN}; got ${JSON.stringify(raw)}`
    );
  }
  return ALLOWED_ORIGIN;
}

export function assertSameOriginProfilePath(path: string): string {
  const value = path.trim();
  if (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('//') ||
    value.includes('://')
  ) {
    throw new Error(
      `path must be a same-origin relative profile path; got ${JSON.stringify(path)}`
    );
  }
  if (!PROFILE_PATH.test(value)) {
    throw new Error(
      `path must match ${PROFILE_PATH}; got ${JSON.stringify(path)}`
    );
  }
  return value;
}

export function requireProductionEnvironment(
  environment: unknown
): asserts environment is string {
  if (environment !== 'production') {
    throw new Error(
      `refusing non-production or absent environment label: ${JSON.stringify(environment)}`
    );
  }
}

function isoTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be an ISO timestamp`);
  }
  return value;
}

export function parseObservation(raw: unknown): ObservationFile {
  if (!isRecord(raw)) throw new Error('observation must be an object');
  if (!isRecord(raw.buildInfo)) throw new Error('observation.buildInfo required');
  if (!isRecord(raw.artifactRefs)) {
    throw new Error('observation.artifactRefs required');
  }
  if (!isRecord(raw.probe)) throw new Error('observation.probe required');

  const origin = canonicalizeOrigin(String(raw.origin ?? ''));
  const path = assertSameOriginProfilePath(String(raw.path ?? ''));
  const commitSha = raw.buildInfo.commitSha;
  const deploymentId = raw.buildInfo.deploymentId;
  requireProductionEnvironment(raw.buildInfo.environment);
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
  for (const item of raw.criterionAssessment) {
    if (!isRecord(item)) throw new Error('criterionAssessment item invalid');
    if (
      item.status !== 'passed' &&
      item.status !== 'failed' &&
      item.status !== 'unverified'
    ) {
      throw new Error(`criterion status must be passed|failed|unverified`);
    }
    if (!Array.isArray(item.evidenceRefs) || item.evidenceRefs.length === 0) {
      throw new Error('criterion evidenceRefs required');
    }
  }
  if (
    raw.goalCompletion !== 'completed' &&
    raw.goalCompletion !== 'partial' &&
    raw.goalCompletion !== 'not_completed'
  ) {
    throw new Error('goalCompletion must be completed|partial|not_completed');
  }
  if (
    raw.correctness !== 'correct' &&
    raw.correctness !== 'incorrect' &&
    raw.correctness !== 'unverified'
  ) {
    throw new Error('correctness must be correct|incorrect|unverified');
  }
  if (raw.method !== 'scripted' && raw.method !== 'goal_driven') {
    throw new Error('method must be scripted|goal_driven');
  }
  if (raw.purpose !== 'regression' && raw.purpose !== 'capability') {
    throw new Error('purpose must be regression|capability');
  }
  if (typeof raw.htmlSha256 !== 'string' || raw.htmlSha256.length < 16) {
    throw new Error('observation.htmlSha256 required');
  }
  if (typeof raw.htmlBytes !== 'number' || raw.htmlBytes < 0) {
    throw new Error('observation.htmlBytes required');
  }
  if (
    typeof raw.artifactRefs.profileHtml !== 'string' ||
    typeof raw.artifactRefs.buildInfo !== 'string'
  ) {
    throw new Error('observation.artifactRefs paths required');
  }
  if (raw.probe.kind !== 'agent_on_behalf' || raw.probe.driver !== 'cli') {
    throw new Error('HTTP probe must declare agent_on_behalf/cli');
  }
  if (
    !Array.isArray(raw.probe.executed) ||
    !Array.isArray(raw.probe.unexecuted)
  ) {
    throw new Error('observation.probe executed/unexecuted required');
  }

  const refs = raw.criterionAssessment.flatMap(item => {
    const record = item as Record<string, unknown>;
    return Array.isArray(record.evidenceRefs)
      ? (record.evidenceRefs as string[])
      : [];
  });
  if (refs.some(ref => FIXTURE_ARTIFACT_REFS.has(ref))) {
    throw new Error('refusing_synthetic_fixture_receipt');
  }

  return {
    observedAtStarted: isoTimestamp(raw.observedAtStarted, 'observedAtStarted'),
    observedAtCompleted: isoTimestamp(
      raw.observedAtCompleted,
      'observedAtCompleted'
    ),
    origin,
    path,
    httpStatus: Number(raw.httpStatus),
    htmlSha256: raw.htmlSha256,
    htmlBytes: raw.htmlBytes,
    artifactRefs: {
      profileHtml: raw.artifactRefs.profileHtml,
      buildInfo: raw.artifactRefs.buildInfo,
    },
    buildInfo: {
      commitSha,
      deploymentId,
      environment: 'production',
    },
    criterionAssessment: raw.criterionAssessment as ObservationFile['criterionAssessment'],
    goalCompletion: raw.goalCompletion,
    correctness: raw.correctness,
    method: raw.method,
    purpose: raw.purpose,
    probe: {
      kind: 'agent_on_behalf',
      driver: 'cli',
      executed: [...raw.probe.executed].map(String),
      unexecuted: [...raw.probe.unexecuted].map(String),
    },
  };
}

export async function fetchBuildInfo(origin: string): Promise<{
  readonly commitSha: string;
  readonly deploymentId: string;
  readonly environment: string;
}> {
  const canonical = canonicalizeOrigin(origin);
  const response = await fetch(new URL('/api/health/build-info', canonical));
  if (!response.ok) {
    throw new Error(`build-info HTTP ${response.status} from ${canonical}`);
  }
  const body = (await response.json()) as Record<string, unknown>;
  if (typeof body.commitSha !== 'string' || !COMMIT_SHA.test(body.commitSha)) {
    throw new Error('build-info.commitSha invalid');
  }
  if (typeof body.deploymentId !== 'string' || body.deploymentId.trim() === '') {
    throw new Error('build-info.deploymentId invalid');
  }
  requireProductionEnvironment(body.environment);
  return {
    commitSha: body.commitSha,
    deploymentId: body.deploymentId,
    environment: 'production',
  };
}

function runIdFromTimestamps(started: string, completed: string): string {
  return createHash('sha256')
    .update(`${started}|${completed}`)
    .digest('hex')
    .slice(0, 16);
}

export async function observePublicProfile(input: {
  readonly origin: string;
  readonly path: string;
  readonly artifactDir: string;
}): Promise<ObservationFile> {
  const origin = canonicalizeOrigin(input.origin);
  const path = assertSameOriginProfilePath(input.path);
  const started = new Date().toISOString();
  const buildInfo = await fetchBuildInfo(origin);
  const profileUrl = new URL(path, origin);
  const response = await fetch(profileUrl);
  const html = await response.text();
  const completed = new Date().toISOString();
  const runId = runIdFromTimestamps(started, completed);
  const htmlSha256 = createHash('sha256').update(html).digest('hex');

  mkdirSync(input.artifactDir, { recursive: true });
  const profileHtmlPath = join(
    input.artifactDir,
    `profile-${runId}.html`
  );
  const buildInfoPath = join(input.artifactDir, `build-info-${runId}.json`);
  writeFileSync(profileHtmlPath, html);
  writeFileSync(`${buildInfoPath}`, `${JSON.stringify(buildInfo, null, 2)}\n`);

  const profileRef = `artifact:public-profile/http-probe/${runId}/profile.html#sha256:${htmlSha256}`;
  const buildRef = `artifact:public-profile/http-probe/${runId}/build-info.json`;

  // Word counts are diagnostic only — never enough to mark criteria passed.
  const identityHits = (html.match(/artist|profile|@|display.?name/gi) ?? [])
    .length;
  const listenHits = (
    html.match(/spotify|listen|apple music|tidal|soundcloud|youtube/gi) ?? []
  ).length;
  const nearbyHits = (
    html.match(/nearby|notify|alert|concert|tour|notification/gi) ?? []
  ).length;

  const criteria = getCanonicalSurface('public-profile').outcomeMission.outcome
    .successCriteria;
  const notes = [
    `Anonymous GET ${profileUrl} HTTP ${response.status}; identity markup hits=${identityHits} (not a pass)`,
    `Listen markup hits=${listenHits}; destination click not executed`,
    `Nearby markup hits=${nearbyHits}; consent persistence not executed`,
  ];

  return {
    observedAtStarted: started,
    observedAtCompleted: completed,
    origin,
    path,
    httpStatus: response.status,
    htmlSha256,
    htmlBytes: Buffer.byteLength(html),
    artifactRefs: {
      profileHtml: profileHtmlPath,
      buildInfo: buildInfoPath,
    },
    buildInfo,
    criterionAssessment: criteria.map((criterion, index) => ({
      criterion,
      status: 'unverified' as const,
      evidenceRefs: [profileRef, buildRef],
      notes: notes[index] ?? notes[0],
    })),
    goalCompletion: 'not_completed',
    correctness: 'unverified',
    method: 'scripted',
    purpose: 'regression',
    probe: {
      kind: 'agent_on_behalf',
      driver: 'cli',
      executed: ['http_get_build_info', 'http_get_profile_html'],
      unexecuted: [
        'identity_latest_work_readback',
        'listening_destination_click',
        'nearby_consent_persist',
      ],
    },
  };
}

export function buildReceipt(observation: ObservationFile): DogfoodReceipt {
  const mission = getCanonicalSurface('public-profile').outcomeMission;
  const checks = observation.criterionAssessment.map(item => ({
    criterion: item.criterion,
    status: item.status,
    evidenceRefs: [...item.evidenceRefs],
  }));
  const profileRef = checks[0]?.evidenceRefs[0];
  const buildRef = checks[0]?.evidenceRefs[1];
  if (!profileRef || !buildRef) {
    throw new Error('observation missing run-specific evidence refs');
  }

  const receipt = dogfoodReceiptFromOutcomeMission(mission, {
    subjectId: PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID,
    product: 'jov',
    kind: 'agent_on_behalf',
    driver: 'cli',
    actor: 'verification-ver-5-http-probe',
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
      purpose: 'regression',
      method: 'scripted',
      missionRevision: mission.outcome.revision,
      goalCompletion: 'not_completed',
      correctness: 'unverified',
      resultingState: `Honest HTTP/CLI regression probe on ${observation.origin}${observation.path}: criteria remain unverified; capability certification open until browser mission evidence exists.`,
      checks,
      friction: {
        assessment: 'unacceptable',
        details: observation.criterionAssessment.map(
          item => item.notes ?? `${item.criterion}: ${item.status}`
        ),
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

  const errors = validateDogfoodReceipt(receipt);
  if (errors.length > 0) {
    throw new Error(`constructed receipt invalid: ${errors.join('; ')}`);
  }
  return receipt;
}

export function assertExactPersistence(input: {
  readonly ledger: Awaited<ReturnType<typeof readDogfoodReceiptLedger>>;
  readonly subjectId: string;
  readonly binding: DogfoodSubjectDeployBinding;
  readonly receipt: DogfoodReceipt;
  readonly receiptId: string;
}): {
  readonly bindingOk: boolean;
  readonly receiptOk: boolean;
} {
  const storedBinding = input.ledger?.subjectDeploys[input.subjectId] ?? null;
  const storedReceipt = input.ledger?.receipts[input.receiptId] ?? null;
  const bindingOk =
    storedBinding?.commitSha === input.binding.commitSha &&
    storedBinding.deploymentId === input.binding.deploymentId &&
    storedBinding.source === input.binding.source;
  const receiptOk =
    storedReceipt !== null &&
    JSON.stringify(storedReceipt) === JSON.stringify(input.receipt);
  if (!bindingOk || !receiptOk) {
    throw new Error(
      JSON.stringify({
        error: 'exact_persistence_readback_failed',
        bindingOk,
        receiptOk,
        storedBinding,
        hasStoredReceipt: storedReceipt !== null,
      })
    );
  }
  return { bindingOk, receiptOk };
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      origin: { type: 'string', default: ALLOWED_ORIGIN },
      observation: { type: 'string' },
      observe: { type: 'boolean', default: false },
      path: { type: 'string', default: '/tim' },
      'write-observation': { type: 'string' },
      'write-result': { type: 'string' },
      'artifact-dir': { type: 'string' },
      apply: { type: 'boolean', default: false },
      'expected-sha': { type: 'string' },
    },
  });

  if (!values.observe && !values.observation) {
    process.stderr.write('Provide --observe or --observation <file>\n');
    return 64;
  }

  const origin = canonicalizeOrigin(values.origin!);
  const path = assertSameOriginProfilePath(values.path!);
  const artifactDir =
    values['artifact-dir'] ??
    join(process.cwd(), '.cache', 'public-profile-dogfood-artifacts');

  const observation = values.observe
    ? await observePublicProfile({ origin, path, artifactDir })
    : parseObservation(JSON.parse(readFileSync(values.observation!, 'utf8')));

  if (values['write-observation']) {
    writeFileSync(
      values['write-observation'],
      `${JSON.stringify(observation, null, 2)}\n`
    );
  }

  // Re-check served identity immediately before planning/writing.
  const live = await fetchBuildInfo(origin);
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
  if (values['expected-sha'] && live.commitSha !== values['expected-sha']) {
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

  const binding: DogfoodSubjectDeployBinding = {
    commitSha: live.commitSha,
    deploymentId: live.deploymentId,
    source: 'production',
  };

  // Validate the complete receipt before either CAS write.
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
    origin,
    path: observation.path,
    note: 'source=production is live provenance; knownGoodDeploymentIds are binder IDs, not product certification',
    liveBuild: live,
    binding,
    receiptId,
    receiptOutcome: receipt.outcome,
    provesOutcome: proves,
    observationTimestamps: {
      startedAt: observation.observedAtStarted,
      completedAt: observation.observedAtCompleted,
    },
    expectedMetricEffect: {
      dogfoodFeed: {
        status: 'production',
        receiptCountDelta: '+1 (or replay)',
        subjectsWithDeploy: '≥1 including public-profile',
      },
      dogfoodKindCoverage:
        'capability coverage stays 0 for this honest non-passing HTTP probe',
    },
    commissioning: {
      feedConnected: false,
      receiptPersisted: false,
      productCertification: false,
    },
    readback: {
      ledgerKey: 'jovie:certification:v1:dogfood-receipts',
      metricsUrl: `${origin}/api/ovie/certifications/metrics`,
      bindingOk: false,
      receiptOk: false,
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
      'DATABASE_URL missing; refuse apply. Use doppler jovie-web/prd with NODE_OPTIONS=--conditions=react-server\n'
    );
    return 2;
  }

  // Final identity check immediately before either write.
  const preWrite = await fetchBuildInfo(origin);
  if (
    preWrite.commitSha !== binding.commitSha ||
    preWrite.deploymentId !== binding.deploymentId
  ) {
    process.stderr.write(
      `${JSON.stringify(
        {
          error: 'served_identity_drift_before_write',
          binding,
          preWrite,
        },
        null,
        2
      )}\n`
    );
    return 2;
  }

  const { postgresRecordBackend } = await import(
    '@/lib/ovie/mcp/postgres-backend'
  );
  const backend = postgresRecordBackend();
  // Keep observation timestamps for immutable receipt key / safe replay.
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
  const exact = assertExactPersistence({
    ledger,
    subjectId: PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID,
    binding,
    receipt,
    receiptId,
  });
  const feed = dogfoodFeedStatus(ledger);
  const result = {
    ...plan,
    bindResult,
    receiptResult,
    feed,
    subjectDeploy:
      ledger?.subjectDeploys[PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID] ?? null,
    knownGoodDeploymentIds: ledger?.knownGoodDeploymentIds ?? [],
    knownGoodNote:
      'Binder may add deployment IDs to knownGoodDeploymentIds; that is not product certification.',
    readback: {
      ...plan.readback,
      bindingOk: exact.bindingOk,
      receiptOk: exact.receiptOk,
    },
    commissioning: {
      feedConnected: feed.status === 'production',
      receiptPersisted: exact.receiptOk && feed.receiptCount >= 1,
      productCertification: false,
    },
  };
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  process.stdout.write(serialized);
  if (values['write-result']) {
    writeFileSync(values['write-result'], serialized);
  }
  return 0;
}

const isDirectRun =
  process.argv[1]?.includes('bind-public-profile-dogfood-feed') === true;

if (isDirectRun) {
  main()
    .then(code => {
      process.exitCode = code;
    })
    .catch(error => {
      process.stderr.write(
        `${error instanceof Error ? error.message : error}\n`
      );
      process.exitCode = 1;
    });
}
