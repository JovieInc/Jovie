#!/usr/bin/env node
/** Detector intake. Files unless REMEDIATION_INTAKE_DISABLED=1. */
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { failedOnLinearRateLimit } from './lib/linear-retry.mjs';
import { noteRecurrence } from './lib/remediation-recurrence.mjs';
import {
  applyRemediationDecisionWithRetry,
  decideAuthSmokeSignal,
  decideLoginSignal,
  decideMonitorSignal,
  gateSteadyGreen,
  isLoginTimeout,
  readLoginMatrixEvidence,
  remediationIntakeDisabled,
} from './lib/remediation-signal.mjs';
import {
  acknowledgedWorkflowScope,
  workflowOutcomeProof,
  workflowRedBinding,
} from './lib/workflow-outcome-proof.mjs';

function readText(path) {
  if (!path) return '';
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function readJson(path) {
  const text = readText(path);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

if (process.argv[2] === '--detect-login') {
  const text = readText(process.argv[3]);
  const report = readJson(process.argv[4]);
  process.stdout.write(isLoginTimeout({ text, report }) ? 'true\n' : 'false\n');
  process.exit(0);
}

const env = process.env;

async function decision() {
  const mode = env.REMEDIATION_MODE;
  if (mode === 'login') {
    const source = env.REMEDIATION_SOURCE ?? '';
    const matrixEvidence =
      env.REMEDIATION_CONCLUSION === 'success' &&
      source.startsWith('e2e-full-matrix.yml:')
        ? await readLoginMatrixEvidence({
            repository: env.GITHUB_REPOSITORY,
            runId: env.GITHUB_RUN_ID,
            attempt: env.GITHUB_RUN_ATTEMPT,
            sha: env.GITHUB_SHA,
            source,
            runUrl: env.REMEDIATION_RUN_URL,
            token: env.GITHUB_TOKEN,
          })
        : undefined;
    if (matrixEvidence && env.GITHUB_OUTPUT) {
      appendFileSync(
        env.GITHUB_OUTPUT,
        `login_matrix_qualified=${matrixEvidence.ok}\n`
      );
    }
    return decideLoginSignal({
      conclusion: env.REMEDIATION_CONCLUSION,
      evidenceText: readText(env.REMEDIATION_EVIDENCE_LOG),
      report: readJson(env.REMEDIATION_EVIDENCE_JSON),
      source,
      matrixEvidence,
    });
  }
  if (mode === 'auth-smoke') {
    return decideAuthSmokeSignal({
      jobResult: env.REMEDIATION_JOB_RESULT,
      authStatus: env.REMEDIATION_AUTH_STATUS,
      loginTimeout: env.REMEDIATION_LOGIN_TIMEOUT,
    });
  }
  if (mode === 'monitor') {
    const decided = decideMonitorSignal({
      conclusion: env.REMEDIATION_CONCLUSION,
      fingerprint: env.REMEDIATION_FINGERPRINT,
    });
    return {
      ...decided,
      fingerprint: decided.fingerprint || env.REMEDIATION_FINGERPRINT,
    };
  }
  return { action: 'skip', reason: 'unknown_mode' };
}

if (remediationIntakeDisabled(env)) {
  console.log(JSON.stringify({ ok: true, action: 'disabled' }));
  process.exit(0);
}

const cached = readText(env.REMEDIATION_PREVIOUS_FILE).trim();
const scoped =
  env.REMEDIATION_WORKFLOW_PROOF === '1'
    ? workflowOutcomeProof({
        cached,
        source: env.REMEDIATION_SOURCE,
        results: env.REMEDIATION_WORKFLOW_RESULTS,
        conclusion: env.REMEDIATION_CONCLUSION,
        job: env.GITHUB_JOB,
        identity: {
          id: env.GITHUB_RUN_ID,
          number: env.GITHUB_RUN_NUMBER,
          attempt: env.GITHUB_RUN_ATTEMPT,
          sha: env.GITHUB_SHA,
        },
      })
    : null;
const decided = await decision();
const chosen = scoped
  ? { ...decided, action: scoped.action, reason: scoped.reason }
  : decided;
if ('reason' in chosen && chosen.reason === 'unknown_mode') {
  console.error('remediation-signal-intake: set REMEDIATION_MODE');
  process.exit(1);
}

const previous = scoped?.previous ?? cached;
const gated = gateSteadyGreen(
  chosen,
  previous,
  env.REMEDIATION_GATE_STEADY_GREEN
);
const result = await applyRemediationDecisionWithRetry(gated, {
  fingerprint: gated.fingerprint || env.REMEDIATION_FINGERPRINT,
  source: env.REMEDIATION_SOURCE,
  runUrl: env.REMEDIATION_RUN_URL,
  detail: gated.detail || env.REMEDIATION_DETAIL,
  apiKey: env.LINEAR_API_KEY,
  ...(scoped
    ? {
        redBinding: workflowRedBinding(
          gated.action === 'red' ? scoped.state?.lastRed : scoped.lastRed
        ),
        recoveryProof: scoped.proof,
      }
    : {}),
});
const recurrence =
  gated.action === 'red'
    ? await noteRecurrence(result, {
        fingerprint: gated.fingerprint || env.REMEDIATION_FINGERPRINT,
        runUrl: env.REMEDIATION_RUN_URL,
        apiKey: env.LINEAR_API_KEY,
      })
    : { ok: true, action: 'none' };
if (!recurrence.ok) {
  console.warn(
    `::warning title=Recurrence not recorded::${gated.fingerprint || env.REMEDIATION_FINGERPRINT} reopened but the recurrence comment failed (${recurrence.reason}).`
  );
}
console.log(
  JSON.stringify({
    ...result,
    ...(gated.reason ? { reason: gated.reason } : {}),
    ...(recurrence.action === 'none' ? {} : { recurrence }),
    previous: previous || null,
  })
);
const resultAction = 'action' in result ? result.action : undefined;
if (result.ok && resultAction === 'hold') {
  // Visible, never silent: an unresolved incident stays open while evidence is unknown.
  console.log(
    `::warning title=Remediation held::${gated.fingerprint || env.REMEDIATION_FINGERPRINT} not resolved: ${'reason' in result ? result.reason : 'workflow_evidence_unavailable'} (previous state: ${previous || 'none'}). Detail: ${env.REMEDIATION_DETAIL || 'n/a'}`
  );
}
const recorded =
  gated.action === 'red' || (result.ok && resultAction === 'green');
const workflowState = acknowledgedWorkflowScope(scoped, result);
const nextState = scoped
  ? workflowState &&
    (recorded ||
      gated.action === 'hold' ||
      (gated.action === 'skip' && scoped.action === 'green')) &&
    JSON.stringify(workflowState)
  : result.ok && recorded && gated.action;
if (env.REMEDIATION_STATE_FILE && nextState) {
  mkdirSync(dirname(env.REMEDIATION_STATE_FILE), { recursive: true });
  writeFileSync(env.REMEDIATION_STATE_FILE, `${nextState}\n`);
}
const healthy = gated.action !== 'red';
if (!result.ok && gated.action === 'green' && failedOnLinearRateLimit(result)) {
  // Resolution work deferred on the shared Linear budget: the state file is
  // untouched (previous state survives) so the next run re-resolves. Exit 75
  // (EX_TEMPFAIL) mirrors the GitHub quota-deferred convention; a real red
  // signal below still exits 1.
  console.warn(
    `::warning title=Linear quota deferred::${gated.fingerprint || env.REMEDIATION_FINGERPRINT} resolve deferred on Linear rate limit (linear_rate_limited); resumes on the next run. Previous state: ${previous || 'none'}.`
  );
  process.exit(75);
}
if (!result.ok && env.REMEDIATION_FAIL_OPEN === '1' && healthy) {
  console.warn(
    '::warning::Linear intake failed while production is healthy; continuing.'
  );
  process.exit(0);
}
if (!result.ok) process.exit(1);
