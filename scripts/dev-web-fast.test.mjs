import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDir, '..');
const devWebFastScript = path.join(scriptsDir, 'dev-web-fast.sh');

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port);
          return;
        }

        reject(new Error('Unable to allocate a local test port'));
      });
    });
  });
}

function makeFakeDoppler(binDir) {
  const dopplerPath = path.join(binDir, 'doppler');

  writeFileSync(
    dopplerPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$@" > "$JOVIE_FAKE_DOPPLER_CAPTURE"
printf 'Ready in 1ms\\n'
sleep 1
`,
    { mode: 0o755 }
  );
}

test('dev-web-fast keeps optional unset args behind a non-empty guard', () => {
  const scriptText = readFileSync(devWebFastScript, 'utf8');
  const guardIndex = scriptText.indexOf(
    'if [ "${#ENV_UNSET_ARGS[@]}" -gt 0 ]; then'
  );
  const elseIndex = scriptText.indexOf('\nelse\n', guardIndex);
  const envUnsetExpansions = [
    ...scriptText.matchAll(/"\$\{ENV_UNSET_ARGS\[@\]\}"/g),
  ];

  assert.notEqual(
    guardIndex,
    -1,
    'ENV_UNSET_ARGS must be length-checked before expansion for macOS Bash 3.2'
  );
  assert.notEqual(
    elseIndex,
    -1,
    'Guarded ENV_UNSET_ARGS branch must have else'
  );
  assert.equal(
    envUnsetExpansions.length,
    1,
    'ENV_UNSET_ARGS must have exactly one command expansion'
  );
  assert.ok(
    envUnsetExpansions[0].index > guardIndex &&
      envUnsetExpansions[0].index < elseIndex,
    'ENV_UNSET_ARGS must only expand inside the non-empty branch'
  );
});

test('dev-web-fast starts when eval unset args are populated', async () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'jovie-dev-web-fast-test-'));
  const binDir = path.join(tmp, 'bin');
  const capturePath = path.join(tmp, 'doppler-args.txt');

  try {
    mkdirSync(binDir, { recursive: true });
    makeFakeDoppler(binDir);

    const port = await getAvailablePort();
    const result = spawnSync('bash', [devWebFastScript], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        PORT: String(port),
        TMPDIR: tmp,
        JOVIE_DEV_WARM_ROUTES: '',
        JOVIE_DEV_READY_TIMEOUT: '5',
        JOVIE_DISABLE_MODEL_KEYS_FOR_EVALS: '1',
        JOVIE_DISABLE_REDIS_FOR_EVALS: '1',
        JOVIE_FAKE_DOPPLER_CAPTURE: capturePath,
      },
      timeout: 10_000,
    });

    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.status, 0, output);
    assert.match(output, /Redis env disabled for isolated evals/);
    assert.match(output, /model provider env disabled for isolated evals/);
    assert.doesNotMatch(output, /ENV_UNSET_ARGS/);

    const dopplerArgs = readFileSync(capturePath, 'utf8').trim().split('\n');
    assert.ok(dopplerArgs.includes('-u'));
    assert.ok(dopplerArgs.includes('UPSTASH_REDIS_REST_URL'));
    assert.ok(dopplerArgs.includes('AI_GATEWAY_API_KEY'));
    assert.ok(dopplerArgs.includes('pnpm'));
  } finally {
    rmSync(tmp, { force: true, recursive: true });
  }
});

test('dev-web-fast starts when optional env unset args are empty', async () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'jovie-dev-web-fast-test-'));
  const binDir = path.join(tmp, 'bin');
  const capturePath = path.join(tmp, 'doppler-args.txt');

  try {
    mkdirSync(binDir, { recursive: true });
    makeFakeDoppler(binDir);

    const port = await getAvailablePort();
    const result = spawnSync('bash', [devWebFastScript], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        PORT: String(port),
        TMPDIR: tmp,
        JOVIE_DEV_WARM_ROUTES: '',
        JOVIE_DEV_READY_TIMEOUT: '5',
        JOVIE_DISABLE_MODEL_KEYS_FOR_EVALS: '0',
        JOVIE_DISABLE_REDIS_FOR_EVALS: '0',
        JOVIE_FAKE_DOPPLER_CAPTURE: capturePath,
      },
      timeout: 10_000,
    });

    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.status, 0, output);
    assert.doesNotMatch(output, /ENV_UNSET_ARGS/);

    const dopplerArgs = readFileSync(capturePath, 'utf8').trim().split('\n');
    assert.ok(dopplerArgs.includes('E2E_USE_TEST_AUTH_BYPASS=1'));
    assert.ok(dopplerArgs.includes('NEXT_PUBLIC_CLERK_MOCK=1'));
    assert.ok(dopplerArgs.includes('pnpm'));
  } finally {
    rmSync(tmp, { force: true, recursive: true });
  }
});
