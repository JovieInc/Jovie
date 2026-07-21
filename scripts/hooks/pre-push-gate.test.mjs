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

test('.husky/pre-push delegates to the pre-push-gate affected profile', () => {
  const hook = readFileSync(path.join(repoRoot, '.husky/pre-push'), 'utf8');
  assert.match(hook, /set -e/);
  assert.match(hook, /pre-push-gate\.sh affected/);
});
