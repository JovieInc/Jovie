import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { load } from 'js-yaml';

const workflow =
  /** @type {{jobs: {sonarcloud: {steps: Array<{name?: string, uses?: string, run?: string}>}}}} */ (
    load(
      readFileSync(
        new URL('../.github/workflows/sonarcloud.yml', import.meta.url),
        'utf8'
      )
    )
  );
const steps = workflow.jobs.sonarcloud.steps;
const validation = steps.find(
  step => step.name === 'Validate SonarCloud token before the scan'
);

function validate(t, response, code = 0) {
  const dir = mkdtempSync(path.join(tmpdir(), 'sonar-token-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(
    path.join(dir, 'curl'),
    '#!/bin/sh\nprintf "%s" "$FIXTURE_RESPONSE"\nexit "$FIXTURE_EXIT"\n',
    { mode: 0o755 }
  );
  return spawnSync('bash', ['-euo', 'pipefail', '-c', validation.run], {
    encoding: 'utf8',
    timeout: 5000,
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      SONAR_TOKEN: 'fixture-sonar-credential',
      FIXTURE_RESPONSE: response,
      FIXTURE_EXIT: String(code),
    },
  });
}

test('Sonar rejects a dead token before dependency setup or coverage', () => {
  const preparation = steps.findIndex(step =>
    step.uses?.startsWith('./.github/actions/setup-node-pnpm')
  );
  assert.ok(steps.indexOf(validation) < preparation);
});

for (const response of ['{"valid":true}', '{ "valid": true }']) {
  test(`Sonar accepts validated credentials: ${response}`, t => {
    const result = validate(t, response);
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
}

for (const response of [
  '{"valid":false}',
  '{"valid":false,"diagnostic":{"valid":true}}',
  '{"valid":true,"valid":false}',
  '{"valid":"true"}',
  'unavailable',
  '',
]) {
  test(`Sonar fails closed on unvalidated credentials: ${response || 'empty'}`, t => {
    const result = validate(t, response);
    assert.ifError(result.error);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /::error::/);
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /fixture-sonar-credential/
    );
  });
}

test('Sonar fails closed on transport errors even with a valid-looking body', t => {
  const result = validate(t, '{"valid":true}', 22);
  assert.ifError(result.error);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /::error::/);
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /fixture-sonar-credential/
  );
});
