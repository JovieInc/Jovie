import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// Overflow tests for the release lineage gate's yield handoff outputs (the
// per-file size-500 baseline for release-lineage-gate.test.mjs is
// shrink-only, so new additive coverage lands here instead of growing it).
//
// The Production Verified step must be able to tell an authorization yield
// (a forward-only lease transfer to a queued successor, which concludes as a
// notice naming the successor) apart from a real failed authorization (which
// still fails). The gate exposes that distinction on $GITHUB_OUTPUT:
// decision=yield plus `yielded_to=<current main sha>`, and it must never
// emit `authorized` itself — only the full authorize step mints that.

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const GATE = resolve(REPO_ROOT, '.github/scripts/release-lineage-gate.sh');
const EXPECTED_SHA = 'a'.repeat(40);
const NEWER_SHA = 'b'.repeat(40);
const LIVE_SHA = 'c'.repeat(40);
const SUCCESSOR_SHA = 'd'.repeat(40);

const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function parseOutputs(path) {
  const values = {};
  for (const line of readFileSync(path, 'utf8').trim().split('\n')) {
    if (!line) continue;
    const separator = line.indexOf('=');
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

/**
 * Stub gh/curl so the gate sees: compare(expected...main) = `lineageStatus`,
 * live production at LIVE_SHA, and (when `queuedSuccessor`) one newer queued
 * controller generation whose staging finished successfully and shippable.
 * `zip` (present on CI runners and in this sandbox) packs the staging
 * completion artifact exactly like the main gate harness does.
 */
function runGate({
  main = NEWER_SHA,
  lineageStatus = 'ahead',
  queuedSuccessor = false,
}) {
  const root = mkdtempSync(join(tmpdir(), 'lineage-yield-'));
  tempRoots.push(root);
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const output = join(root, 'github-output');
  writeFileSync(output, '');

  const controllerRuns = JSON.stringify({
    workflow_runs: queuedSuccessor
      ? [
          {
            id: 900,
            status: 'pending',
            display_title: `Production Controller ${SUCCESSOR_SHA} from CI 700 attempt 1`,
          },
        ]
      : [],
  });
  const stagingRuns = JSON.stringify({
    workflow_runs: [
      {
        id: 800,
        run_attempt: 1,
        status: 'completed',
        conclusion: 'success',
        display_title: `${SUCCESSOR_SHA} from CI 700 attempt 1`,
      },
    ],
  });
  const stagingArtifacts = JSON.stringify({
    total_count: 1,
    artifacts: [{ id: 901, name: 'staging-completion-1', expired: false }],
  });

  const completionDir = join(root, 'completion');
  mkdirSync(completionDir);
  writeFileSync(
    join(completionDir, 'staging-completion.json'),
    JSON.stringify({ sha: SUCCESSOR_SHA, outcome: 'deployed' })
  );
  execFileSync(
    'zip',
    ['-q', join(root, 'staging-completion.zip'), 'staging-completion.json'],
    {
      cwd: completionDir,
    }
  );

  writeFileSync(
    join(bin, 'gh'),
    `#!/bin/sh
case "$*" in
  *compare/${EXPECTED_SHA}...*) printf '%s\\n' '${lineageStatus}'; exit 0 ;;
  *compare/${LIVE_SHA}...*)
    cat <<'JSON'
{"status":"identical","ahead_by":0,"behind_by":0,"total_commits":0,"commits":[]}
JSON
  ;;
  *production-controller.yml/runs*) printf '%s\\n' '${controllerRuns}' ;;
  *staging-controller.yml/runs*) printf '%s\\n' '${stagingRuns}' ;;
  *runs/800/artifacts*) printf '%s\\n' '${stagingArtifacts}' ;;
  */artifacts/901/zip) cat "${root}/staging-completion.zip" ;;
  *) exit 1 ;;
esac
`
  );
  chmodSync(join(bin, 'gh'), 0o755);
  writeFileSync(
    join(bin, 'curl'),
    `#!/bin/sh\nprintf '{"commitSha":"${LIVE_SHA}"}\\n'\n`
  );
  chmodSync(join(bin, 'curl'), 0o755);

  const result = spawnSync('bash', [GATE], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
    env: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH || ''}`,
      CURRENT_MAIN_SHA: main,
      EXPECTED_SHA,
      GITHUB_OUTPUT: output,
      GITHUB_RUN_ID: '100',
      IN_FLIGHT: 'false',
      LINEAGE_PROVE_WITH_GIT: '0',
      PRODUCTION_STARVATION_SECONDS: '5400',
      REPOSITORY: 'JovieInc/Jovie',
    },
  });
  return {
    result,
    decision: result.stdout.trim(),
    outputs: parseOutputs(output),
  };
}

describe('release lineage gate yield handoff outputs', () => {
  it('emits yielded_to on a queued-successor authorization yield', () => {
    const run = runGate({ queuedSuccessor: true });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=yield');
    expect(run.outputs).toMatchObject({
      gate_decision: 'yield',
      yielded_to: NEWER_SHA,
    });
  });

  it('emits yielded_to on a diverged-lineage yield', () => {
    const run = runGate({ lineageStatus: 'diverged' });
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.decision).toBe('decision=yield');
    expect(run.outputs).toMatchObject({
      gate_decision: 'yield',
      yielded_to: NEWER_SHA,
    });
  });

  it('never mints authorization evidence itself', () => {
    for (const run of [
      runGate({ queuedSuccessor: true }),
      runGate({ lineageStatus: 'diverged' }),
    ]) {
      expect(run.outputs.authorized).toBeUndefined();
      expect(run.outputs).not.toHaveProperty('authorized');
    }
  });

  it('emits no yield handoff when the generation keeps the lease', () => {
    const exact = runGate({ main: EXPECTED_SHA, lineageStatus: 'identical' });
    expect(exact.result.status, exact.result.stderr).toBe(0);
    expect(exact.decision).toBe('decision=proceed');
    expect(exact.outputs.yielded_to).toBeUndefined();

    const ancestorKeepsLease = runGate({ queuedSuccessor: false });
    expect(
      ancestorKeepsLease.result.status,
      ancestorKeepsLease.result.stderr
    ).toBe(0);
    expect(ancestorKeepsLease.decision).toBe('decision=proceed');
    expect(ancestorKeepsLease.outputs.yielded_to).toBeUndefined();
  });
});
