import { spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STRUCTURAL_DEFAULT_CONCURRENCY,
  selectLanes,
} from '../../ci-fast-lanes.mjs';

vi.mock('node:child_process', async importOriginal => {
  const actual = /** @type {typeof import('node:child_process')} */ (
    await importOriginal()
  );
  return {
    ...actual,
    spawn: vi.fn(actual.spawn),
    spawnSync: vi.fn(actual.spawnSync),
  };
});

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const RELEASE_WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/production-release.yml'),
  'utf8'
);
const CONTROLLER_WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/production-controller.yml'),
  'utf8'
);
const EXPECTED_SHA = 'a'.repeat(40);
const NEWER_SHA = 'b'.repeat(40);
const DEPLOYMENT_ID = 'dpl_exact_generation';
const DEPLOYMENT_URL = 'https://jovie-exact-generation-jovie.vercel.app';
const tempRoots = [];

describe('production verification admission', () => {
  const job = getJobBlock(CONTROLLER_WORKFLOW, 'production-verified');
  const condition = job.match(/if: >-\s*\$\{\{([\s\S]*?)\}\}/)?.[1];
  if (!condition) throw new Error('Missing production verification condition');
  // Evaluate the actual workflow expression with GitHub's JSON and status
  // primitives so an empty skipped-job output cannot hide behind YAML parsing.
  const evaluate = new Function(
    'needs',
    'fromJSON',
    'always',
    `return (${condition.replace(/needs\.([\w-]+)/g, "needs['$1']")});`
  );
  const admission = (result, ci, authorized = 'success', verified = 'false') =>
    evaluate(
      {
        'release-source': { result, outputs: { ci } },
        'authorize-production': {
          result: authorized,
          outputs: { already_verified: verified },
        },
      },
      JSON.parse,
      () => true
    );

  it('skips verification safely when source resolution has no receipt', () => {
    for (const result of ['skipped', 'failure', 'cancelled']) {
      expect(admission(result, '', 'skipped')).toBe(false);
    }
    expect(admission('success', '')).toBe(false);
  });

  it('requires a push receipt and successful unverified authorization', () => {
    const push = JSON.stringify({ event: 'push' });
    expect(admission('success', push)).toBe(true);
    expect(
      admission('success', JSON.stringify({ event: 'pull_request' }))
    ).toBe(false);
    expect(admission('success', push, 'failure')).toBe(false);
    expect(admission('success', push, 'success', 'true')).toBe(false);
    expect(() => admission('success', '{malformed')).toThrow();
  });
});

afterEach(() => {
  vi.mocked(spawnSync).mockRestore();
  vi.mocked(spawn).mockRestore();
  vi.unstubAllEnvs();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function getJobBlock(workflow, jobKey) {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line === `  ${jobKey}:`);
  if (start < 0) throw new Error(`Missing workflow job: ${jobKey}`);
  const block = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (index > start && /^  [a-zA-Z0-9_-]+:/.test(line)) break;
    block.push(line);
  }
  return block.join('\n');
}

function getStepRunScript(jobBlock, stepName) {
  const lines = jobBlock.split('\n');
  const stepStart = lines.findIndex(
    line => line === `      - name: ${stepName}`
  );
  if (stepStart < 0) throw new Error(`Missing workflow step: ${stepName}`);
  const stepEnd = lines.findIndex(
    (line, index) => index > stepStart && /^      - /.test(line)
  );
  const stepLines = lines.slice(
    stepStart,
    stepEnd === -1 ? lines.length : stepEnd
  );
  const runStart = stepLines.findIndex(line => line === '        run: |');
  if (runStart < 0) throw new Error(`Missing run block: ${stepName}`);
  return stepLines
    .slice(runStart + 1)
    .map(line => line.replace(/^ {10}/, ''))
    .join('\n');
}

function materialize(script, values) {
  const rendered = script.replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_, rawKey) => {
    const key = rawKey.trim();
    if (key === 'inputs.release_mode') return 'production';
    if (!Object.hasOwn(values, key)) {
      throw new Error(`Missing workflow expression fixture: ${key}`);
    }
    return values[key];
  });
  if (rendered.includes('${{')) {
    throw new Error('Unresolved workflow expression in rendered script');
  }
  return rendered;
}

function makeFixture(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(root);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const output = join(root, 'github-output');
  writeFileSync(output, '');
  return { root, bin, output };
}

function stubCommand(bin, name, source) {
  const path = join(bin, name);
  writeFileSync(path, source);
  chmodSync(path, 0o755);
}

function parseOutputs(path) {
  const values = {};
  for (const line of readFileSync(path, 'utf8').trim().split('\n')) {
    if (!line) continue;
    const separator = line.indexOf('=');
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

function runScript(script, fixture, env = {}) {
  return spawnSync('bash', ['-c', script], {
    cwd: fixture.root,
    encoding: 'utf8',
    timeout: 20_000,
    env: {
      ...process.env,
      ...env,
      GITHUB_OUTPUT: fixture.output,
      GITHUB_WORKSPACE: REPO_ROOT,
      PATH: `${fixture.bin}${delimiter}${process.env.PATH || ''}`,
      RUNNER_TEMP: fixture.root,
    },
  });
}

function releaseExpressions(overrides = {}) {
  return {
    "needs.migrate-production.outputs.schema_drift == 'true'": 'false',
    'inputs.staging_verified': 'true',
    'needs.promote-production.outputs.failure_subtype': '',
    'needs.sentry-error-gate.outputs.gate_status': 'passed',
    'needs.production-oauth-gate.outputs.gate_status': 'passed',
    'needs.release-head.result': 'success',
    'needs.release-head.outputs.is_current': 'true',
    'needs.staging-head.result': 'success',
    'needs.staging-head.outputs.is_current': 'true',
    'needs.alias-staging.result': 'success',
    'needs.alias-staging.outputs.is_current': 'true',
    'needs.production-head.result': 'success',
    'needs.production-head.outputs.is_current': 'true',
    'needs.promote-production.result': 'success',
    'needs.sentry-error-gate.result': 'success',
    'needs.production-oauth-gate.result': 'success',
    'needs.rollback-production.result': 'skipped',
    'needs.rollback-production.outputs.rolled_back': '',
    'needs.staging-deployment-receipt.outputs.staging_refresh_outcome':
      'current_receipt',
    'needs.staging-deployment-receipt.outputs.deployed': 'true',
    'needs.staging-deployment-receipt.result': 'success',
    'needs.migrate-production.result': 'success',
    'needs.deploy-staging.result': 'success',
    'needs.attest-staging-build.result': 'success',
    'needs.canary-health-gate.result': 'success',
    'needs.production-public-profile-alias-gate.result': 'success',
    'github.repository': 'JovieInc/Jovie',
    ...overrides,
  };
}

function runReleaseResult(overrides = {}, boundarySha = NEWER_SHA, env = {}) {
  const fixture = makeFixture('release-result-');
  stubCommand(
    fixture.bin,
    'gh',
    '#!/bin/sh\nprintf "%s\\n" "$STUB_MAIN_SHA"\n'
  );
  const script = materialize(
    getStepRunScript(
      getJobBlock(RELEASE_WORKFLOW, 'release-result'),
      'Resolve release result'
    ),
    releaseExpressions(overrides)
  );
  const result = runScript(script, fixture, {
    EXPECTED_SHA,
    PROMOTION_SHA: EXPECTED_SHA,
    PRODUCTION_DEPLOYMENT_ID: DEPLOYMENT_ID,
    PRODUCTION_DEPLOYMENT_URL_B64:
      Buffer.from(DEPLOYMENT_URL).toString('base64'),
    PREVIOUS_PRODUCTION_DEPLOYMENT_ID: 'dpl_previous_generation',
    STUB_MAIN_SHA: boundarySha,
    ...env,
  });
  return { result, outputs: parseOutputs(fixture.output) };
}

function controllerVerifyExpressions(overrides = {}) {
  return {
    'needs.authorize-production.result': 'success',
    'needs.authorize-production.outputs.authorized': 'true',
    'needs.production-release.result': 'success',
    'needs.production-release.outputs.released': 'true',
    'needs.production-release.outputs.superseded_before_promotion': 'false',
    'needs.ci-public-profile-smoke.result': 'success',
    'needs.lighthouse-ci.result': 'success',
    'needs.ci-post-deploy-auth-smoke.result': 'success',
    'needs.ci-post-deploy-auth-smoke.outputs.auth_smoke_status': 'passed',
    'needs.ci-post-deploy-auth-smoke.outputs.credentials_configured': 'true',
    'github.repository': 'JovieInc/Jovie',
    ...overrides,
  };
}

function runControllerVerify(
  overrides = {},
  aliasStatus = 0,
  { doneSprintStatus = 0 } = {}
) {
  const fixture = makeFixture('controller-verify-');
  const aliasMarker = join(fixture.root, 'alias-called');
  const doneSprintMarker = join(fixture.root, 'done-sprint-called');
  stubCommand(
    fixture.bin,
    'gh',
    '#!/bin/sh\nprintf "%s\\n" "$STUB_MAIN_SHA"\n'
  );
  stubCommand(
    fixture.bin,
    'node',
    `#!/bin/sh
printf '%s\\n' "$*" > "$STUB_DONE_SPRINT_MARKER"
printf 'rescan=%s\\nurl=%s\\n' "$DONE_INVARIANT_RESCAN" "$DONE_INVARIANT_PRODUCTION_BASE_URL" >> "$STUB_DONE_SPRINT_MARKER"
exit "$STUB_DONE_SPRINT_STATUS"
`
  );
  const aliasScript = join(
    fixture.root,
    '.github/scripts/verify-production-alias.sh'
  );
  mkdirSync(dirname(aliasScript), { recursive: true });
  writeFileSync(
    aliasScript,
    '#!/bin/sh\nprintf "called\\n" > "$STUB_ALIAS_MARKER"\nexit "$STUB_ALIAS_STATUS"\n'
  );
  chmodSync(aliasScript, 0o755);
  const script = materialize(
    getStepRunScript(
      getJobBlock(CONTROLLER_WORKFLOW, 'production-verified'),
      'Require exact deployment and every post-deploy probe'
    ),
    controllerVerifyExpressions(overrides)
  );
  const result = runScript(script, fixture, {
    EXPECTED_COMMIT_SHA: EXPECTED_SHA,
    EXPECTED_PRODUCTION_DEPLOYMENT_ID: DEPLOYMENT_ID,
    PRODUCTION_DEPLOYMENT_URL_B64:
      Buffer.from(DEPLOYMENT_URL).toString('base64'),
    STUB_ALIAS_MARKER: aliasMarker,
    STUB_ALIAS_STATUS: String(aliasStatus),
    STUB_DONE_SPRINT_MARKER: doneSprintMarker,
    STUB_DONE_SPRINT_STATUS: String(doneSprintStatus),
    STUB_MAIN_SHA: NEWER_SHA,
  });
  return {
    aliasCalled: existsSync(aliasMarker),
    doneSprintCalled: existsSync(doneSprintMarker)
      ? readFileSync(doneSprintMarker, 'utf8')
      : '',
    result,
    outputs: parseOutputs(fixture.output),
  };
}

function finalizeExpressions(overrides = {}) {
  return {
    'steps.verify.outcome': 'success',
    'steps.verify.outputs.canonical_verified': 'true',
    'steps.verify.outputs.canonical_deployment_id': DEPLOYMENT_ID,
    'steps.verify.outputs.canonical_sha': EXPECTED_SHA,
    'needs.authorize-production.outputs.authorized': 'true',
    'needs.production-release.result': 'success',
    'needs.ci-public-profile-smoke.result': 'success',
    'needs.ci-post-deploy-auth-smoke.result': 'success',
    'needs.lighthouse-ci.result': 'success',
    'needs.production-release.outputs.sentry_gate_status': 'passed',
    'needs.production-release.outputs.oauth_gate_status': 'passed',
    'github.repository': 'JovieInc/Jovie',
    'github.run_id': '1234',
    'github.run_attempt': '1',
    ...overrides,
  };
}

function runFinalize(overrides = {}, boundarySha = NEWER_SHA) {
  const fixture = makeFixture('controller-finalize-');
  const marker = join(fixture.root, 'production-generation-verified.json');
  mkdirSync(join(fixture.root, 'release-lineage'), { recursive: true });
  writeFileSync(
    join(fixture.root, 'release-lineage/fleet-admission.json'),
    JSON.stringify({ scopedAdmission: { revision: EXPECTED_SHA } })
  );
  writeFileSync(
    join(fixture.root, 'release-lineage/release-risk-receipt.json'),
    '{"latency":{"mergeAt":"2026-10-03T00:00:00Z","targetP95Seconds":1800},"ovie":{},"certificationPacket":null}'
  );
  stubCommand(
    fixture.bin,
    'gh',
    '#!/bin/sh\nprintf "%s\\n" "$STUB_MAIN_SHA"\n'
  );
  const script = materialize(
    getStepRunScript(
      getJobBlock(CONTROLLER_WORKFLOW, 'production-verified'),
      'Finalize exact current release generation'
    ),
    finalizeExpressions(overrides)
  );
  const result = runScript(script, fixture, {
    AUTH_SMOKE_STATUS: 'passed',
    DEPLOYED_SHA: EXPECTED_SHA,
    DEPLOYMENT_ID,
    EXPECTED_SHA,
    RUN_WEB: 'true',
    SELECTED_LANES: 'web',
    STUB_MAIN_SHA: boundarySha,
    WEB_EVIDENCE_SHA: EXPECTED_SHA,
  });
  return {
    marker: existsSync(marker)
      ? JSON.parse(readFileSync(marker, 'utf8'))
      : null,
    result,
    outputs: parseOutputs(fixture.output),
  };
}

function runStagingStep(stepName, mainSha, env = {}) {
  const fixture = makeFixture('staging-refresh-');
  const aliasMarker = join(fixture.root, 'alias-called');
  stubCommand(
    fixture.bin,
    'gh',
    '#!/bin/sh\nprintf "%s\\n" "$STUB_MAIN_SHA"\n'
  );
  const vercel = join(fixture.root, 'node_modules/.bin/vercel');
  mkdirSync(dirname(vercel), { recursive: true });
  writeFileSync(
    vercel,
    '#!/bin/sh\nprintf "%s\\n" "$*" > "$STUB_ALIAS_MARKER"\n'
  );
  chmodSync(vercel, 0o755);
  const script = materialize(
    getStepRunScript(
      getJobBlock(RELEASE_WORKFLOW, 'staging-deployment-receipt'),
      stepName
    ),
    {
      'github.repository': 'JovieInc/Jovie',
      'github.run_id': '1234',
      'github.run_attempt': '1',
    }
  );
  const result = runScript(script, fixture, {
    DEPLOYMENT_URL_B64: Buffer.from(DEPLOYMENT_URL).toString('base64'),
    EXPECTED_COMMIT_SHA: EXPECTED_SHA,
    EXPECTED_DEPLOYMENT_ID: DEPLOYMENT_ID,
    GITHUB_REPOSITORY: 'JovieInc/Jovie',
    PROMOTION_RESULT: 'success',
    PROMOTION_SHA: EXPECTED_SHA,
    ROLLBACK_RESULT: 'skipped',
    SOURCE_CI_RUN_ATTEMPT: '1',
    SOURCE_CI_RUN_ID: '9876',
    SOURCE_CI_COMPLETED_AT: new Date(Date.now() - 1_000).toISOString(),
    STAGING_REFRESH_OUTCOME:
      mainSha === EXPECTED_SHA ? 'current' : 'superseded_after_mutation',
    STUB_ALIAS_MARKER: aliasMarker,
    STUB_MAIN_SHA: mainSha,
    ...env,
  });
  return {
    aliasCalled: existsSync(aliasMarker),
    receiptExists: existsSync(
      join(fixture.root, 'staging-deployment-receipt.json')
    ),
    result,
    outputs: parseOutputs(fixture.output),
  };
}

describe('production release supersession execution', () => {
  it('neutralizes an intentional pre-alias supersession only', () => {
    const neutral = runReleaseResult({
      'needs.staging-head.outputs.is_current': 'false',
    });
    expect(neutral.result.status, neutral.result.stderr).toBe(0);
    expect(neutral.outputs).toMatchObject({
      released: 'false',
      superseded_before_promotion: 'true',
    });
  });

  it.each([
    ['main API', 'needs.release-head.result'],
    ['staging build', 'needs.deploy-staging.result'],
    ['staging attestation', 'needs.attest-staging-build.result'],
    ['staging canary', 'needs.canary-health-gate.result'],
  ])('handles a %s failure according to phase ownership', (_, failedKey) => {
    const overrides = { [failedKey]: 'failure' };
    const failed = runReleaseResult(overrides, NEWER_SHA);
    expect(failed.result.status === 0).toBe(
      failedKey !== 'needs.release-head.result'
    );
    expect(failed.outputs).toMatchObject({
      released: failedKey === 'needs.release-head.result' ? 'false' : 'true',
      superseded_before_promotion: 'false',
    });
  });

  it('preserves released=true for an exact promoted generation after main advances', () => {
    const released = runReleaseResult({}, NEWER_SHA);
    expect(released.result.status, released.result.stderr).toBe(0);
    expect(released.outputs).toMatchObject({
      released: 'true',
      superseded_before_promotion: 'false',
    });
  });

  it('keeps a proven pre-promotion supersession neutral after exact prior gates', () => {
    const neutral = runReleaseResult({}, NEWER_SHA, {
      PROMOTION_SHA: NEWER_SHA,
    });
    expect(neutral.result.status, neutral.result.stderr).toBe(0);
    expect(neutral.outputs).toMatchObject({
      released: 'false',
      superseded_before_promotion: 'true',
    });
  });

  it('requires the external exact staging receipt', () => {
    const accepted = runReleaseResult();
    expect(accepted.result.status, accepted.result.stderr).toBe(0);
    expect(accepted.outputs.released).toBe('true');

    const incomplete = runReleaseResult({
      'inputs.staging_verified': 'false',
    });
    expect(incomplete.result.status).not.toBe(0);
    expect(incomplete.outputs.released).toBe('false');
  });

  it('retains rollback and incomplete production evidence as failures', () => {
    const rollbackFailed = runReleaseResult({
      'needs.sentry-error-gate.outputs.gate_status': 'failed',
      'needs.rollback-production.result': 'failure',
    });
    expect(rollbackFailed.result.status).not.toBe(0);
    expect(rollbackFailed.outputs.released).toBe('false');

    const incomplete = runReleaseResult({
      'needs.production-oauth-gate.result': 'failure',
      'needs.production-oauth-gate.outputs.gate_status': 'error',
    });
    expect(incomplete.result.status).not.toBe(0);
    expect(incomplete.outputs.released).toBe('false');
  });

  it('leaves a pre-promotion supersession unverified without canonical mutation', () => {
    const neutral = runControllerVerify({
      'needs.production-release.outputs.released': 'false',
      'needs.production-release.outputs.superseded_before_promotion': 'true',
      'needs.ci-public-profile-smoke.result': 'skipped',
      'needs.lighthouse-ci.result': 'skipped',
      'needs.ci-post-deploy-auth-smoke.result': 'skipped',
    });
    expect(neutral.result.status, neutral.result.stderr).toBe(0);
    expect(neutral.outputs.canonical_verified).toBe('false');
    expect(neutral.aliasCalled).toBe(false);
    expect(neutral.doneSprintCalled).toBe('');

    const failure = runControllerVerify({
      'needs.production-release.outputs.released': 'false',
    });
    expect(failure.result.status).not.toBe(0);
    expect(failure.aliasCalled).toBe(false);
    expect(failure.doneSprintCalled).toBe('');
  });

  it('requires the real canonical bind before recording exact verification', () => {
    const verified = runControllerVerify({}, 0);
    expect(verified.result.status, verified.result.stderr).toBe(0);
    expect(verified.aliasCalled).toBe(true);
    expect(verified.doneSprintCalled).toContain(
      'scripts/invariants/done-sprint-invariants.mjs --release'
    );
    expect(verified.doneSprintCalled).toContain(`rescan=release`);
    expect(verified.doneSprintCalled).toContain(`url=${DEPLOYMENT_URL}`);
    expect(verified.outputs).toMatchObject({
      canonical_deployment_id: DEPLOYMENT_ID,
      canonical_sha: EXPECTED_SHA,
      canonical_verified: 'true',
    });

    const wrongCanonical = runControllerVerify({}, 17);
    expect(wrongCanonical.result.status).not.toBe(0);
    expect(wrongCanonical.aliasCalled).toBe(true);
    expect(wrongCanonical.doneSprintCalled).toBe('');
    expect(wrongCanonical.outputs.canonical_verified).toBe('false');
  });

  it('fails closed when the Done-sprint production rescan is red', () => {
    const blocked = runControllerVerify({}, 0, { doneSprintStatus: 1 });
    expect(blocked.result.status).not.toBe(0);
    expect(blocked.aliasCalled).toBe(true);
    expect(blocked.doneSprintCalled).toContain('rescan=release');
    expect(blocked.outputs.canonical_verified).toBe('false');
  });

  it('writes an older exact marker only after canonical and gate proof', () => {
    const superseded = runFinalize({}, NEWER_SHA);
    expect(superseded.result.status, superseded.result.stderr).toBe(0);
    expect(superseded.outputs.verified).toBe('true');
    expect(superseded.marker).toMatchObject({
      deploymentId: DEPLOYMENT_ID,
      fleetAdmission: { revision: EXPECTED_SHA },
      sha: EXPECTED_SHA,
      terminalReason: 'skipped_superseded',
    });
    expect(JSON.stringify(superseded.marker)).not.toContain(NEWER_SHA);

    const current = runFinalize({}, EXPECTED_SHA);
    expect(current.result.status, current.result.stderr).toBe(0);
    expect(current.marker).toMatchObject({
      sha: EXPECTED_SHA,
      terminalReason: 'promoted',
    });
  });

  it('emits no marker for wrong canonical or incomplete production evidence', () => {
    const wrongCanonical = runFinalize({
      'steps.verify.outputs.canonical_sha': NEWER_SHA,
    });
    expect(wrongCanonical.result.status).not.toBe(0);
    expect(wrongCanonical.marker).toBeNull();

    const incomplete = runFinalize({
      'needs.production-release.outputs.sentry_gate_status': 'failed',
    });
    expect(incomplete.result.status).not.toBe(0);
    expect(incomplete.marker).toBeNull();
  });

  it('records a mutation that finished before a newer generation took the lease', () => {
    const reassert = runStagingStep(
      'Classify staging generation after mutation',
      NEWER_SHA
    );
    expect(reassert.result.status, reassert.result.stderr).toBe(0);
    expect(reassert.outputs.staging_refresh_outcome).toBe(
      'superseded_after_mutation'
    );
    expect(reassert.aliasCalled).toBe(false);

    const receipt = runStagingStep(
      'Write typed staging deployment receipt',
      NEWER_SHA
    );
    expect(receipt.result.status, receipt.result.stderr).toBe(0);
    expect(receipt.outputs.staging_refresh_outcome).toBe(
      'superseded_after_mutation'
    );
    expect(receipt.outputs.deployed).toBe('true');
    expect(receipt.receiptExists).toBe(true);
  });

  it('ignores production state when classifying a staging generation', () => {
    const proof = { PROMOTION_SHA: NEWER_SHA };
    const reassert = runStagingStep(
      'Classify staging generation after mutation',
      NEWER_SHA,
      proof
    );
    expect(reassert.result.status, reassert.result.stderr).toBe(0);
    expect(reassert.outputs.staging_refresh_outcome).toBe(
      'superseded_after_mutation'
    );
    expect(reassert.outputs.deployed).toBeUndefined();
    expect(reassert.aliasCalled).toBe(false);
    expect(reassert.receiptExists).toBe(false);

    const receipt = runStagingStep(
      'Write typed staging deployment receipt',
      NEWER_SHA,
      proof
    );
    expect(receipt.result.status, receipt.result.stderr).toBe(0);
    expect(receipt.outputs.staging_refresh_outcome).toBe(
      'superseded_after_mutation'
    );
    expect(receipt.outputs.deployed).toBe('true');
    expect(receipt.aliasCalled).toBe(false);
    expect(receipt.receiptExists).toBe(true);
  });

  it.each([
    ['malformed promotion SHA', { PROMOTION_SHA: 'not-a-sha' }],
    [
      'failed promotion result',
      { PROMOTION_SHA: NEWER_SHA, PROMOTION_RESULT: 'failure' },
    ],
    [
      'completed rollback',
      { PROMOTION_SHA: NEWER_SHA, ROLLBACK_RESULT: 'success' },
    ],
    [
      'post-promotion evidence with rollback',
      { PROMOTION_SHA: EXPECTED_SHA, ROLLBACK_RESULT: 'success' },
    ],
  ])('keeps staging classification independent of %s', (_, evidence) => {
    for (const stepName of [
      'Classify staging generation after mutation',
      'Write typed staging deployment receipt',
    ]) {
      const result = runStagingStep(stepName, NEWER_SHA, evidence);
      expect(result.result.status, result.result.stderr).toBe(0);
      expect(result.aliasCalled).toBe(false);
    }
  });

  it('keeps the normal staging receipt', () => {
    const current = runStagingStep(
      'Write typed staging deployment receipt',
      EXPECTED_SHA
    );
    expect(current.result.status, current.result.stderr).toBe(0);
    expect(current.outputs).toMatchObject({
      deployed: 'true',
      deployment_id: DEPLOYMENT_ID,
      staging_refresh_outcome: 'current',
    });
    expect(current.receiptExists).toBe(true);
  });
});

describe('required structural release regression dispatch', () => {
  it.each([0, 23])('propagates operational exit %s', async exitCode => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'workflow_dispatch');
    vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
    vi.stubEnv('CI_PRODUCT_LANES', 'operations');
    const commands = [];
    const target = 'production-release-supersession.test.mjs';
    vi.mocked(spawn).mockImplementation(command => {
      commands.push(command);
      // A minimal ChildProcess stand-in: only close/stdout/stderr are used.
      const child = /** @type {any} */ (new EventEmitter());
      child.stdout = child.stderr = new EventEmitter();
      const code = command.includes(target) ? exitCode : 0;
      setImmediate(() => child.emit('close', code));
      return child;
    });
    const lane = selectLanes('remaining').find(
      item => item.id === 'structural'
    );
    const result = await lane.run();
    const index = commands.findIndex(command => command.includes(target));
    expect(index).toBeGreaterThanOrEqual(0);
    expect(commands[index]).toContain('pnpm exec vitest --root scripts');
    expect(result.code).toBe(exitCode);
    // Fail fast: only commands already in flight may follow the failure.
    if (exitCode) {
      expect(commands.length - 1 - index).toBeLessThan(
        STRUCTURAL_DEFAULT_CONCURRENCY
      );
    }
  });
});

describe('forward-only release lineage', () => {
  const RECHECK_STEPS = [
    ['release-head', 'Resolve current main HEAD'],
    ['staging-head', 'Resolve current main HEAD'],
    ['alias-staging', 'Recheck main immediately before staging alias'],
    ['production-head', 'Resolve current main HEAD'],
    [
      'promote-production',
      'Recheck main immediately before production mutation',
    ],
    [
      'promote-production',
      'Recheck main immediately before production promotion',
    ],
  ];

  function stubLineageGh(bin) {
    stubCommand(
      bin,
      'gh',
      `#!/bin/sh
case "$*" in
  *compare/*) printf '%s\\n' "$STUB_COMPARE_STATUS" ;;
  *) printf '%s\\n' "$STUB_MAIN_SHA" ;;
esac
`
    );
  }

  function runRecheck(jobKey, stepName, mainSha, compareStatus) {
    const fixture = makeFixture('lineage-recheck-');
    stubLineageGh(fixture.bin);
    const script = materialize(
      getStepRunScript(getJobBlock(RELEASE_WORKFLOW, jobKey), stepName),
      { 'github.repository': 'JovieInc/Jovie' }
    );
    const result = runScript(script, fixture, {
      EXPECTED_SHA,
      EXPECTED_MAIN_SHA: EXPECTED_SHA,
      STUB_COMPARE_STATUS: compareStatus,
      STUB_MAIN_SHA: mainSha,
    });
    return { result, outputs: parseOutputs(fixture.output) };
  }

  it.each(RECHECK_STEPS)(
    '%s "%s" proceeds for exact and ancestor SHAs and yields on divergence',
    (jobKey, stepName) => {
      const exact = runRecheck(jobKey, stepName, EXPECTED_SHA, 'identical');
      expect(exact.result.status, exact.result.stderr).toBe(0);
      expect(exact.outputs.is_current).toBe('true');

      const ancestor = runRecheck(jobKey, stepName, NEWER_SHA, 'ahead');
      expect(ancestor.result.status, ancestor.result.stderr).toBe(0);
      expect(ancestor.outputs.is_current).toBe('true');

      for (const status of ['diverged', 'behind', '']) {
        const off = runRecheck(jobKey, stepName, NEWER_SHA, status);
        expect(off.result.status, off.result.stderr).toBe(0);
        expect(off.outputs.is_current).toBe('false');
      }
    },
    30_000
  );

  function runPromote(mainSha, compareStatus) {
    const fixture = makeFixture('lineage-promote-');
    stubLineageGh(fixture.bin);
    const promoted = join(fixture.root, 'promoted');
    const stagingAlias = join(fixture.root, 'staging-alias');
    const stagingRestore = join(fixture.root, 'staging-restore');
    writeFileSync(stagingAlias, 'dpl_staging_preview');
    const vercel = join(fixture.root, 'vercel');
    writeFileSync(
      vercel,
      `#!/bin/sh
case "$1" in
  inspect)
    id="$2"
    if [ "$2" = "jov.ie" ]; then
      if [ -f "$STUB_PROMOTED" ]; then id="$STUB_DEPLOY_ID"; else id="dpl_previous_generation"; fi
    elif [ "$2" = "staging.jov.ie" ]; then
      id="$(cat "$STUB_STAGING_ALIAS")"
    fi
    target="production"
    if [ "$id" = "dpl_staging_preview" ]; then target="preview"; fi
    printf '{"id":"%s","readyState":"READY","target":"%s","url":"https://jovie-%s-jovie.vercel.app"}\\n' "$id" "$target" "$id" ;;
  rolling-release) printf 'null\\n' ;;
  promote)
    printf '%s\\n' "$*" > "$STUB_PROMOTED"
    printf '%s' "$STUB_DEPLOY_ID" > "$STUB_STAGING_ALIAS" ;;
  alias)
    printf '%s\\n' "$*" > "$STUB_STAGING_RESTORE"
    printf '%s' 'dpl_staging_preview' > "$STUB_STAGING_ALIAS" ;;
esac
`
    );
    chmodSync(vercel, 0o755);
    const result = spawnSync(
      'bash',
      [resolve(REPO_ROOT, '.github/scripts/promote-production-deployment.sh')],
      {
        cwd: fixture.root,
        encoding: 'utf8',
        timeout: 20_000,
        env: {
          ...process.env,
          EXPECTED_MAIN_SHA: EXPECTED_SHA,
          GH_TOKEN: 'stub',
          GITHUB_OUTPUT: fixture.output,
          GITHUB_REPOSITORY: 'JovieInc/Jovie',
          PATH: `${fixture.bin}${delimiter}${process.env.PATH || ''}`,
          PRODUCTION_DEPLOYMENT_ID: DEPLOYMENT_ID,
          PRODUCTION_PROMOTION_POLL_SECONDS: '0',
          STUB_COMPARE_STATUS: compareStatus,
          STUB_DEPLOY_ID: DEPLOYMENT_ID,
          STUB_MAIN_SHA: mainSha,
          STUB_PROMOTED: promoted,
          STUB_STAGING_ALIAS: stagingAlias,
          STUB_STAGING_RESTORE: stagingRestore,
          VERCEL_CLI: vercel,
          VERCEL_ORG_ID: 'team_stub',
          VERCEL_PROJECT_ID: 'prj_stub',
          VERCEL_TOKEN: 'stub',
        },
      }
    );
    return {
      promoted: existsSync(promoted),
      result,
      outputs: parseOutputs(fixture.output),
      stagingAlias: readFileSync(stagingAlias, 'utf8'),
      stagingRestored: existsSync(stagingRestore),
    };
  }

  it('promotes an exact or ancestor generation and reports the promoted SHA', () => {
    const exact = runPromote(EXPECTED_SHA, 'identical');
    expect(exact.result.status, exact.result.stderr).toBe(0);
    expect(exact.promoted).toBe(true);
    expect(exact.stagingAlias).toBe('dpl_staging_preview');
    expect(exact.stagingRestored).toBe(true);
    expect(exact.outputs.promotion_sha).toBe(EXPECTED_SHA);

    const ancestor = runPromote(NEWER_SHA, 'ahead');
    expect(ancestor.result.status, ancestor.result.stderr).toBe(0);
    expect(ancestor.promoted).toBe(true);
    expect(ancestor.stagingAlias).toBe('dpl_staging_preview');
    expect(ancestor.stagingRestored).toBe(true);
    expect(ancestor.outputs.promotion_sha).toBe(EXPECTED_SHA);
  });

  it('yields without mutation when the generation left main lineage', () => {
    const diverged = runPromote(NEWER_SHA, 'diverged');
    expect(diverged.result.status, diverged.result.stderr).toBe(0);
    expect(diverged.promoted).toBe(false);
    expect(diverged.stagingAlias).toBe('dpl_staging_preview');
    expect(diverged.stagingRestored).toBe(false);
    expect(diverged.outputs.promotion_sha).toBe(NEWER_SHA);
  });
});

describe('controller starvation bound', () => {
  it('routes every post-coalesce main recheck through the lineage gate', () => {
    const coalesce = getJobBlock(CONTROLLER_WORKFLOW, 'coalesce-production');
    const authorize = getJobBlock(CONTROLLER_WORKFLOW, 'authorize-production');
    expect(coalesce).toContain("PRODUCTION_STARVATION_SECONDS: '5400'");
    expect(coalesce).toContain(
      'sparse-checkout: .github/scripts/release-lineage-gate.sh'
    );
    expect(
      coalesce.match(/release-lineage-gate\.sh/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(3);
    expect(authorize.match(/release-lineage-gate\.sh/g)?.length ?? 0).toBe(2);
    expect(coalesce).not.toContain(
      'if [ "$current_main_sha" != "$EXPECTED_SHA" ]; then\n            record_receipt "superseded"'
    );
  });
});
