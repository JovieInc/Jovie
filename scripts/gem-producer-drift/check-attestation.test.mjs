import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(
  new URL('./check-attestation.mjs', import.meta.url)
);
const HEAD = 'a'.repeat(40);
const INSTALLED = 'b'.repeat(40);

const dir = mkdtempSync(join(tmpdir(), 'gem-producer-drift-'));
after(() => rmSync(dir, { recursive: true, force: true }));

function writeAttestation(name, contents) {
  const path = join(dir, name);
  writeFileSync(path, contents);
  return path;
}

function run(args) {
  try {
    const stdout = execFileSync('node', [SCRIPT, ...args], {
      encoding: 'utf8',
    });
    return { code: 0, stdout };
  } catch (error) {
    return { code: error.status, stdout: error.stdout ?? '' };
  }
}

const { defaultAttestationPath, evaluateAttestation, parseArgs } = await import(
  './check-attestation.mjs'
);

describe('parseArgs', () => {
  it('defaults repo and branch to symphony-control main', () => {
    const args = parseArgs([]);
    assert.equal(args.repo, 'JovieInc/symphony-control');
    assert.equal(args.branch, 'main');
    assert.equal(args.expectedSha, null);
  });
});

describe('defaultAttestationPath', () => {
  it('reads state/gem-pr-rehabilitation-attestation.json under GEM_WORKSPACE', () => {
    assert.equal(
      defaultAttestationPath({ GEM_WORKSPACE: '/tmp/gem' }),
      '/tmp/gem/state/gem-pr-rehabilitation-attestation.json'
    );
  });
});

describe('evaluateAttestation', () => {
  it('passes when sourceRevision matches upstream head', () => {
    const result = evaluateAttestation({ sourceRevision: HEAD }, HEAD);
    assert.equal(result.ok, true);
  });

  it('fails when the attestation file is missing', () => {
    const result = evaluateAttestation(null, HEAD);
    assert.equal(result.ok, false);
    assert.match(result.reason, /missing/);
  });

  it('fails when sourceRevision is absent', () => {
    const result = evaluateAttestation({ installedAt: 'now' }, HEAD);
    assert.equal(result.ok, false);
    assert.match(result.reason, /sourceRevision/);
  });

  it('fails when sourceRevision is not a full sha', () => {
    const result = evaluateAttestation({ sourceRevision: 'abc123' }, HEAD);
    assert.equal(result.ok, false);
  });

  it('fails when sourceRevision lags upstream head', () => {
    const result = evaluateAttestation({ sourceRevision: INSTALLED }, HEAD);
    assert.equal(result.ok, false);
    assert.match(result.reason, /does not match/);
  });
});

describe('CLI', () => {
  it('exits 1 when the attestation file does not exist', () => {
    const { code, stdout } = run([
      `--attestation-file=${join(dir, 'absent.json')}`,
      `--expected-sha=${HEAD}`,
    ]);
    assert.equal(code, 1);
    assert.match(stdout, /missing/);
  });

  it('exits 1 when the attestation is not valid JSON', () => {
    const file = writeAttestation('invalid.json', 'not json{');
    const { code } = run([
      `--attestation-file=${file}`,
      `--expected-sha=${HEAD}`,
    ]);
    assert.equal(code, 1);
  });

  it('exits 1 when sourceRevision is behind upstream head', () => {
    const file = writeAttestation(
      'stale.json',
      JSON.stringify({ sourceRevision: INSTALLED })
    );
    const { code, stdout } = run([
      `--attestation-file=${file}`,
      `--expected-sha=${HEAD}`,
    ]);
    assert.equal(code, 1);
    assert.match(stdout, /::error::/);
  });

  it('exits 0 when sourceRevision matches upstream head', () => {
    const file = writeAttestation(
      'fresh.json',
      JSON.stringify({ sourceRevision: HEAD })
    );
    const { code, stdout } = run([
      `--attestation-file=${file}`,
      `--expected-sha=${HEAD}`,
    ]);
    assert.equal(code, 0);
    assert.match(stdout, /matches upstream head/);
  });

  it('rejects a malformed --expected-sha', () => {
    const file = writeAttestation(
      'fresh2.json',
      JSON.stringify({ sourceRevision: HEAD })
    );
    const { code } = run([
      `--attestation-file=${file}`,
      '--expected-sha=short',
    ]);
    assert.equal(code, 1);
  });
});

describe('gem-producer-drift workflow', async () => {
  const { load } = await import('js-yaml');
  const { mkdirSync, readFileSync } = await import('node:fs');
  const workflowPath = fileURLToPath(
    new URL('../../.github/workflows/gem-producer-drift.yml', import.meta.url)
  );
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
  const doc = load(readFileSync(workflowPath, 'utf8'));
  const job = doc.jobs.drift;
  const verify = job.steps.find(step =>
    step.run?.includes('check-attestation.mjs')
  );

  it('alarms every 6 h on the Gem host, never hourly', () => {
    assert.deepEqual(doc.on.schedule, [{ cron: '43 */6 * * *' }]);
    assert.ok('workflow_dispatch' in doc.on);
    assert.deepEqual(job['runs-on'], [
      'self-hosted',
      'Linux',
      'X64',
      'jovie-fixed',
    ]);
  });

  it('runs the checker step red on a missing attestation and green on a match', () => {
    // Pin the upstream head so the real step body runs without a GitHub read.
    const script = verify.run.replace(
      'check-attestation.mjs --json',
      `check-attestation.mjs --json --expected-sha=${HEAD}`
    );
    const step = workspace => {
      try {
        execFileSync('bash', ['-c', script], {
          cwd: repoRoot,
          env: { ...process.env, GEM_WORKSPACE: workspace },
          encoding: 'utf8',
        });
        return 0;
      } catch (error) {
        return error.status;
      }
    };
    const workspace = join(dir, 'gem-workspace');
    mkdirSync(join(workspace, 'state'), { recursive: true });
    assert.notEqual(step(workspace), 0);
    writeFileSync(
      join(workspace, 'state', 'gem-pr-rehabilitation-attestation.json'),
      JSON.stringify({ sourceRevision: HEAD })
    );
    assert.equal(step(workspace), 0);
  });
});
