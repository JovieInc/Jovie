import { spawnSync } from 'node:child_process';

const readArgs = [
  'scripts/turbo-local.mjs',
  'typecheck',
  '--filter=@jovie/ui',
  '--cache=local:,remote:r',
  '--output-logs=hash-only',
];
const warmArgs = [
  'scripts/turbo-local.mjs',
  'typecheck',
  '--filter=@jovie/ui',
  '--cache=local:,remote:rw',
  '--output-logs=errors-only',
];

const readResult = runTurbo(readArgs);
const readOutput = printResult(readResult);

assertTurboSuccess(readResult);
assertRemoteEnabled(readOutput);

if (isCached(readOutput)) {
  console.log('[turbo-verify-cache] Remote cache read verified.');
  process.exit(0);
}

console.warn(
  '[turbo-verify-cache] Remote cache missed for this branch hash; warming remote cache and checking again.'
);

const warmResult = runTurbo(warmArgs);
printResult(warmResult);
assertTurboSuccess(warmResult);

const verifyResult = runTurbo(readArgs);
const verifyOutput = printResult(verifyResult);

assertTurboSuccess(verifyResult);
assertRemoteEnabled(verifyOutput);

if (!isCached(verifyOutput)) {
  console.error(
    '[turbo-verify-cache] Expected @jovie/ui#typecheck to be served from remote cache after warming.'
  );
  process.exit(1);
}

console.log('[turbo-verify-cache] Remote cache warm/read verified.');

function runTurbo(args) {
  return spawnSync('node', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: Number(process.env.JOVIE_TURBO_VERIFY_TIMEOUT_MS ?? 300000),
    shell: process.platform === 'win32',
  });
}

function printResult(result) {
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  process.stdout.write(output);
  return output;
}

function assertTurboSuccess(result) {
  if (result.error) {
    console.error(
      `[turbo-verify-cache] Failed to start turbo process: ${result.error.message}`
    );
    process.exit(1);
  }

  if (result.signal) {
    console.error(
      `[turbo-verify-cache] Turbo process terminated by signal: ${result.signal}`
    );
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function assertRemoteEnabled(output) {
  if (!output.includes('Remote caching enabled')) {
    console.error(
      '[turbo-verify-cache] Expected Turbo remote caching to be enabled.'
    );
    process.exit(1);
  }
}

function isCached(output) {
  return /Cached:\s+1 cached,\s+1 total/.test(output);
}
