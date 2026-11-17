import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { acquireSlot, holders, slotsBusy } from '../preflight-lock.mjs';
import {
  failingItemLines,
  hostOverloaded,
  NARROWED_LOCAL,
  unrelatedFailure,
  verdictLine,
} from '../preflight-scope.mjs';
import { percentile, recordTimings, summarize } from '../preflight-timing.mjs';
import {
  chooseMode,
  evidenceMatches,
  formatEvidence,
  isInfraTimeout,
  parseEvidence,
} from '../prepush-offload.mjs';
import { selectScriptContracts } from '../script-contract-affected.mjs';

test('load above cores x 1.5 offloads to Gem; at or below stays local', () => {
  // Explicit env: ambient CI in agent hosts would force local via process.env.
  assert.equal(chooseMode({ load: 16, cores: 10, env: {} }), 'remote');
  assert.equal(chooseMode({ load: 15, cores: 10, env: {} }), 'local');
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

const tmp = () => mkdtempSync(path.join(tmpdir(), 'pf-scope-'));

function fixture() {
  const root = tmp();
  mkdirSync(path.join(root, 'scripts/lib'), { recursive: true });
  const w = (f, c) => writeFileSync(path.join(root, f), c);
  w('scripts/lib/a.mjs', 'export const a = 1;\n');
  w('scripts/lib/b.mjs', 'export const b = 2;\n');
  w('scripts/a.test.mjs', "import { a } from './lib/a.mjs';\n");
  w('scripts/b.test.mjs', "import { b } from './lib/b.mjs';\n");
  return root;
}

test('local script-contract scope: only touched scripts and their importers', () => {
  const root = fixture();
  const opts = {
    root,
    node: ['scripts/a.test.mjs', 'scripts/b.test.mjs'],
    vitest: [],
  };
  // CI rule (default) still runs the full list for any scripts/*.mjs change.
  const ci = selectScriptContracts(['scripts/lib/a.mjs'], opts);
  assert.equal(ci.full, true);
  assert.deepEqual(ci.node, opts.node);
  // Local scope narrows to the importer of the touched script.
  const local = selectScriptContracts(['scripts/lib/a.mjs'], {
    ...opts,
    derivedOnly: true,
  });
  assert.equal(local.full, false);
  assert.deepEqual(local.node, ['scripts/a.test.mjs']);
  // Depth is limited to the touched script and its direct importers.
  writeFileSync(
    path.join(root, 'scripts/lib/c.mjs'),
    "import { a } from './a.mjs';\n"
  );
  writeFileSync(
    path.join(root, 'scripts/c.test.mjs'),
    "import './lib/c.mjs';\n"
  );
  writeFileSync(path.join(root, 'scripts/lib/d.mjs'), "import './c.mjs';\n");
  writeFileSync(
    path.join(root, 'scripts/d.test.mjs'),
    "import './lib/d.mjs';\n"
  );
  const deep = selectScriptContracts(['scripts/lib/a.mjs'], {
    root,
    node: ['scripts/a.test.mjs', 'scripts/c.test.mjs', 'scripts/d.test.mjs'],
    vitest: [],
    derivedOnly: true,
  });
  assert.deepEqual(deep.node, ['scripts/a.test.mjs', 'scripts/c.test.mjs']);
  // A docs-only change selects nothing locally.
  assert.deepEqual(
    selectScriptContracts(['docs/x.md'], { ...opts, derivedOnly: true }).node,
    []
  );
});

test('script-contracts is narrowed locally and the remainder is reported', () => {
  assert.match(NARROWED_LOCAL['script-contracts'].command, /--derived-only/);
  assert.ok(NARROWED_LOCAL['script-contracts'].deferredToCi);
});

test('a failure in a test the change cannot reach is unrelated; a reachable or unnamed one is not', () => {
  const root = fixture();
  const changed = ['scripts/lib/a.mjs'];
  assert.equal(unrelatedFailure(['scripts/b.test.mjs'], changed, root), true);
  assert.equal(unrelatedFailure(['scripts/a.test.mjs'], changed, root), false);
  assert.equal(
    unrelatedFailure(
      ['scripts/a.test.mjs', 'scripts/b.test.mjs'],
      changed,
      root
    ),
    false
  );
  // the failing test file itself changed
  assert.equal(
    unrelatedFailure(['scripts/b.test.mjs'], ['scripts/b.test.mjs'], root),
    false
  );
  // fail closed: TS tests are not dependency-scanned, so they are always related
  writeFileSync(path.join(root, 'scripts/x.test.ts'), 'export {};\n');
  assert.equal(unrelatedFailure(['scripts/x.test.ts'], changed, root), false);
  // fail closed: nothing named, or an unresolvable path
  assert.equal(unrelatedFailure([], changed, root), false);
  assert.equal(
    unrelatedFailure(['scripts/gone.test.mjs'], changed, root),
    false
  );
});

test('slot lock: one holder, waiters announce, dead holder is reclaimed', async () => {
  const dir = tmp();
  const logs = [];
  const first = await acquireSlot({
    dir,
    label: 'one',
    log: m => logs.push(m),
  });
  assert.equal(slotsBusy({ dir }), true);
  let polls = 0;
  const second = await acquireSlot({
    dir,
    label: 'two',
    log: m => logs.push(m),
    pollMs: 1,
    sleep: async () => {
      polls += 1;
      if (polls === 3) first.release();
    },
  });
  assert.ok(polls >= 3);
  assert.ok(logs.some(m => /waiting for preflight slot/.test(m)));
  assert.equal(holders(dir).length, 1);
  second.release();
  assert.equal(slotsBusy({ dir }), false);
  // stale holder (pid not alive) is reclaimed
  writeFileSync(
    path.join(dir, 'slot-0.json'),
    JSON.stringify({ pid: 2 ** 22 + 12345, label: 'dead' })
  );
  assert.equal(slotsBusy({ dir }), false);
  rmSync(dir, { recursive: true, force: true });
});

test('slot lock times out instead of deadlocking', async () => {
  const dir = tmp();
  await acquireSlot({ dir, log() {} });
  const r = await acquireSlot({
    dir,
    log() {},
    timeoutMs: 5,
    pollMs: 1,
    sleep: ms => new Promise(x => setTimeout(x, ms)),
  });
  assert.equal(r.timedOut, true);
});

test('timings: per-guard p50/p95 and a stage event are recorded', () => {
  const dir = tmp();
  const run = {
    head: 'abc',
    totalMs: 1500,
    guards: [{ id: 'g', ms: 100, status: 'ok' }],
    deferred: [],
  };
  const row = recordTimings({ dir, run });
  assert.equal(row.schema, 'jovie-preflight-timing/v1');
  assert.equal(percentile([1, 2, 3, 4, 5], 50), 3);
  const s = summarize([
    { guards: [{ id: 'g', ms: 10 }] },
    { guards: [{ id: 'g', ms: 30 }] },
  ]);
  assert.deepEqual(s, [{ id: 'g', n: 2, p50: 10, p95: 30 }]);
});

test('the failing list names every item, however many', () => {
  const red = Array.from({ length: 40 }, (_, i) => ({
    id: `guard:g${i}`,
    name: `guard ${i}`,
  }));
  const lines = failingItemLines({
    red,
    body: { errors: [{ message: 'missing section' }] },
    companion: [{ trigger: 't', item: 'edit x' }],
  });
  assert.match(lines[0], /Failing items \(42\)/);
  assert.equal(lines.length, 43);
  assert.match(lines.at(-1), /42\. companion edit/);
  assert.deepEqual(
    failingItemLines({ red: [], body: { errors: [] }, companion: [] }),
    []
  );
});

test('a skipped check is named in the verdict, never a bare all clear', () => {
  const ran = [{ name: 'lint' }];
  assert.equal(verdictLine(0, ran), '\nall clear.');
  const skipped = [...ran, { name: 'private data guard', skip: 'no gh' }];
  assert.equal(
    verdictLine(0, skipped),
    '\nall clear; SKIPPED here (CI runs): private data guard.'
  );
  assert.match(verdictLine(2, skipped), /^\n2 item\(s\) to fix .*SKIPPED/);
});

test('host overload is a correctness signal, not only speed', () => {
  assert.equal(hostOverloaded({}, 50, 10), true);
  assert.equal(hostOverloaded({}, 15, 10), false);
  assert.equal(hostOverloaded({ CI: '1' }, 50, 10), false);
  assert.equal(hostOverloaded({ GEM_TYPECHECK_SLOTS: '2' }, 50, 10), false);
  assert.equal(
    hostOverloaded({ JOVIE_PREFLIGHT_OVERLOAD_FACTOR: '8' }, 50, 10),
    false
  );
});

test('a preflight deadline (exit 124) under overload is inconclusive, not a red', async () => {
  const { settleResult } = await import('../preflight-scope.mjs');
  const c = {
    id: 'guard:x',
    name: 'x',
    run: async () => ({ code: 1, out: '' }),
  };
  const r = await settleResult(
    c,
    { code: 124, out: '', failedTests: [] },
    {
      env: { JOVIE_PREFLIGHT_OVERLOAD_FACTOR: '0.000001' },
      paths: [],
      cwd: '.',
    }
  );
  assert.equal(r.code, 0);
  assert.match(r.warn, /inconclusive/);
});

test('a busy Gem queue is infra: the hook moves on to hosted runners', async () => {
  const {
    DEFAULT_GEM_QUEUE_MAX_SEC,
    SLOTS_BUSY_EXIT,
    gemQueueMaxSec,
    isBackendUnavailable,
  } = await import('../prepush-offload.mjs');
  assert.equal(isBackendUnavailable(SLOTS_BUSY_EXIT), true);
  assert.equal(isBackendUnavailable(127), true);
  assert.equal(isBackendUnavailable(255), true);
  // A real red on Gem stays a verdict and is never retried elsewhere.
  assert.equal(isBackendUnavailable(1), false);
  assert.equal(isBackendUnavailable(0), false);
  assert.equal(gemQueueMaxSec({}), DEFAULT_GEM_QUEUE_MAX_SEC);
  assert.equal(gemQueueMaxSec({ JOVIE_PREPUSH_GEM_QUEUE_MAX_SEC: '0' }), 0);
  assert.equal(gemQueueMaxSec({ JOVIE_PREPUSH_GEM_QUEUE_MAX_SEC: '30' }), 30);
  assert.equal(
    gemQueueMaxSec({ JOVIE_PREPUSH_GEM_QUEUE_MAX_SEC: 'x' }),
    DEFAULT_GEM_QUEUE_MAX_SEC
  );
});
