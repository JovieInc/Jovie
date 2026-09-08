import { spawnSync } from 'node:child_process';
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
import { selectLanes } from '../../ci-fast-lanes.mjs';

vi.mock('node:child_process', async importOriginal => {
  const actual = /** @type {typeof import('node:child_process')} */ (
    await importOriginal()
  );
  return { ...actual, spawnSync: vi.fn(actual.spawnSync) };
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

afterEach(() => {
  vi.mocked(spawnSync).mockRestore();
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
      PATH: `${fixture.bin}${delimiter}${process.env.PATH || ''}`,
      RUNNER_TEMP: fixture.root,
    },
  });
}

function releaseExpressions(overrides = {}) {
  return {
    "needs.migrate-production.outputs.schema_drift == 'true' || needs.deploy-staging.outputs.schema_drift == 'true'":
      'false',
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

function runReleaseResult(overrides = {}, boundarySha = NEWER_SHA) {
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

function runControllerVerify(overrides = {}, aliasStatus = 0) {
  const fixture = makeFixture('controller-verify-');
  const aliasMarker = join(fixture.root, 'alias-called');
  stubCommand(
    fixture.bin,
    'gh',
    '#!/bin/sh\nprintf "%s\\n" "$STUB_MAIN_SHA"\n'
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
    STUB_MAIN_SHA: NEWER_SHA,
  });
  return {
    aliasCalled: existsSync(aliasMarker),
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
  ])('keeps a %s failure red even when main later advances', (_, failedKey) => {
    const overrides = { [failedKey]: 'failure' };
    if (failedKey !== 'needs.release-head.result') {
      overrides['needs.staging-head.outputs.is_current'] = 'false';
    }
    const failed = runReleaseResult(overrides, NEWER_SHA);
    expect(failed.result.status).not.toBe(0);
    expect(failed.outputs).toMatchObject({
      released: 'false',
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

  it('accepts only a gated post-promotion staging-refresh supersession', () => {
    const accepted = runReleaseResult({
      'needs.staging-deployment-receipt.outputs.staging_refresh_outcome':
        'superseded_after_promotion',
      'needs.staging-deployment-receipt.outputs.deployed': '',
    });
    expect(accepted.result.status, accepted.result.stderr).toBe(0);
    expect(accepted.outputs.released).toBe('true');

    const incomplete = runReleaseResult({
      'needs.staging-deployment-receipt.outputs.staging_refresh_outcome':
        'superseded_after_promotion',
      'needs.staging-deployment-receipt.outputs.deployed': '',
      'needs.attest-staging-build.result': 'failure',
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

    const failure = runControllerVerify({
      'needs.production-release.outputs.released': 'false',
    });
    expect(failure.result.status).not.toBe(0);
    expect(failure.aliasCalled).toBe(false);
  });

  it('requires the real canonical bind before recording exact verification', () => {
    const verified = runControllerVerify({}, 0);
    expect(verified.result.status, verified.result.stderr).toBe(0);
    expect(verified.aliasCalled).toBe(true);
    expect(verified.outputs).toMatchObject({
      canonical_deployment_id: DEPLOYMENT_ID,
      canonical_sha: EXPECTED_SHA,
      canonical_verified: 'true',
    });

    const wrongCanonical = runControllerVerify({}, 17);
    expect(wrongCanonical.result.status).not.toBe(0);
    expect(wrongCanonical.aliasCalled).toBe(true);
    expect(wrongCanonical.outputs.canonical_verified).toBe('false');
  });

  it('writes an older exact marker only after canonical and gate proof', () => {
    const superseded = runFinalize({}, NEWER_SHA);
    expect(superseded.result.status, superseded.result.stderr).toBe(0);
    expect(superseded.outputs.verified).toBe('true');
    expect(superseded.marker).toMatchObject({
      deploymentId: DEPLOYMENT_ID,
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

  it('refuses stale staging mutation and omits a post-reassert stale receipt', () => {
    const reassert = runStagingStep(
      'Reassert the exact preview after production settles',
      NEWER_SHA
    );
    expect(reassert.result.status, reassert.result.stderr).toBe(0);
    expect(reassert.outputs.staging_refresh_outcome).toBe(
      'superseded_after_promotion'
    );
    expect(reassert.aliasCalled).toBe(false);

    const receipt = runStagingStep(
      'Write typed staging deployment receipt',
      NEWER_SHA
    );
    expect(receipt.result.status, receipt.result.stderr).toBe(0);
    expect(receipt.outputs.staging_refresh_outcome).toBe(
      'superseded_after_promotion'
    );
    expect(receipt.outputs.deployed).toBeUndefined();
    expect(receipt.receiptExists).toBe(false);
  });

  it('keeps the normal staging receipt and rejects contradictory supersession', () => {
    const current = runStagingStep(
      'Write typed staging deployment receipt',
      EXPECTED_SHA
    );
    expect(current.result.status, current.result.stderr).toBe(0);
    expect(current.outputs).toMatchObject({
      deployed: 'true',
      deployment_id: DEPLOYMENT_ID,
      staging_refresh_outcome: 'current_receipt',
    });
    expect(current.receiptExists).toBe(true);

    const wrongPromotion = runStagingStep(
      'Write typed staging deployment receipt',
      NEWER_SHA,
      { PROMOTION_SHA: NEWER_SHA }
    );
    expect(wrongPromotion.result.status).not.toBe(0);
    expect(wrongPromotion.outputs.deployed).toBeUndefined();
    expect(wrongPromotion.receiptExists).toBe(false);
  });
});

describe('required structural release regression dispatch', () => {
  it.each([0, 23])('propagates operational selector exit %s', exitCode => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'workflow_dispatch');
    vi.stubEnv('CI_FAST_SKIP_STRUCTURAL', 'false');
    vi.stubEnv('CI_PRODUCT_LANES', 'operations');
    const commands = [];
    vi.mocked(spawnSync).mockImplementation(command => {
      commands.push(command);
      return {
        status: command.includes('production-release-supersession.test.mjs')
          ? exitCode
          : 0,
        stdout: '',
        stderr: '',
        pid: 0,
        signal: null,
        output: [null, '', ''],
      };
    });
    const lane = selectLanes('remaining').find(
      item => item.id === 'structural'
    );
    const result = lane.run();
    const index = commands.findIndex(command =>
      command.includes('production-release-supersession.test.mjs')
    );
    expect(index).toBeGreaterThanOrEqual(0);
    expect(commands[index]).toContain('pnpm exec vitest --root scripts');
    expect(result.code).toBe(exitCode);
    if (exitCode) expect(index).toBe(commands.length - 1);
  });
});
