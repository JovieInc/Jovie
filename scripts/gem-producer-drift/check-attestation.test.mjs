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
