#!/usr/bin/env node
/** Detector intake. Files unless REMEDIATION_INTAKE_DISABLED=1. */
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

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

const chosen = await decision();
if ('reason' in chosen && chosen.reason === 'unknown_mode') {
  console.error('remediation-signal-intake: set REMEDIATION_MODE');
  process.exit(1);
}

const previous = readText(env.REMEDIATION_PREVIOUS_FILE).trim();
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
});
console.log(
  JSON.stringify({
    ...result,
    ...(gated.reason ? { reason: gated.reason } : {}),
    previous: previous || null,
  })
);
if (
  result.ok &&
  env.REMEDIATION_STATE_FILE &&
  (gated.action === 'red' || gated.action === 'green')
) {
  mkdirSync(dirname(env.REMEDIATION_STATE_FILE), { recursive: true });
  writeFileSync(
    env.REMEDIATION_STATE_FILE,
    `${gated.action === 'red' ? 'red' : 'green'}\n`
  );
}
const healthy = gated.action !== 'red';
if (!result.ok && env.REMEDIATION_FAIL_OPEN === '1' && healthy) {
  console.warn(
    '::warning::Linear intake failed while production is healthy; continuing.'
  );
  process.exit(0);
}
if (!result.ok) process.exit(1);
