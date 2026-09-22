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
// GitHub reports runs waiting on workflow concurrency as pending.
const ACTIVE_STATUSES = new Set(['queued', 'pending', 'in_progress']);
const KNOWN_RUN_STATUSES = new Set([
  'queued',
  'in_progress',
  'completed',
  'requested',
  'waiting',
  'pending',
]);

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

function parseInput(input) {
  if (Array.isArray(input)) {
    return {
      valid: input.every(
        run => run && typeof run === 'object' && !Array.isArray(run)
      ),
      runs: input,
    };
  }
  if (input && typeof input === 'object') {
    if (Array.isArray(input.workflow_runs)) {
      return {
        valid: input.workflow_runs.every(
          run => run && typeof run === 'object' && !Array.isArray(run)
        ),
        runs: input.workflow_runs,
      };
    }
    return { valid: false, runs: [] };
  }
  return { valid: false, runs: [] };
}

function structurallyValidRun(run) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) return false;

  const id = String(run.id ?? run.databaseId ?? '');
  const status = typeof run.status === 'string' ? run.status.toLowerCase() : '';
  const path = run.path;
  const branch = run.head_branch ?? run.headBranch;
  const createdAt = run.created_at ?? run.createdAt;
  if (
    !POSITIVE_INTEGER.test(id) ||
    !KNOWN_RUN_STATUSES.has(status) ||
    typeof path !== 'string' ||
    path.trim() === '' ||
    typeof branch !== 'string' ||
    branch.trim() === '' ||
    parseTimestamp(createdAt) === null
  ) {
    return false;
  }

  // GitHub workflow runs require head_sha. Reject a missing or malformed SHA
  // instead of silently treating an active run as head-agnostic.
  const headSha = run.head_sha ?? run.headSha;
  if (typeof headSha !== 'string' || !exactSha(headSha.toLowerCase())) {
    return false;
  }
  return true;
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
    throw new Error('currentMainSha must be an exact 40-character SHA');
  }

  const parsedInput = parseInput(input);
  if (!parsedInput.valid) {
    return {
      ...decision,
      hold: true,
      reason: 'controller-state-malformed',
    };
  }

  const runsById = new Map();
  for (const candidate of parsedInput.runs) {
    if (!structurallyValidRun(candidate)) {
      return {
        ...decision,
        hold: true,
        reason: 'controller-state-malformed',
      };
    }
    const run = normalizeRun(candidate);
    if (run && !runsById.has(run.id)) runsById.set(run.id, run);
  }
  const runs = [...runsById.values()].sort(
    (left, right) => left.createdAt - right.createdAt
  );
  const maxAgeMs = maxAgeSeconds * 1000;
  const futureRun = runs.find(run => run.createdAt > nowMs);
  if (futureRun) {
    // A future created_at cannot produce a stable expiry without introducing
    // another durable observation ledger. Keep the decision unknown and let
    // the workflow block admission until the authoritative run clock is sane.
    return {
      ...decision,
      hold: true,
      reason: 'controller-state-malformed',
      activeRunId: futureRun.id,
      activeRunHeadSha: futureRun.headSha || null,
      activeRunStatus: futureRun.status,
    };
  }
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
  const expiresAtMs = selected.createdAt + maxAgeMs;
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
        hold: true,
        reason: 'controller-state-malformed',
        expiresAt: null,
      }) + '\n'
    );
    return 2;
  }

  const decision = classifyReleaseWave(value, {
    currentMainSha: args['main-sha'],
    maxAgeSeconds: args['max-age-seconds'],
  });
  write(`${JSON.stringify(decision)}\n`);
  return decision.reason === 'controller-state-malformed' ? 2 : 0;
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
