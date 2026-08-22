import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const hooksDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(hooksDir, '../..');
const gateScript = path.join(hooksDir, 'pre-push-gate.sh');

function runGate(args = [], env = {}) {
  return spawnSync('bash', [gateScript, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('pre-push-gate.sh is executable and documents escape hatch', () => {
  const source = readFileSync(gateScript, 'utf8');
  assert.match(source, /JOVIE_SKIP_PRE_PUSH_GATE/);
  chmodSync(gateScript, 0o755);
});

test('pre-push-gate.sh skips when JOVIE_SKIP_PRE_PUSH_GATE=1', () => {
  const result = runGate(['lint'], { JOVIE_SKIP_PRE_PUSH_GATE: '1' });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.match(output, /skipped \(JOVIE_SKIP_PRE_PUSH_GATE=1\)/);
});

test('pre-push-gate.sh rejects unknown mode', () => {
  const result = runGate(['nope']);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 2, output);
  assert.match(output, /usage: scripts\/hooks\/pre-push-gate\.sh/);
});

test('.no-mistakes.yaml points lint/test/format at pre-push-gate.sh', () => {
  const config = readFileSync(path.join(repoRoot, '.no-mistakes.yaml'), 'utf8');
  assert.match(config, /lint: bash scripts\/hooks\/pre-push-gate\.sh lint/);
  assert.match(config, /test: bash scripts\/hooks\/pre-push-gate\.sh test/);
  assert.match(config, /format: bash scripts\/hooks\/pre-push-gate\.sh format/);
});

test('.husky/pre-push separates draft publication from qualification', () => {
  const hook = readFileSync(path.join(repoRoot, '.husky/pre-push'), 'utf8');
  assert.match(hook, /set -e/);
  assert.match(hook, /JOVIE_PUSH_PHASE:-qualification/);
  assert.match(hook, /pre-push-gate\.sh publication/);
  assert.match(hook, /pre-push-gate\.sh affected/);
});

test('publication remains policy gated without running affected tests', () => {
  const source = readFileSync(gateScript, 'utf8');
  const publication = source
    .split('run_publication() {', 2)[1]
    .split('\n}', 1)[0];
  assert.match(publication, /ci-branching-guard\.mjs check/);
  assert.match(publication, /--mode warn/);
  assert.match(publication, /git diff --check/);
  assert.match(publication, /scan-secrets\.sh publication origin\/main/);
  assert.match(publication, /policy-gate-liveness\.mjs/);
  assert.doesNotMatch(publication, /automation-verify|run_affected/);
  assert.doesNotMatch(publication, /typecheck|biome|coverage/);
});
