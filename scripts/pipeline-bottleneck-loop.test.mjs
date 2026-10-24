import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const script = new URL('./pipeline-bottleneck-loop.mts', import.meta.url);
const run = args =>
  spawnSync(process.execPath, [script.pathname, ...args], { encoding: 'utf8' });

test('hourly CLI prioritizes golden-path issues without overwriting the collector', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bottleneck-cli-'));
  const path = join(directory, 'bottleneck-state.json');
  const state = {
    ts: '2026-10-23T12:00:00Z',
    metrics: {},
    ranking: [{ id: 'queue', weight: 9000 }],
    unmeasured: [],
    golden_path_sentry: {
      score: 72,
      unresolved_issues: 1,
      users_affected_24h: 2,
      top_issue: null,
      checked_at: '2026-10-23T11:59:00Z',
    },
  };
  const original = JSON.stringify(state);
  try {
    writeFileSync(path, original);
    const result = run([path]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.schema, 'pipeline-bottleneck/v1');
    assert.equal(output.ranking[0].id, 'golden_path_sentry');
    assert.ok(output.ranking[0].weight > output.ranking[1].weight);
    assert.equal(
      output.golden_path_sentry.checked_at,
      state.golden_path_sentry.checked_at
    );
    assert.equal(readFileSync(path, 'utf8'), original);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('hourly CLI fails closed without a snapshot', () => {
  const result = run([]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unavailable or invalid/u);
  assert.equal(result.stdout, '');
});
