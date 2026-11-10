import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  downloadReleaseAsset,
  RELEASE_ASSET_HELPER,
} from '../github-release-asset.mjs';

const URL =
  'https://github.com/koalaman/shellcheck/releases/download/v0.11.0/shellcheck-v0.11.0.linux.x86_64.tar.xz';
const temporary = [];
afterEach(() => {
  for (const dir of temporary.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

// No network: curl acts like `curl --fail` (status on stdout, exit 22); gh
// logs its token and args and writes the asset to -O.
function harness({ anonymous = '504', gh = 'ok' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'release-asset-'));
  temporary.push(dir);
  const write = (name, body) =>
    writeFileSync(join(dir, name), `#!/usr/bin/env bash\n${body}\n`, {
      mode: 0o755,
    });
  write(
    'curl',
    `printf '%s\\n' "$*" >>"$CALLS.curl"
while [[ $# -gt 0 ]]; do [[ "$1" == --output ]] && out="$2"; shift; done
if [[ "$TEST_ANONYMOUS" == 200 ]]; then printf anonymous >"$out"; printf 200; exit 0; fi
printf partial >"$out"; printf '%s' "$TEST_ANONYMOUS"; exit 22`
  );
  write(
    'gh',
    `printf '%s %s\\n' "\${GH_TOKEN:-}" "$*" >>"$CALLS.gh"
[[ "$TEST_GH" == ok ]] || exit 1
while [[ $# -gt 0 ]]; do [[ "$1" == -O ]] && out="$2"; shift; done
printf authenticated >"$out"`
  );
  write('sleep', 'printf "%s\\n" "$1" >>"$CALLS.sleep"');
  const env = {
    ...process.env,
    PATH: `${dir}:${process.env.PATH}`,
    CALLS: join(dir, 'calls'),
    TEST_ANONYMOUS: anonymous,
    TEST_GH: gh,
    RELEASE_DOWNLOAD_RETRY_DELAY: '1',
    RELEASE_DOWNLOAD_TOKEN: '',
    GH_TOKEN: '',
    GITHUB_TOKEN: '',
  };
  const read = kind =>
    existsSync(`${env.CALLS}.${kind}`)
      ? readFileSync(`${env.CALLS}.${kind}`, 'utf8').trim().split('\n')
      : [];
  const run = (extra = {}, url = URL) => {
    const out = join(dir, 'asset');
    const result = spawnSync('bash', [RELEASE_ASSET_HELPER, url, out], {
      env: { ...env, ...extra },
      encoding: 'utf8',
    });
    return {
      status: result.status,
      stderr: result.stderr,
      asset: existsSync(out) ? readFileSync(out, 'utf8') : null,
    };
  };
  return { run, read, env };
}

describe('github-release-asset.sh', () => {
  it('uses the anonymous download when it works and spends no token', () => {
    const h = harness({ anonymous: '200' });
    const result = h.run({ RELEASE_DOWNLOAD_TOKEN: 'job-token' });
    expect(result).toMatchObject({ status: 0, asset: 'anonymous' });
    expect(h.read('curl')).toHaveLength(1);
    expect(h.read('curl')[0]).toMatch(/--fail .*--output /);
    expect(h.read('gh')).toEqual([]);
  });

  it('falls back to the exact pinned asset through the authenticated API', () => {
    const h = harness();
    const result = h.run({ RELEASE_DOWNLOAD_TOKEN: 'job-token' });
    expect(result).toMatchObject({ status: 0, asset: 'authenticated' });
    expect(h.read('gh')).toHaveLength(1);
    expect(h.read('gh')[0]).toMatch(
      /^job-token release download v0\.11\.0 -R koalaman\/shellcheck -p shellcheck-v0\.11\.0\.linux\.x86_64\.tar\.xz -O \S+ --clobber$/
    );
    expect(result.stderr).toContain('anonymous HTTP 504');
  });

  it('reads GH_TOKEN and never calls the API without a token', () => {
    const h = harness();
    expect(h.run({ RELEASE_DOWNLOAD_ATTEMPTS: '2' }).status).toBe(1);
    expect(h.read('gh')).toEqual([]);
    expect(h.run({ GH_TOKEN: 'gh-token' }).status).toBe(0);
    expect(h.read('gh')[0]).toMatch(/^gh-token release download /);
  });

  it('fails closed after bounded, doubling, jittered backoff', () => {
    const h = harness({ gh: 'fail' });
    const result = h.run({ RELEASE_DOWNLOAD_TOKEN: 'job-token' });
    expect(result.status).toBe(1);
    expect(result.asset).toBeNull();
    expect(result.stderr).toContain(
      `release download failed after 6 attempts (last HTTP 504): ${URL}`
    );
    expect(h.read('curl')).toHaveLength(6);
    expect(h.read('gh')).toHaveLength(6);
    const sleeps = h.read('sleep').map(Number);
    expect(sleeps).toHaveLength(5);
    sleeps.forEach((slept, i) => {
      expect(slept).toBeGreaterThanOrEqual(2 ** i);
      expect(slept).toBeLessThanOrEqual(2 ** (i + 1));
    });
  });

  it.each([
    'https://example.com/koalaman/shellcheck/releases/download/v1/x.tar.xz',
    'https://github.com/koalaman/shellcheck/archive/refs/tags/v0.11.0.tar.gz',
    'https://github.com/koalaman/shellcheck/releases/download/v0.11.0/../x',
    'https://github.com/koalaman/shellcheck/releases/download/../x.tar.xz',
  ])('refuses anything but a pinned release asset URL: %s', url => {
    const h = harness({ anonymous: '200' });
    expect(h.run({}, url).status).toBe(2);
    expect(h.read('curl')).toEqual([]);
  });

  it('returns bytes to node callers and reports the last HTTP status', () => {
    const ok = harness({ anonymous: '200' });
    expect(downloadReleaseAsset(URL, { env: ok.env })).toEqual({
      ok: true,
      bytes: Buffer.from('anonymous'),
    });
    const down = harness({ gh: 'fail' });
    expect(
      downloadReleaseAsset(URL, {
        env: { ...down.env, RELEASE_DOWNLOAD_ATTEMPTS: '1' },
      })
    ).toMatchObject({ ok: false, status: '504' });
  });
});
