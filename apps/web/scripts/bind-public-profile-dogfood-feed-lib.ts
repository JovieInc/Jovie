/**
 * Pure helpers for public-profile dogfood feed bind (JOV-7200 / VER-5).
 * Kept under the size-500 budget separate from the CLI entrypoint.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type DogfoodReceipt,
  dogfoodReceiptFromOutcomeMission,
  validateDogfoodReceipt,
} from '@/lib/agent-os/dogfood-receipt';
import { getCanonicalSurface } from '@/lib/canonical-surfaces';
import {
  type DogfoodSubjectDeployBinding,
  type readDogfoodReceiptLedger,
} from '@/lib/ovie/certifications/dogfood-receipt-ledger';
import { PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID } from '@/lib/ovie/certifications/public-profile-dogfood-fixture';

export const COMMIT_SHA = /^[0-9a-f]{40}$/i;
export const ALLOWED_ORIGIN = 'https://jov.ie';
export const PROFILE_PATH = /^\/[A-Za-z0-9._~-]+$/;
export const FIXTURE_ARTIFACT_REFS = new Set([
  'artifact:public-profile/identity-readback',
  'artifact:public-profile/listen-destination',
  'artifact:public-profile/nearby-consent',
  'artifact:public-profile/scripted-click-trace',
]);

/** Narrow one-shot: never follow redirects (same-origin start is not enough). */
export async function fetchNoRedirect(
  url: URL,
  init?: RequestInit
): Promise<Response> {
  const response = await fetch(url, { ...init, redirect: 'manual' });
  if (
    response.type === 'opaqueredirect' ||
    (response.status >= 300 && response.status < 400)
  ) {
    const location = response.headers.get('location') ?? '';
    throw new Error(
      `refusing_redirect status=${response.status} from ${url.href} location=${location}`
    );
  }
  return response;
}

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
  if (!isRecord(raw.buildInfo))
    throw new Error('observation.buildInfo required');
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
    criterionAssessment:
      raw.criterionAssessment as ObservationFile['criterionAssessment'],
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
  const response = await fetchNoRedirect(
    new URL('/api/health/build-info', canonical)
  );
  if (!response.ok) {
    throw new Error(`build-info HTTP ${response.status} from ${canonical}`);
  }
  const body = (await response.json()) as Record<string, unknown>;
  if (typeof body.commitSha !== 'string' || !COMMIT_SHA.test(body.commitSha)) {
    throw new Error('build-info.commitSha invalid');
  }
  if (
    typeof body.deploymentId !== 'string' ||
    body.deploymentId.trim() === ''
  ) {
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
  const response = await fetchNoRedirect(profileUrl);
  const html = await response.text();
  const completed = new Date().toISOString();
  const runId = runIdFromTimestamps(started, completed);
  const htmlSha256 = createHash('sha256').update(html).digest('hex');

  mkdirSync(input.artifactDir, { recursive: true });
  const profileHtmlPath = join(input.artifactDir, `profile-${runId}.html`);
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

  const criteria =
    getCanonicalSurface('public-profile').outcomeMission.outcome
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
