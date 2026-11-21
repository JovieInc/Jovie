import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildSwiftpmCacheReceipt,
  formatSwiftpmCacheSummary,
} from './ios-ci-swiftpm-cache-receipt.mjs';

const scriptPath = fileURLToPath(
  new URL('./ios-ci-swiftpm-cache-receipt.mjs', import.meta.url)
);

test('full cache hit marks resolve skipped and claimReady', () => {
  const receipt = buildSwiftpmCacheReceipt({
    SWIFTPM_CACHE_HIT: 'true',
    SWIFTPM_RESOLVE_OUTCOME: 'skipped',
    GITHUB_SHA: 'abc',
    GITHUB_RUN_ID: '1',
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_REPOSITORY: 'JovieInc/Jovie',
    RUNNER_ENVIRONMENT: 'github-hosted',
  });
  assert.equal(receipt.cacheHit, true);
  assert.equal(receipt.resolveSkipped, true);
  assert.equal(receipt.resolveDurationSeconds, 0);
  assert.equal(receipt.claimReady, true);
  assert.equal(
    receipt.runUrl,
    'https://github.com/JovieInc/Jovie/actions/runs/1'
  );
});

test('cache miss with timed resolve stays claimReady=false', () => {
  const receipt = buildSwiftpmCacheReceipt({
    SWIFTPM_CACHE_HIT: 'false',
    SWIFTPM_RESOLVE_OUTCOME: 'success',
    SWIFTPM_RESOLVE_DURATION_SECONDS: '76',
  });
  assert.equal(receipt.cacheHit, false);
  assert.equal(receipt.resolveSkipped, false);
  assert.equal(receipt.resolveDurationSeconds, 76);
  assert.equal(receipt.claimReady, false);
});

test('summary names JOV-14016 and baselines', () => {
  const receipt = buildSwiftpmCacheReceipt({
    SWIFTPM_CACHE_HIT: 'true',
    SWIFTPM_RESOLVE_OUTCOME: 'skipped',
  });
  const summary = formatSwiftpmCacheSummary(receipt);
  assert.match(summary, /JOV-14016/);
  assert.match(summary, /baseline warm resolve/);
  assert.match(summary, /46s/);
});

test('CLI writes receipt JSON under artifacts/ios-ci', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'swiftpm-receipt-'));
  try {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd,
      env: {
        ...process.env,
        SWIFTPM_CACHE_HIT: 'true',
        SWIFTPM_RESOLVE_OUTCOME: 'skipped',
        GITHUB_SHA: 'deadbeef',
        GITHUB_RUN_ID: '99',
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_REPOSITORY: 'JovieInc/Jovie',
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const written = JSON.parse(
      readFileSync(
        path.join(cwd, 'artifacts/ios-ci/swiftpm-cache-receipt.json'),
        'utf8'
      )
    );
    assert.equal(written.schema, 'jovie.ios-ci.swiftpm-cache-receipt/v1');
    assert.equal(written.claimReady, true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
