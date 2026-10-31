import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chooseMode,
  evidenceMatches,
  formatEvidence,
  isInfraTimeout,
  parseEvidence,
} from '../prepush-offload.mjs';

test('load above cores x 1.5 offloads to Gem; at or below stays local', () => {
  assert.equal(chooseMode({ load: 16, cores: 10 }), 'remote');
  assert.equal(chooseMode({ load: 15, cores: 10 }), 'local');
  assert.equal(chooseMode({ load: 50, cores: 10, env: { CI: '1' } }), 'local');
  assert.equal(
    chooseMode({ load: 1, cores: 10, env: { JOVIE_PREPUSH_REMOTE: '1' } }),
    'remote'
  );
});

test('timeouts and kills are infra failures; plain failures are not', () => {
  assert.equal(
    isInfraTimeout({ code: 1, out: 'Test timed out after 5000ms' }),
    true
  );
  assert.equal(isInfraTimeout({ code: 137, out: '' }), true);
  assert.equal(
    isInfraTimeout({ code: 1, out: 'AssertionError: expected 1' }),
    false
  );
  assert.equal(isInfraTimeout({ code: 0, out: 'timed out' }), false);
});

test('evidence must pass and match the exact sha and tree', () => {
  const ev = { sha: 'a', tree: 't', rc: 0 };
  const parsed = parseEvidence(`noise\n${formatEvidence(ev)}\n`);
  assert.equal(evidenceMatches(parsed, { sha: 'a', tree: 't' }), true);
  assert.equal(evidenceMatches(parsed, { sha: 'b', tree: 't' }), false);
  assert.equal(evidenceMatches(parsed, { sha: 'a', tree: 'u' }), false);
  assert.equal(
    evidenceMatches({ ...ev, rc: 1 }, { sha: 'a', tree: 't' }),
    false
  );
  assert.equal(parseEvidence('nothing'), null);
});

test('backend order: local, then Gem when its load is fine, else Actions', async () => {
  const { chooseBackend } = await import('../prepush-offload.mjs');
  assert.equal(chooseBackend({ load: 3, cores: 10 }), 'local');
  assert.equal(
    chooseBackend({ load: 60, cores: 10, gem: { load: 8, cores: 16 } }),
    'gem'
  );
  assert.equal(
    chooseBackend({ load: 60, cores: 10, gem: { load: 110, cores: 16 } }),
    'actions'
  );
  assert.equal(chooseBackend({ load: 60, cores: 10, gem: null }), 'actions');
  assert.equal(
    chooseBackend({
      load: 1,
      cores: 10,
      env: { JOVIE_PREPUSH_BACKEND: 'actions' },
    }),
    'actions'
  );
});
