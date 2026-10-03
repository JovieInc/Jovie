import {
  findLinearLabelId,
  noteFingerprintedIssueGreen,
  remediationKey,
  upsertLinearIssueByTitleFingerprint,
} from './linear-issue-intake.mjs';

export const GREEN_MARKER = '<!-- remediation-green -->';
/** Lanes claim only this label, so a red signal must carry it to get worked. */
export const AGENT_READY_LABEL = 'agent-ready';

const LOGIN_RE = /auth\.setup|authenticate|sign-?in|login/i;
const TIMEOUT_RE = /timedout|timed\s*out|timeout/i;

/** Filing is on unless this exact kill switch is set. Unset does not dry-run. */
export function remediationIntakeDisabled(env = process.env) {
  return env.REMEDIATION_INTAKE_DISABLED === '1';
}

export function remediationTitle(fingerprint) {
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
        const message = String(result?.error?.message ?? '');
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
  // Dev-server route logs (`[WebServer] GET /signin 200`) are not login
  // evidence but interleave with unrelated test timeouts; drop them so the
  // sliding window can't pair a route hit with a stray `Timeout:` line.
  const lines = String(text ?? '')
    .split('\n')
    .filter(line => !line.includes('[WebServer]'));
  for (let i = 0; i < lines.length; i += 1) {
    const window = lines.slice(i, i + 12).join('\n');
    if (LOGIN_RE.test(window) && TIMEOUT_RE.test(window)) return true;
  }
  return false;
}

export function isLoginTimeout({ text = '', report = null } = {}) {
  return loginTimeoutHits(report).length > 0 || textHasLoginTimeout(text);
}

export function decideLoginSignal({
  conclusion,
  evidenceText = '',
  report = null,
}) {
  if (!conclusion || conclusion === 'skipped') return { action: 'skip' };
  if (conclusion === 'success') {
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

export function decideMonitorSignal({ conclusion }) {
  if (conclusion === 'success') return { action: 'green' };
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
    priority: 1,
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
