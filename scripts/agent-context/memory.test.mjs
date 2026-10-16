import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, test } from 'node:test';
import { memory } from './memory.mjs';

const roots = [];
const temp = () => {
  const root = fs.mkdtempSync(join(tmpdir(), 'memory-'));
  roots.push(root);
  return root;
};
afterEach(() => {
  roots
    .splice(0)
    .forEach(root => fs.rmSync(root, { recursive: true, force: true }));
});
const contract = {
  goal: 'resume repair',
  rules: 'verify runtime',
  measurement: 'duplicate diagnoses',
  owner: 'operator',
  source: 'jovie',
  links: ['ops/staging'],
};
const note = {
  kind: 'finding',
  key: 'staging',
  value: 'already applied; investigate reversion',
  source: 'git:abc',
  revision: 'abc',
  author: 'a',
  durable: true,
};
const taskPath = root => join(root, 'operator-jovie/tasks/jov-4302');
const records = root => join(taskPath(root), 'entries');
const invoke = (root, action, input = {}, deps = {}) =>
  memory(
    { root, namespace: 'operator-jovie', task: 'jov-4302', action, input },
    deps
  );
const reject = (promise, pattern) =>
  assert.rejects(promise, new RegExp(pattern));
const script = resolve('scripts/agent-context/memory.mjs');
const cli = root =>
  JSON.parse(
    execFileSync(
      process.execPath,
      [script, root, 'operator-jovie', 'jov-4302', 'resume'],
      { input: '{}', encoding: 'utf8', timeout: 5000 }
    )
  );

test('JOV-4302/JOV-4286: replacement process resumes evidence and next step', async () => {
  const root = temp(),
    start = await invoke(root, 'bootstrap', contract);
  assert.ok('indexBytes' in start && start.indexBytes < 4096);
  await invoke(root, 'append', { ...note, basis: start.basis });
  const current = await invoke(root, 'resume');
  const value = {
    completed: 'diagnosis',
    remaining: 'verify',
    next: 'check reversion',
    branch: 'test',
    sha: 'abc',
    permissions: 'read',
  };
  await invoke(root, 'append', {
    ...note,
    kind: 'handoff',
    key: 'a',
    basis: current.basis,
    value,
  });
  const findings = cli(root).findings;
  assert.equal(findings.length, 2);
  assert.equal(findings.find(e => e.kind === 'handoff').value.next, value.next);
  assert.equal(findings.find(e => e.kind === 'finding').revision, 'abc');
  await reject(
    invoke(root, 'append', { ...note, basis: start.basis }),
    'stale-snapshot'
  );
});

test('Git merging two agents preserves conflicts until evidence reconciles them', async () => {
  const a = temp(),
    b = temp(),
    start = await invoke(a, 'bootstrap', contract);
  fs.cpSync(a, b, { recursive: true });
  await invoke(a, 'append', { ...note, basis: start.basis });
  await invoke(b, 'append', {
    ...note,
    author: 'b',
    value: 'missing',
    basis: start.basis,
  });
  fs.readdirSync(records(b)).forEach(f =>
    fs.cpSync(join(records(b), f), join(records(a), f))
  );
  const merged = await invoke(a, 'resume');
  assert.ok('conflicts' in merged);
  assert.equal(merged.conflicts.length, 1);
  await reject(invoke(a, 'consolidate'), 'unresolved-conflicts');
  const resolves = merged.entries.map(e => e.id).sort();
  const resolution = {
    ...note,
    kind: 'resolution',
    key: 'finding:staging',
    resolves,
    basis: merged.basis,
  };
  await reject(
    invoke(a, 'append', { ...resolution, resolves: [] }),
    'resolution-must'
  );
  await invoke(a, 'append', resolution);
  const result = await invoke(a, 'resume');
  assert.ok('conflicts' in result);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.entries.length, 3);
  assert.deepEqual(result.findings[0].resolves, resolves);
});

test('retrieval refreshes provenance; unavailable memory is fail-soft and isolated', async () => {
  const root = temp();
  await invoke(root, 'bootstrap', contract);
  const brain = {
    getPage: async slug => ({
      slug,
      revision: 'v2',
      compiledTruth: 'canonical',
    }),
  };
  const get = (slug, deps = { brain }) =>
    invoke(root, 'retrieve', { slug }, deps);
  const result = await get('ops/staging');
  const file = join(taskPath(root), result.link);
  assert.match(fs.readFileSync(file, 'utf8'), /revision: v2/);
  await reject(get('customer/private'), 'unlinked');
  await reject(
    get('ops/staging', { brain: { getPage: async () => null } }),
    'unavailable'
  );
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /canonical/);
  assert.equal(cli(temp()).status, 'degraded');
  const args = { root, task: 'jov-4302', action: 'resume', input: {} };
  await reject(memory({ ...args, namespace: '../customer' }), 'invalid-name');
  fs.symlinkSync(temp(), join(root, 'other'));
  await reject(memory({ ...args, namespace: 'other' }), 'unsafe-directory');
});

test('native import/dream retains provenance and receipts; unsupported dream cannot pass', async () => {
  const root = temp(),
    start = await invoke(root, 'bootstrap', contract);
  await invoke(root, 'append', { ...note, basis: start.basis });
  const calls = [],
    pages = new Map();
  const prefix = 'ops/agent-memory/operator-jovie/jov-4302';
  const run = args => {
    calls.push(args[0]);
    if (args[0] === 'import') {
      const dir = join(args[1], prefix);
      fs.readdirSync(dir).forEach(f =>
        pages.set(
          `${prefix}/${f.slice(0, -3)}`,
          fs.readFileSync(join(dir, f), 'utf8')
        )
      );
      return '{"imported":1,"errors":0}';
    }
    return '{"status":"ok","phases":[{"phase":"patterns","status":"ok"}]}';
  };
  const brain = {
    getPage: async slug => ({
      slug,
      revision: 'v3',
      compiledTruth: pages.get(slug) || '',
    }),
  };
  const receipt = await invoke(root, 'consolidate', {}, { run, brain });
  assert.deepEqual(calls, ['import', 'dream']);
  assert.equal(receipt.promoted[0].revision, 'v3');
  const native = fs.readFileSync(
    join(taskPath(root), receipt.nativeReceipt),
    'utf8'
  );
  assert.match([...pages.values()].join('\n'), /git:abc/);
  assert.match(native, /patterns/);
  await reject(
    invoke(root, 'consolidate', {}, { run: () => 'unsupported', brain }),
    'JSON'
  );
  assert.equal(cli(root).findings.length, 1);
});
