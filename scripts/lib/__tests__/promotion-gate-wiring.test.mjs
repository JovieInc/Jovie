import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { load as yamlLoad } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  buildJourneyEvidence,
  stripeModeFromKey,
} from '../journey-evidence-builder.mjs';

const root = resolve(import.meta.dirname, '../../..');
const yaml = f =>
  /** @type {any} */ (
    yamlLoad(readFileSync(resolve(root, '.github/workflows', f), 'utf8'))
  );
const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const NOW = new Date('2026-10-22T12:00:00.000Z');
const range = {
  schema: 'jovie.release-range-risk/v1',
  baseDeployedSha: 'c'.repeat(40),
  candidateSha: SHA,
  unknown: false,
  paths: [{ path: 'apps/web/lib/auth/session.ts', class: 'auth-identity' }],
  affects: { auth: true, billing: false },
};
const report = statuses => ({
  suites: [
    {
      specs: statuses.map(status => ({
        file: 'tests/e2e/golden-path.spec.ts',
        tests: [{ status }],
      })),
    },
  ],
});
const evidence = (statuses, over = {}) =>
  buildJourneyEvidence({
    report: report(statuses),
    candidateSha: SHA,
    runId: '99',
    runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/99',
    stepOutcome: 'success',
    stripeMode: 'test',
    completedAt: new Date(NOW.getTime() - 60_000),
    ...over,
  });

/** Runs the real gate CLI the way production-release.yml does. */
function gate(rangeDoc, docs) {
  const dir = mkdtempSync(join(tmpdir(), 'promo-gate-'));
  writeFileSync(join(dir, 'range.json'), JSON.stringify(rangeDoc));
  const args = [
    'scripts/promotion-journey-gate.mjs',
    '--range',
    join(dir, 'range.json'),
  ];
  docs.forEach((d, i) => {
    const p = join(dir, `e${i}.json`);
    writeFileSync(p, JSON.stringify(d));
    args.push('--evidence', p);
  });
  args.push('--now', NOW.toISOString());
  const r = spawnSync('node', args, { cwd: root, encoding: 'utf8' });
  return { status: r.status, out: r.stdout };
}

describe('promotion is blocked/passed by real journey evidence (deliberate red)', () => {
  it('blocks with no evidence', () => {
    const r = gate(range, []);
    expect(r.status).toBe(1);
    expect(r.out).toContain('no evidence');
  });
  it('blocks with evidence for another SHA', () => {
    const other = evidence(['expected']).map(d => ({
      ...d,
      candidateSha: OTHER,
      deploymentSha: OTHER,
    }));
    const r = gate(range, other);
    expect(r.status).toBe(1);
    expect(r.out).toContain('not for the exact candidate SHA');
  });
  it('blocks when the journey was skipped', () => {
    const r = gate(range, evidence(['skipped']));
    expect(r.status).toBe(1);
    expect(r.out).toContain('journey has skipped tests');
  });
  it('blocks when the run is red or mocked or Stripe is not test mode', () => {
    expect(
      gate(range, evidence(['unexpected'], { stepOutcome: 'failure' })).status
    ).toBe(1);
    expect(
      gate(range, evidence(['expected'], { stripeMode: 'unknown' })).status
    ).toBe(1);
  });
  it('blocks an unknown or missing range artifact without evidence', () => {
    const unknown = { ...range, unknown: true, affects: {} };
    expect(gate(unknown, []).status).toBe(1);
    expect(gate({}, evidence(['expected'])).status).toBe(1);
  });
  it('passes with valid exact-candidate evidence', () => {
    const r = gate(range, evidence(['expected']));
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain('"decision": "pass"');
  });
});

describe('evidence builder', () => {
  it('fails closed without a report', () => {
    const docs = buildJourneyEvidence({
      report: null,
      candidateSha: SHA,
      runId: '1',
      runUrl: 'u',
      stepOutcome: 'success',
      stripeMode: 'test',
    });
    expect(docs.map(d => d.conclusion)).toEqual(['failure', 'failure']);
  });
  it('derives Stripe mode from the key prefix only', () => {
    expect(stripeModeFromKey('sk_test_x')).toBe('test');
    expect(stripeModeFromKey('sk_live_x')).toBe('live');
    expect(stripeModeFromKey('')).toBe('unknown');
  });
});

describe('workflow wiring', () => {
  const job = yaml('production-release.yml').jobs['promote-production'];
  const names = job.steps.map(s => s.name);
  const gateStep = job.steps.find(s => s.id === 'journey-gate');
  const promote = job.steps.find(s => s.id === 'promote');
  it('runs the gate before promotion and promotion requires it to succeed', () => {
    expect(names.indexOf(gateStep.name)).toBeLessThan(
      names.indexOf(promote.name)
    );
    expect(promote.if).toContain(
      "steps.final-current.outputs.is_current == 'true'"
    );
    expect(promote.if).toContain("steps.journey-gate.outcome == 'success'");
    expect(gateStep.run).toContain(
      '"$gate_tools/scripts/promotion-gate-ci.mjs" range'
    );
    expect(gateStep.run).toContain(
      '"$gate_tools/scripts/promotion-gate-ci.mjs" resolve-base'
    );
    expect(gateStep.run).not.toMatch(/node scripts\/promotion-gate-ci\.mjs/);
    expect(gateStep.run).not.toMatch(
      /node scripts\/promotion-journey-gate\.mjs/
    );
    expect(gateStep.run).toContain('https://jov.ie/api/health/build-info');
    expect(gateStep.run).toContain('--scope "$VERCEL_ORG_ID"');
    expect(gateStep.run).not.toContain('githubCommitSha');
    expect(gateStep.run).not.toContain('|| true');
    expect(gateStep.run).toContain('promotion-journey-gate.mjs');
    expect(gateStep['continue-on-error']).toBeUndefined();
    expect(job.permissions.actions).toBe('read');
    const budgets = job.steps.find(s => s.id === 'performance-gate');
    expect(names.indexOf(budgets.name)).toBeLessThan(
      names.indexOf(gateStep.name)
    );
    expect(budgets.run).toContain(
      'pnpm exec tsx scripts/performance-budgets-guard.ts'
    );
    expect(budgets.run).not.toContain('promotion-gate-tooling');
    const tooling = job.steps.find(
      s => s.name === 'Checkout trusted promotion gate tooling'
    );
    expect(names.indexOf(tooling.name)).toBe(names.indexOf(gateStep.name) - 1);
    expect(tooling.if).toBe(gateStep.if);
    expect(tooling.with.repository).toBe('${{ job.workflow_repository }}');
    expect(tooling.with.ref).toBe('${{ job.workflow_sha }}');
    expect(tooling.with.path).toBe('promotion-gate-tooling');
    expect(tooling.with['persist-credentials']).toBe(false);
    expect(tooling.with['fetch-depth']).toBe(1);
    expect(tooling.with['sparse-checkout-cone-mode']).toBe(false);
    expect(tooling.with.ref).not.toContain('expected_sha');
  });
  it('Golden Path lane uploads exact-SHA evidence on every outcome', () => {
    const golden = yaml('ci.yml').jobs['ci-golden-path'];
    const steps = golden.steps;
    const emit = steps.find(s => s.name?.startsWith('Emit journey evidence'));
    const upload = steps.find(s => s.name === 'Upload journey evidence');
    const journey = steps.find(s => s.id === 'canonical_journey');
    expect(emit.if).toContain('always()');
    expect(upload.if).toContain('always()');
    expect(upload.with.name).toBe('journey-evidence-${{ github.sha }}');
    expect(upload.with['retention-days']).toBe(14);
    expect(upload.with['if-no-files-found']).toBe('error');
    expect(golden.if).toContain("github.event_name == 'workflow_dispatch'");
    expect(golden.if).toContain(
      "|| (github.event_name == 'push' && github.ref == 'refs/heads/main')"
    );
    expect(golden.if).not.toContain('merge_group');
    expect(golden.if).not.toContain('pull_request');
    // One job. Path-changes success stays inside the manual arm. A push arm
    // ANDed behind that result never runs for a queue-proven main SHA.
    expect(
      golden.if.indexOf("github.event_name == 'workflow_dispatch'")
    ).toBeLessThan(
      golden.if.indexOf("needs.ci-path-changes.result == 'success'")
    );
    expect(golden.if.split('ci-path-changes').length - 1).toBe(1);
    const pushClause = golden.if.split('||').at(-1) ?? '';
    expect(pushClause).toContain("github.event_name == 'push'");
    expect(pushClause).not.toContain('ci-path-changes');
    expect(pushClause).not.toContain('ci-build-public');
    expect(String(golden['continue-on-error'])).toBe(
      "${{ github.event_name == 'push' }}"
    );
    expect(journey.run).toContain(
      'mkdir -p "${{ runner.temp }}/journey-evidence"'
    );
  });
});

const OLD_CANDIDATE = 'e806124e86032850ab67ceeffacb0b399e488495';
const CURRENT_MAIN = 'ce8fb43d5d9e89e3226ed1de5cad1bab16f4e087';
const LIVE_BASE = 'c'.repeat(40);
const DEPLOYMENT = 'dpl_7Gu4wr3uUeGn8jkVhWFBq4Z6n5Xa';
const OLD_USAGE = 'usage: promotion-gate-ci.mjs range|fetch-evidence ...';
const OLD_CLI = readFileSync(
  join(root, 'scripts/lib/__tests__/fixtures/promotion-gate-ci.e806124.mjs'),
  'utf8'
);

function toolingPaths() {
  const step = yaml('production-release.yml').jobs[
    'promote-production'
  ].steps.find(s => s.name === 'Checkout trusted promotion gate tooling');
  return step.with['sparse-checkout']
    .trim()
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function copyRepoFiles(dest, paths) {
  for (const rel of paths) {
    const target = join(dest, rel);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(root, rel), target);
  }
}

function writeExecutable(path, body) {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

/**
 * Runs the promote job's journey-gate shell. Vercel, curl, git, and gh are
 * local stand-ins so the proof does not touch production or GitHub.
 */
function runTrustedGate(candidateCli, candidateSha) {
  const workspace = mkdtempSync(join(tmpdir(), 'promo-gate-step-'));
  const paths = toolingPaths();
  copyRepoFiles(workspace, paths);
  writeFileSync(join(workspace, 'scripts/promotion-gate-ci.mjs'), candidateCli);
  copyRepoFiles(join(workspace, 'promotion-gate-tooling'), paths);
  const bin = join(workspace, '.proof-bin');
  const inspectFile = join(workspace, 'proof-inspect.json');
  const buildInfoFile = join(workspace, 'proof-build-info.json');
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    inspectFile,
    JSON.stringify({
      id: DEPLOYMENT,
      url: 'jovie-abc.vercel.app',
      readyState: 'READY',
      target: 'production',
      meta: { githubCommitSha: 'd'.repeat(40) },
    })
  );
  writeFileSync(
    buildInfoFile,
    JSON.stringify({
      commitSha: LIVE_BASE,
      deploymentId: DEPLOYMENT,
      environment: 'production',
    })
  );
  writeExecutable(
    join(bin, 'git'),
    '#!/bin/sh\ncase " $* " in\n  *" diff "*) printf \'%s\\n\' \'apps/web/lib/auth/session.ts\' ;;\nesac\nexit 0\n'
  );
  writeExecutable(
    join(bin, 'gh'),
    "#!/bin/sh\necho 'proof gh unavailable' >&2\nexit 1\n"
  );
  writeExecutable(join(bin, 'curl'), `#!/bin/sh\ncat '${buildInfoFile}'\n`);
  const vercelDir = join(workspace, 'node_modules/.bin');
  mkdirSync(vercelDir, { recursive: true });
  writeExecutable(
    join(vercelDir, 'vercel'),
    `#!/bin/sh\ncat '${inspectFile}'\n`
  );
  const runnerTemp = join(workspace, 'runner-temp');
  const githubOutput = join(workspace, 'github-output.txt');
  mkdirSync(runnerTemp);
  const gateStep = yaml('production-release.yml').jobs[
    'promote-production'
  ].steps.find(s => s.id === 'journey-gate');
  const result = spawnSync('bash', ['-euo', 'pipefail', '-c', gateStep.run], {
    cwd: workspace,
    encoding: 'utf8',
    env: {
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      HOME: workspace,
      GITHUB_WORKSPACE: workspace,
      RUNNER_TEMP: runnerTemp,
      GITHUB_OUTPUT: githubOutput,
      CANDIDATE_SHA: candidateSha,
      PROMOTION_JOURNEY_OVERRIDE: '',
      VERCEL_ORG_ID: 'team_proof',
      VERCEL_TOKEN: 'unused',
      VERCEL_PROJECT_ID: 'unused',
      REPO: 'JovieInc/Jovie',
      GH_TOKEN: 'proof-token',
      GITHUB_TOKEN: '',
    },
  });
  const read = rel =>
    readFileSync(join(runnerTemp, 'journey-gate', rel), 'utf8');
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    output: readFileSync(githubOutput, 'utf8'),
    range: JSON.parse(read('range.json')),
    decision: JSON.parse(read('decision.json')),
    cleanup: () => rmSync(workspace, { recursive: true, force: true }),
  };
}

function resolveBase(script, cwd) {
  const dir = mkdtempSync(join(tmpdir(), 'promo-resolve-'));
  const inspect = join(dir, 'inspect.json');
  const info = join(dir, 'build-info.json');
  writeFileSync(
    inspect,
    JSON.stringify({
      id: DEPLOYMENT,
      url: 'jovie-abc.vercel.app',
      readyState: 'READY',
      target: 'production',
    })
  );
  writeFileSync(
    info,
    JSON.stringify({
      commitSha: LIVE_BASE,
      deploymentId: DEPLOYMENT,
      environment: 'production',
    })
  );
  const result = spawnSync(
    'node',
    [script, 'resolve-base', '--inspect', inspect, '--build-info', info],
    { cwd, encoding: 'utf8' }
  );
  rmSync(dir, { recursive: true, force: true });
  return result;
}

describe('trusted gate tooling grades older and current candidates', () => {
  const shown = spawnSync(
    'git',
    ['show', `${OLD_CANDIDATE}:scripts/promotion-gate-ci.mjs`],
    { cwd: root, encoding: 'utf8' }
  );

  it.skipIf(shown.status !== 0)(
    'keeps the e806124 CLI fixture identical to that commit',
    () => {
      expect(shown.stdout).toBe(OLD_CLI);
    }
  );

  it('keeps the frozen e806124 CLI outside scripts typecheck', () => {
    const tsconfig = readFileSync(join(root, 'scripts/tsconfig.json'), 'utf8');
    expect(tsconfig).toContain(
      'lib/__tests__/fixtures/promotion-gate-ci.e806124.mjs'
    );
  });

  it('reproduces the production usage failure from the e806124 CLI', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'promo-old-cli-'));
    try {
      copyRepoFiles(workspace, toolingPaths());
      const script = join(workspace, 'scripts/promotion-gate-ci.mjs');
      writeFileSync(script, OLD_CLI);
      const result = resolveBase(script, workspace);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain(OLD_USAGE);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('resolves the base from the current main CLI', () => {
    const current = readFileSync(
      join(root, 'scripts/promotion-gate-ci.mjs'),
      'utf8'
    );
    const mainBlob = spawnSync(
      'git',
      ['show', `${CURRENT_MAIN}:scripts/promotion-gate-ci.mjs`],
      { cwd: root, encoding: 'utf8' }
    );
    if (mainBlob.status === 0) expect(mainBlob.stdout).toBe(current);
    const result = resolveBase(
      join(root, 'scripts/promotion-gate-ci.mjs'),
      root
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe(LIVE_BASE);
    expect(result.stderr).not.toContain(OLD_USAGE);
  });

  it.each([
    ['e806124', OLD_CANDIDATE, OLD_CLI],
    [
      'current main',
      CURRENT_MAIN,
      readFileSync(join(root, 'scripts/promotion-gate-ci.mjs'), 'utf8'),
    ],
  ])(
    'grades %s with the workflow-ref tooling and blocks on missing evidence',
    (_label, candidateSha, cli) => {
      const proof = runTrustedGate(cli, candidateSha);
      try {
        expect(proof.status, `${proof.stdout}\n${proof.stderr}`).toBe(1);
        expect(`${proof.stdout}\n${proof.stderr}`).not.toContain(OLD_USAGE);
        expect(proof.range.baseDeployedSha).toBe(LIVE_BASE);
        expect(proof.range.candidateSha).toBe(candidateSha);
        expect(proof.range.unknown).toBe(false);
        expect(proof.range.affects.auth).toBe(true);
        expect(proof.decision.decision).toBe('blocked');
        expect(proof.output).toContain('failure_subtype=journey_gate_blocked');
        expect(proof.stdout).not.toContain('PROMOTION_JOURNEY_OVERRIDE');
      } finally {
        proof.cleanup();
      }
    }
  );
});
