import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {(command: string, args: string[], options: import('node:child_process').SpawnSyncOptionsWithStringEncoding) => Pick<import('node:child_process').SpawnSyncReturns<string>, 'status' | 'stdout' | 'error'>} MainRefRunner
 */

// Final release decisions must use a fresh authoritative ref, independently
// of the shared Actions REST quota. Never fall back to a cached checkout.
/** @param {{ repository: string, token?: string, run?: MainRefRunner }} options */
export function resolveMainSha({
  repository,
  token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN,
  run = spawnSync,
}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) {
    throw new Error('A valid GitHub repository is required to resolve main.');
  }
  const remote = `https://github.com/${repository}.git`;
  /** @type {NodeJS.ProcessEnv} */
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  if (token) {
    const index = Number(env.GIT_CONFIG_COUNT || 0);
    env.GIT_CONFIG_COUNT = String(index + 1);
    env[`GIT_CONFIG_KEY_${index}`] = 'http.https://github.com/.extraheader';
    env[`GIT_CONFIG_VALUE_${index}`] =
      `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
  }
  const result = run(
    'git',
    ['ls-remote', '--exit-code', remote, 'refs/heads/main'],
    { encoding: 'utf8', env, timeout: 15_000, maxBuffer: 4096 }
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      'Could not resolve current main through git within 15 seconds.'
    );
  }
  const match = /^([0-9a-f]{40})\trefs\/heads\/main\n?$/.exec(result.stdout);
  if (!match || match[1] === '0'.repeat(40)) {
    throw new Error(
      'Git returned missing, malformed, or ambiguous main ref evidence.'
    );
  }
  return match[1];
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.stdout.write(
      `${resolveMainSha({ repository: process.argv[2] })}\n`
    );
  } catch (error) {
    process.stderr.write(`::error::${error.message}\n`);
    process.exitCode = 1;
  }
}
