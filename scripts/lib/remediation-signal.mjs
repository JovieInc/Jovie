import { stripVTControlCharacters } from 'node:util';
import {
  findLinearLabelId,
  noteFingerprintedIssueGreen,
  remediationKey,
  upsertLinearIssueByTitleFingerprint,
} from './linear-issue-intake.mjs';

export const GREEN_MARKER = '<!-- remediation-green -->';
/** Lanes claim only this label, so a red signal must carry it to get worked. */
export const AGENT_READY_LABEL = 'agent-ready';

export const POSTDEPLOY_QUOTA_FINGERPRINT =
  'github-quota-deferred-postdeploy-probes';

const LOGIN_RE = /auth\.setup|authenticate|sign-?in|login/i;
const TIMEOUT_RE =
  /timed\s*out|TimeoutError|\btimeout(?:\s+of)?\s+\d+\s*ms\s+exceeded|\btimeout:\s*\d+\s*ms\b/i;

function diagnosticText(text) {
  return stripVTControlCharacters(String(text ?? ''))
    .split('\n')
    .filter(
      line =>
        !line.includes('[WebServer]') && !/^\s*(?:>\s*)?\d+\s*\|/.test(line)
    )
    .join('\n');
}

/** Filing is on unless this exact kill switch is set. Unset does not dry-run. */
export function remediationIntakeDisabled(env = process.env) {
  return env.REMEDIATION_INTAKE_DISABLED === '1';
}

export function remediationTitle(fingerprint) {
  if (fingerprint === POSTDEPLOY_QUOTA_FINGERPRINT)
    return `GitHub quota deferred post-deploy probes (${fingerprint})`;
  return `P0: ${fingerprint} is red (${fingerprint})`;
}

export function describeRemediation({ fingerprint, source, runUrl, detail }) {
  return [
    `Source-workflow: ${source}`,
    '',
    '## Evidence',
    detail?.trim() || 'Red run. See the linked workflow for logs.',
    '',
    '## Run',
    runUrl || '(run url unavailable)',
    '',
    `Label: ${remediationKey(fingerprint)}`,
  ].join('\n');
}

function walkSuite(suite, hits) {
  const prefix = `${suite?.file ?? ''} ${suite?.title ?? ''}`;
  for (const spec of suite?.specs ?? []) {
    const title = `${prefix} ${spec?.title ?? ''}`.trim();
    for (const test of spec?.tests ?? []) {
      for (const result of test?.results ?? []) {
        const message = diagnosticText(result?.error?.message);
        const timedOut =
          result?.status === 'timedOut' || TIMEOUT_RE.test(message);
        if (timedOut && LOGIN_RE.test(`${title}\n${message}`)) hits.push(title);
      }
    }
  }
  for (const child of suite?.suites ?? []) walkSuite(child, hits);
}

export function loginTimeoutHits(report) {
  const hits = [];
  for (const suite of report?.suites ?? []) walkSuite(suite, hits);
  return hits;
}

export function textHasLoginTimeout(text) {
  // Attribute a diagnostic to its own failed test. Progress from another
  // test and source options such as `timeout: 60_000` are not failures.
  let block = [];
  const hit = () =>
    LOGIN_RE.test(block.join('\n')) && TIMEOUT_RE.test(block.join('\n'));
  for (const line of diagnosticText(text).split('\n')) {
    const progress =
      /^\s*(?:[✓×✘-]\s*)?(?:\d+|\[\d+\/\d+\])\s+\[[^\]]+\]\s+›/.test(line);
    if (progress || /^\s*\d+\)\s+/.test(line)) {
      if (hit()) return true;
      block = [];
    }
    if (!progress) block.push(line);
  }
  return hit();
}

/** Read only the current exact attempt; never combine passing jobs from reruns. */
export async function readLoginMatrixEvidence({
  repository,
  runId,
  attempt,
  sha,
  source,
  runUrl,
  token,
  fetchImpl = fetch,
}) {
  const hold = reason => ({ ok: false, reason });
  if (
    repository !== 'JovieInc/Jovie' ||
    !token ||
    !/^[1-9]\d*$/.test(runId ?? '') ||
    !Number.isSafeInteger(Number(runId)) ||
    !/^[1-9]\d*$/.test(attempt ?? '') ||
    !Number.isSafeInteger(Number(attempt)) ||
    !/^[a-f0-9]{40}$/.test(sha ?? '') ||
    !/^e2e-full-matrix\.yml:(chromium|firefox)$/.test(source ?? '') ||
    runUrl !== `https://github.com/${repository}/actions/runs/${runId}`
  )
    return hold('matrix_context_unavailable');
  const base = `https://api.github.com/repos/${repository}/actions/runs/${runId}`;
  const read = async url => {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('matrix-read-unavailable');
    return {
      data: await response.json(),
      hasNext: /;\s*rel="next"/.test(response.headers.get('link') ?? ''),
    };
  };
  const matchesRun = run =>
    run?.id === Number(runId) &&
    run.run_attempt === Number(attempt) &&
    run.head_sha === sha &&
    run.path === '.github/workflows/e2e-full-matrix.yml' &&
    run.event === 'push' &&
    run.head_branch === 'main' &&
    run.repository?.full_name === repository;
  try {
    // This is the latest run record, not an archived attempt: stale delivery
    // cannot borrow an earlier attempt's successful siblings.
    const { data: run } = await read(base);
    if (!matchesRun(run)) return hold('matrix_run_mismatch');

    const jobs = [];
    let total;
    for (let page = 1; page <= 5; page += 1) {
      const { data: result, hasNext } = await read(
        `${base}/attempts/${attempt}/jobs?per_page=100&page=${page}`
      );
      if (
        !Number.isSafeInteger(result.total_count) ||
        result.total_count < 1 ||
        !Array.isArray(result.jobs) ||
        result.jobs.length > 100 ||
        (total !== undefined && total !== result.total_count)
      )
        return hold('matrix_pagination_incomplete');
      total = result.total_count;
      jobs.push(...result.jobs);
      if (jobs.length === total) {
        if (hasNext) return hold('matrix_pagination_incomplete');
        break;
      }
      if (jobs.length > total || result.jobs.length < 100 || page === 5)
        return hold('matrix_pagination_incomplete');
    }
    if (new Set(jobs.map(job => job?.id)).size !== jobs.length)
      return hold('matrix_duplicate_job');
    const required = [
      'Build standalone E2E server',
      ...['chromium', 'firefox'].flatMap(browser =>
        [1, 2, 3, 4].map(
          shard => `E2E (Chrome + Firefox) (${browser}, ${shard})`
        )
      ),
    ];
    if (
      jobs.some(
        job =>
          job?.name?.startsWith('E2E (Chrome + Firefox)') &&
          !required.includes(job.name)
      )
    )
      return hold('matrix_unknown_shard');
    for (const name of required) {
      const matches = jobs.filter(job => job?.name === name);
      if (matches.length !== 1)
        return hold(`matrix_job_missing_or_duplicate:${name}`);
      const job = matches[0];
      if (
        !Number.isSafeInteger(job.id) ||
        job.id < 1 ||
        job.run_id !== Number(runId) ||
        job.head_sha !== sha ||
        (job.run_attempt !== undefined && job.run_attempt !== Number(attempt))
      )
        return hold('matrix_job_identity_mismatch');
      if (
        job.status !== 'completed' ||
        job.conclusion !== 'success' ||
        typeof job.completed_at !== 'string' ||
        !Number.isFinite(Date.parse(job.completed_at))
      )
        return hold(
          `matrix_job_not_success:${name}:${job.status}/${job.conclusion ?? 'unknown'}`
        );
    }
    // Revalidate after pagination so an attempt change during the read holds.
    if (!matchesRun((await read(base)).data)) return hold('matrix_run_changed');
    return { ok: true, source, runId, attempt, sha };
  } catch {
    return hold('matrix_evidence_unavailable');
  }
}

export function isLoginTimeout({ text = '', report = null } = {}) {
  return loginTimeoutHits(report).length > 0 || textHasLoginTimeout(text);
}

export function decideLoginSignal({
  conclusion,
  evidenceText = '',
  report = null,
  source = '',
  matrixEvidence,
}) {
  if (!conclusion || conclusion === 'skipped') return { action: 'skip' };
  if (conclusion === 'success') {
    if (
      source.startsWith('e2e-full-matrix.yml:') &&
      (matrixEvidence?.ok !== true || matrixEvidence.source !== source)
    ) {
      return {
        action: 'skip',
        reason: matrixEvidence?.reason ?? 'matrix_not_qualified',
      };
    }
    return { action: 'green', fingerprints: ['e2e-login-timeout'] };
  }
  // Cancelled runs are superseded by the concurrency group's newer run, which
  // files its own signal; shutdown-induced timeouts are not login evidence.
  if (
    conclusion === 'failure' &&
    isLoginTimeout({ text: evidenceText, report })
  ) {
    const hits = loginTimeoutHits(report);
    return {
      action: 'red',
      fingerprint: 'e2e-login-timeout',
      detail: hits.length
        ? `Login timeout in: ${hits.slice(0, 5).join('; ')}`
        : 'Login timeout evidence in the Playwright log.',
    };
  }
  return { action: 'skip' };
}

/** @param {{ jobResult?: string, authStatus?: string, loginTimeout?: boolean | string }} [input] */
export function decideAuthSmokeSignal(input = {}) {
  const jobResult = input.jobResult;
  const authStatus = input.authStatus ?? '';
  const loginTimeout = input.loginTimeout;
  if (
    !jobResult ||
    jobResult === 'skipped' ||
    authStatus === 'not-configured'
  ) {
    return { action: 'skip' };
  }
  if (jobResult === 'success' && authStatus === 'passed') {
    return {
      action: 'green',
      fingerprints: ['e2e-login-timeout', 'production-monitor-auth-smoke'],
    };
  }
  const timedOut =
    jobResult === 'cancelled' ||
    loginTimeout === true ||
    loginTimeout === 'true';
  if (timedOut) {
    return {
      action: 'red',
      fingerprint: 'e2e-login-timeout',
      detail:
        jobResult === 'cancelled'
          ? 'Post-deploy auth smoke job timed out.'
          : 'Post-deploy auth smoke reported a login timeout.',
    };
  }
  if (jobResult === 'failure') {
    return {
      action: 'red',
      fingerprint: 'production-monitor-auth-smoke',
      detail:
        'Post-deploy auth smoke failed without a login-timeout classification.',
    };
  }
  return { action: 'skip' };
}

export function decideMonitorSignal({ conclusion, fingerprint = '' }) {
  if (conclusion === 'success') {
    return fingerprint === 'production-monitor-postdeploy-probes'
      ? {
          action: 'green',
          fingerprints: [fingerprint, POSTDEPLOY_QUOTA_FINGERPRINT],
        }
      : { action: 'green' };
  }
  if (conclusion === 'quota-deferred') {
    // Every hard quota needs a standing canary (infra guardrail #2): a
    // deferred post-deploy read must surface, not vanish into a green skip.
    // The intake action files a low-priority quota canary, not a P0 outage.
    return {
      action: 'red',
      fingerprint: POSTDEPLOY_QUOTA_FINGERPRINT,
      detail:
        'Post-deploy probe reads deferred on GitHub installation quota; probes retried on the next Production Controller completion.',
    };
  }
  if (conclusion === 'failure' || conclusion === 'cancelled')
    return { action: 'red' };
  return { action: 'skip' };
}

/** Steady green skips Linear. The first green after a recorded red still resolves. */
export function gateSteadyGreen(decision, previous, enabled) {
  if (enabled !== '1' || decision?.action !== 'green') return decision;
  if (previous === 'red') return decision;
  return { action: 'skip', reason: 'steady_green' };
}

export async function fileRemediationSignal({
  fingerprint,
  source,
  runUrl,
  detail,
  apiKey,
  fetchImpl,
}) {
  // A missing ready label must not drop the P0 itself.
  const ready = apiKey
    ? await findLinearLabelId({ name: AGENT_READY_LABEL, apiKey, fetchImpl })
    : { ok: false };
  return upsertLinearIssueByTitleFingerprint({
    fingerprint,
    title: remediationTitle(fingerprint),
    description: describeRemediation({ fingerprint, source, runUrl, detail }),
    priority: fingerprint === POSTDEPLOY_QUOTA_FINGERPRINT ? 3 : 1,
    createStateName: 'Todo',
    keepLabelIds: ready.ok && ready.id ? [ready.id] : [],
    reopenTerminal: true,
    apiKey,
    fetchImpl,
  });
}

export async function resolveRemediationSignal({
  fingerprint,
  source,
  runUrl,
  apiKey,
  fetchImpl,
}) {
  const sourceLine = `Source-workflow: ${source}`;
  return noteFingerprintedIssueGreen({
    fingerprint,
    source,
    commentMarker: GREEN_MARKER,
    comment: `${GREEN_MARKER}\n${sourceLine} is green.\nRun: ${runUrl || '(run url unavailable)'}`,
    apiKey,
    fetchImpl,
  });
}

const TRANSIENT_FAILURE_RE = /_(transport|5\d\d)$/;

/**
 * Linear filing can hit short-lived upstream 5xx/transport resets; only those
 * reasons are worth retrying inside the intake job's timeout.
 */
export function isTransientRemediationFailure(result) {
  return !result?.ok && TRANSIENT_FAILURE_RE.test(String(result?.reason ?? ''));
}

/** @param {any} decision @param {any} [context] */
export async function applyRemediationDecision(decision = {}, context = {}) {
  const { fingerprint, source, runUrl, detail, apiKey, fetchImpl } = context;
  if (!decision || decision.action === 'skip') {
    return { ok: true, action: 'skip' };
  }
  if (decision.action === 'red') {
    const key = decision.fingerprint || fingerprint;
    const filed = await fileRemediationSignal({
      fingerprint: key,
      source,
      runUrl,
      detail: decision.detail || detail,
      apiKey,
      fetchImpl,
    });
    return { ...filed, fingerprint: key };
  }
  const keys = decision.fingerprints ?? [fingerprint];
  const results = [];
  for (const key of keys) {
    const resolved = await resolveRemediationSignal({
      fingerprint: key,
      source,
      runUrl,
      apiKey,
      fetchImpl,
    });
    results.push({ ...resolved, fingerprint: key });
    if (!resolved.ok) return { ok: false, action: 'green', results };
  }
  return { ok: true, action: 'green', results };
}

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry transient Linear upstream failures before letting the intake fail.
 * Permanent failures (missing key, 4xx, GraphQL errors) return immediately.
 */
export async function applyRemediationDecisionWithRetry(
  decision = {},
  context = {},
  { attempts = 3, delaysMs = [5_000, 15_000], sleep = defaultSleep } = {}
) {
  let result = await applyRemediationDecision(decision, context);
  for (
    let i = 0;
    i < attempts - 1 && isTransientRemediationFailure(result);
    i += 1
  ) {
    await sleep(delaysMs[Math.min(i, delaysMs.length - 1)]);
    result = await applyRemediationDecision(decision, context);
  }
  return result;
}
