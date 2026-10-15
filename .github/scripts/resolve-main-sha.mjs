import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Read GitHub's authoritative Git ref without spending REST installation quota.
// One bounded read, no cached SHA, fallback, credential creation, or retries.
/**
 * @param {string} repository
 * @param {{run?: (command: string, args: string[], options: import('node:child_process').SpawnSyncOptionsWithStringEncoding) => {status: number | null, stdout?: string, error?: Error}}} [options]
 */
export function resolveMainSha(repository, { run = spawnSync } = {}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) {
    throw new Error('Current-main lookup requires an owner/repository.');
  }
  const result = run(
    'git',
    [
      'ls-remote',
      '--exit-code',
      `https://github.com/${repository}.git`,
      'refs/heads/main',
    ],
    {
      encoding: 'utf8',
      timeout: 15_000,
      maxBuffer: 64 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  if (result.error || result.status !== 0) {
    // Never echo remote stderr, which can contain credential-bearing URLs.
    throw new Error('Current-main Git ref lookup failed or timed out.');
  }
  const match = /^([0-9a-f]{40})\trefs\/heads\/main\n?$/.exec(
    result.stdout ?? ''
  );
  if (!match || /^0{40}$/.test(match[1])) {
    throw new Error('Current-main Git ref lookup returned invalid evidence.');
  }
  return match[1];
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(resolveMainSha(process.argv[2]));
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
