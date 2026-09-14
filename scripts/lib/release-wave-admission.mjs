/**
 * Classify whether the native queue should pause new admissions while the
 * serialized Production Controller is draining a release wave.
 *
 * The controller run is the existing release state. This helper deliberately
 * keeps already-admitted queue entries out of the decision: the queue drain
 * only uses the result to cap new enrollment and recovery. A run remains a
 * valid hold even after main advances, because the old exact SHA is still
 * consuming the release lease until the run terminates or its bounded expiry.
 */

export const RELEASE_WAVE_ADMISSION_SCHEMA = 'jovie-release-wave-admission/v1';
export const PRODUCTION_CONTROLLER_WORKFLOW_PATH =
  '.github/workflows/production-controller.yml';
export const DEFAULT_RELEASE_WAVE_HOLD_MAX_AGE_SECONDS = 30 * 60;

const SHA = /^[0-9a-f]{40}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const ACTIVE_STATUSES = new Set(['queued', 'in_progress']);

function exactSha(value) {
  return typeof value === 'string' && SHA.test(value);
}

function normalizeSha(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.toLowerCase();
  return exactSha(normalized) ? normalized : '';
}

function parseTimestamp(value) {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoTimestamp(value) {
  return new Date(value).toISOString().replace('.000Z', 'Z');
}

function normalizeMaxAgeSeconds(value) {
  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < 60 ||
    parsed > DEFAULT_RELEASE_WAVE_HOLD_MAX_AGE_SECONDS * 2
  ) {
    throw new Error(
      `maxAgeSeconds must be an integer from 60 to ${DEFAULT_RELEASE_WAVE_HOLD_MAX_AGE_SECONDS * 2}`
    );
  }
  return parsed;
}

function normalizeRun(run) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
  const status = String(run.status ?? '').toLowerCase();
  const path = String(run.path ?? '').replace(/@.*$/, '');
  const branch = String(run.head_branch ?? run.headBranch ?? '');
  const id = String(run.id ?? run.databaseId ?? '');
  const createdAt = parseTimestamp(run.created_at ?? run.createdAt);
  const headSha = normalizeSha(run.head_sha ?? run.headSha);

  if (
    !POSITIVE_INTEGER.test(id) ||
    path !== PRODUCTION_CONTROLLER_WORKFLOW_PATH ||
    branch !== 'main' ||
    !ACTIVE_STATUSES.has(status) ||
    createdAt === null
  ) {
    return null;
  }

  return { id, status, path, branch, createdAt, headSha };
}

function inputRuns(input) {
  if (Array.isArray(input)) return input;
  if (
    input &&
    typeof input === 'object' &&
    Array.isArray(input.workflow_runs)
  ) {
    return input.workflow_runs;
  }
  return [];
}

function baseDecision({ nowMs, currentMainSha, maxAgeSeconds }) {
  return {
    schema: RELEASE_WAVE_ADMISSION_SCHEMA,
    observedAt: isoTimestamp(nowMs),
    currentMainSha,
    maxAgeSeconds,
    hold: false,
    reason: 'no-active-controller',
    activeRunId: null,
    activeRunHeadSha: null,
    activeRunStatus: null,
    activeRunIds: [],
    activeRunCount: 0,
    expiresAt: null,
    remainingSeconds: 0,
  };
}

/** @typedef {{now?: number, maxAgeSeconds?: number, currentMainSha?: string}} ReleaseWaveOptions */

/**
 * @param {object|Array<object>} input
 * @param {ReleaseWaveOptions} [options]
 */
export function classifyReleaseWave(input, options = {}) {
  const nowMs = options.now === undefined ? Date.now() : Number(options.now);
  if (!Number.isFinite(nowMs)) throw new Error('now must be a finite epoch');

  const maxAgeSeconds = normalizeMaxAgeSeconds(
    options.maxAgeSeconds ?? DEFAULT_RELEASE_WAVE_HOLD_MAX_AGE_SECONDS
  );
  const currentMainSha = normalizeSha(options.currentMainSha ?? '');
  const decision = baseDecision({ nowMs, currentMainSha, maxAgeSeconds });

  if (!currentMainSha) {
    return { ...decision, reason: 'invalid-main-sha' };
  }

  const runsById = new Map();
  for (const candidate of inputRuns(input)) {
    const run = normalizeRun(candidate);
    if (run && !runsById.has(run.id)) runsById.set(run.id, run);
  }
  const runs = [...runsById.values()].sort(
    (left, right) => left.createdAt - right.createdAt
  );
  const maxAgeMs = maxAgeSeconds * 1000;
  const liveRuns = runs.filter(run => nowMs - run.createdAt <= maxAgeMs);

  if (liveRuns.length === 0) {
    if (runs.length > 0) {
      const latestExpired = runs[runs.length - 1];
      return {
        ...decision,
        reason: 'release-wave-expired',
        activeRunId: latestExpired.id,
        activeRunHeadSha: latestExpired.headSha || null,
        activeRunStatus: latestExpired.status,
        expiresAt: isoTimestamp(latestExpired.createdAt + maxAgeMs),
      };
    }
    return decision;
  }

  const selected = liveRuns[0];
  // A future created_at can occur under clock skew. Clamp the deadline to one
  // max-age window from observation so a malformed clock cannot create an
  // effectively unbounded hold.
  const expiresAtMs = Math.min(selected.createdAt + maxAgeMs, nowMs + maxAgeMs);
  const mainAdvanced =
    selected.headSha !== '' && selected.headSha !== currentMainSha;
  const remainingSeconds = Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));

  return {
    ...decision,
    hold: true,
    reason: mainAdvanced
      ? 'controller-wave-draining'
      : 'controller-wave-active',
    activeRunId: selected.id,
    activeRunHeadSha: selected.headSha || null,
    activeRunStatus: selected.status,
    activeRunIds: liveRuns.map(run => run.id),
    activeRunCount: liveRuns.length,
    expiresAt: isoTimestamp(expiresAtMs),
    remainingSeconds,
  };
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    result[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return result;
}

async function stdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export async function runCli(argv = process.argv.slice(2), io = {}) {
  const [command, ...rest] = argv;
  if (command !== 'classify') {
    throw new Error(
      'Usage: release-wave-admission.mjs classify --main-sha <sha> [--max-age-seconds <seconds>]'
    );
  }
  const args = parseArgs(rest);
  const write =
    typeof io.write === 'function'
      ? io.write
      : value => process.stdout.write(value);
  let value;
  try {
    const rawInput = io.input === undefined ? await stdin() : io.input;
    value = JSON.parse(rawInput);
  } catch {
    write(
      JSON.stringify({
        schema: RELEASE_WAVE_ADMISSION_SCHEMA,
        hold: false,
        reason: 'controller-state-malformed',
      }) + '\n'
    );
    return 2;
  }

  const decision = classifyReleaseWave(value, {
    currentMainSha: args['main-sha'],
    maxAgeSeconds: args['max-age-seconds'],
  });
  write(`${JSON.stringify(decision)}\n`);
  return 0;
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  runCli()
    .then(code => {
      process.exitCode = code;
    })
    .catch(error => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
