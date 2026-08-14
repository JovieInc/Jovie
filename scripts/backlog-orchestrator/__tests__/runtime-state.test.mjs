import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import * as runtimeState from '../runtime-state.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORCHESTRATOR_DIR = resolve(__dirname, '..');

describe('no-LLM runtime state (JOV-5076)', () => {
  it('keeps the default cache and report outside the orchestrator checkout', () => {
    const env = { HOME: '/tmp/jovie-home', XDG_CACHE_HOME: '' };
    const cache = runtimeState.resolveCacheFile({
      env,
      orchestratorDir: ORCHESTRATOR_DIR,
    });
    const report = runtimeState.resolveReportFile({
      env,
      orchestratorDir: ORCHESTRATOR_DIR,
    });
    assert.equal(
      cache,
      '/tmp/jovie-home/.cache/jovie/.orchestrator-cache.json'
    );
    assert.equal(
      report,
      '/tmp/jovie-home/.cache/jovie/shadow-report-latest.txt'
    );
    assert.equal(runtimeState.isPathInside(cache, ORCHESTRATOR_DIR), false);
    assert.equal(runtimeState.isPathInside(report, ORCHESTRATOR_DIR), false);
    runtimeState.assertsOutsideGitTree(cache, ORCHESTRATOR_DIR);
    runtimeState.assertsOutsideGitTree(report, ORCHESTRATOR_DIR);
  });

  it('honors XDG_CACHE_HOME and explicit env overrides', () => {
    const xdg = runtimeState.resolveCacheFile({
      env: { XDG_CACHE_HOME: '/var/cache/xdg' },
      orchestratorDir: ORCHESTRATOR_DIR,
    });
    assert.equal(xdg, '/var/cache/xdg/jovie/.orchestrator-cache.json');
    const override = runtimeState.resolveCacheFile({
      env: { JOVIE_ORCHESTRATOR_CACHE: '/tmp/override-cache.json' },
      orchestratorDir: ORCHESTRATOR_DIR,
    });
    assert.equal(override, '/tmp/override-cache.json');
  });

  it('refuses to treat the legacy in-tree cache as a writable runtime path', () => {
    const tracked = runtimeState.resolveTrackedCacheFile(ORCHESTRATOR_DIR);
    assert.equal(
      tracked,
      resolve(ORCHESTRATOR_DIR, '.orchestrator-cache.json')
    );
    assert.throws(
      () => runtimeState.assertsOutsideGitTree(tracked, ORCHESTRATOR_DIR),
      /must not be written inside/
    );
  });

  it('does not fail-close when the only dirty path is the leftover cache', () => {
    const cacheOnly = runtimeState.classifyRuntimeDirt(
      ' M scripts/backlog-orchestrator/.orchestrator-cache.json\n'
    );
    assert.deepEqual(cacheOnly.ignorable, [
      'scripts/backlog-orchestrator/.orchestrator-cache.json',
    ]);
    assert.deepEqual(cacheOnly.blocking, []);
    assert.equal(cacheOnly.failClosed, false);

    const mixed = runtimeState.classifyRuntimeDirt(
      [
        ' M scripts/backlog-orchestrator/.orchestrator-cache.json',
        ' M scripts/backlog-orchestrator/admitter.mjs',
      ].join('\n')
    );
    assert.equal(mixed.failClosed, true);
    assert.deepEqual(mixed.blocking, [
      'scripts/backlog-orchestrator/admitter.mjs',
    ]);
  });

  it('creates parent directories for an out-of-tree cache write', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jovie-runtime-state-'));
    const file = join(dir, 'nested', '.orchestrator-cache.json');
    runtimeState.ensureParentDir(file);
    writeFileSync(file, '{"version":1}\n');
    assert.equal(runtimeState.isPathInside(file, ORCHESTRATOR_DIR), false);
  });
});
