// Node adapter for github-release-asset.sh: downloads to a temp file (never
// stdout, so a retry cannot append bytes) and reads it back. Callers verify
// the returned bytes against their own sha256 pins.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RELEASE_ASSET_HELPER = fileURLToPath(
  new URL('./github-release-asset.sh', import.meta.url)
);

/**
 * @param {string} url https://github.com/<owner>/<repo>/releases/download/<tag>/<asset>
 * @returns {{ ok: true, bytes: Buffer } | { ok: false, error: string, status: string }}
 */
export function downloadReleaseAsset(url, { env = process.env } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'release-asset-'));
  const out = join(dir, 'asset');
  try {
    const result = spawnSync('bash', [RELEASE_ASSET_HELPER, url, out], {
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'inherit', 'pipe'],
    });
    const stderr = result.stderr ?? '';
    process.stderr.write(stderr);
    if (result.status === 0) return { ok: true, bytes: readFileSync(out) };
    const status = stderr.match(/\(last HTTP (\d{3})\)/)?.[1] ?? 'unavailable';
    return {
      ok: false,
      status,
      error: `release download exit ${result.status ?? 'signal'} (last HTTP ${status})`,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
