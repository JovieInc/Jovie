import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { describe, expect, it } from 'vitest';

// gh-api-hold.sh retries transient GitHub gateway failures (5xx, 408,
// timeouts) only when the caller opts in via GH_API_RETRY_ATTEMPTS. The
// default stays single-attempt so callers that already loop around this
// script keep their own attempt budgets. 4xx and rate-limit responses are
// never transient-retried: 4xx fails closed immediately and rate limits
// still take the hold path.
const HOLD = new URL(
  '../../../.github/scripts/gh-api-hold.sh',
  import.meta.url
);

/**
 * @param {Object} options
 * @param {number} options.failures Number of initial gh calls that fail with
 *   `error` before the fake gh succeeds.
 * @param {string} options.error Error text the fake gh writes to stderr.
 * @param {string} [options.retryAttempts] GH_API_RETRY_ATTEMPTS value.
 * @param {string} [options.retrySeconds] GH_API_RETRY_SECONDS value.
 * @param {string} [options.rateLimitReset] When set, the fake gh answers
 *   `api rate_limit` probes with this epoch (rate-limit hold path).
 * @returns {{status: number | undefined, stdout: string, stderr: string, calls: number, slept: string}}
 */
function runHold({
  failures,
  error,
  retryAttempts,
  retrySeconds,
  rateLimitReset,
}) {
  const root = mkdtempSync(join(tmpdir(), 'gh-api-hold-retry-'));
  try {
    const calls = join(root, 'calls');
    writeFileSync(calls, '0');
    const slept = join(root, 'slept');
    writeFileSync(slept, '');
    writeFileSync(
      join(root, 'sleep'),
      `#!/bin/sh
printf '%s\\n' "$1" >> "${slept}"
exit 0
`
    );
    chmodSync(join(root, 'sleep'), 0o755);
    writeFileSync(
      join(root, 'gh'),
      `#!/bin/sh
n="$(cat "${calls}")"
n=$((n + 1))
printf '%s' "$n" > "${calls}"
case "$*" in
  *rate_limit*) printf '%s\\n' "${rateLimitReset ?? ''}"; exit 0 ;;
esac
if [ "$n" -le "${failures}" ]; then
  printf '%s\\n' '${error}' >&2
  exit 1
fi
printf '%s\\n' '{"ok":true}'
exit 0
`
    );
    chmodSync(join(root, 'gh'), 0o755);
    /** @type {NodeJS.ProcessEnv} */
    const env = {
      ...process.env,
      PATH: `${root}${delimiter}${process.env.PATH}`,
      GH_TOKEN: 'token',
    };
    if (retryAttempts != null) {
      env.GH_API_RETRY_ATTEMPTS = retryAttempts;
    } else {
      delete env.GH_API_RETRY_ATTEMPTS;
    }
    if (retrySeconds != null) {
      env.GH_API_RETRY_SECONDS = retrySeconds;
    } else {
      delete env.GH_API_RETRY_SECONDS;
    }
    const result = spawnSync(
      'bash',
      [HOLD.pathname, 'api', 'repos/JovieInc/Jovie/actions/runs/1/jobs'],
      { encoding: 'utf8', timeout: 10_000, env }
    );
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      calls: Number(readFileSync(calls, 'utf8')),
      slept: readFileSync(slept, 'utf8').trim(),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('gh-api-hold.sh transient retry', () => {
  it('retries a transient 5xx and succeeds within the attempt budget', () => {
    const result = runHold({
      failures: 1,
      error: 'gh: HTTP 503: service unavailable (url: https://api.github.com)',
      retryAttempts: '3',
      retrySeconds: '0',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('{"ok":true}');
    expect(result.calls).toBe(2);
    expect(result.stderr).toContain('retrying');
  });

  it('backs off between transient retries', () => {
    const result = runHold({
      failures: 1,
      error: 'gh: HTTP 503: service unavailable (url: https://api.github.com)',
      retryAttempts: '3',
      retrySeconds: '2',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls).toBe(2);
    expect(result.slept).toBe('2');
  });

  it('does not retry a 404', () => {
    const result = runHold({
      failures: 99,
      error: 'gh: HTTP 404: Not Found (url: https://api.github.com)',
      retryAttempts: '3',
      retrySeconds: '0',
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.calls).toBe(1);
    expect(result.slept).toBe('');
  });

  it('does not retry an auth failure', () => {
    const result = runHold({
      failures: 99,
      error: 'gh: HTTP 401: Bad credentials (url: https://api.github.com)',
      retryAttempts: '3',
      retrySeconds: '0',
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.calls).toBe(1);
  });

  it('exhausts the attempt budget and fails closed on a persistent 5xx', () => {
    const result = runHold({
      failures: 99,
      error: 'gh: HTTP 503: service unavailable (url: https://api.github.com)',
      retryAttempts: '3',
      retrySeconds: '0',
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.calls).toBe(3);
    expect(result.stderr).toContain('HTTP 503');
  });

  it('keeps the single-attempt default when the caller does not opt in', () => {
    const result = runHold({
      failures: 99,
      error: 'gh: HTTP 503: service unavailable (url: https://api.github.com)',
    });
    expect(result.status).not.toBe(0);
    expect(result.calls).toBe(1);
    expect(result.stderr).not.toContain('retrying');
  });

  it('routes rate-limit responses to the hold, not the transient retry', () => {
    const result = runHold({
      failures: 1,
      error: 'API rate limit exceeded for installation',
      retryAttempts: '3',
      retrySeconds: '0',
      rateLimitReset: String(Math.floor(Date.now() / 1000) + 5),
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('{"ok":true}');
    expect(result.calls).toBe(3);
    expect(result.stderr).toContain('Holding');
    expect(result.stderr).not.toContain('transient failure');
  });
});
