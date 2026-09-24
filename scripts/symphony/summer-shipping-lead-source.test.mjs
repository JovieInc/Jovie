import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadCanonicalShippingAdmission } from './summer-shipping-lead-source.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const INSTALLED = {
  summerSymphonyConsumer: 'summer-symphony-outbox-consumer.mjs',
  summerShippingLeadContract: 'summer-shipping-lead-contract.mjs',
  summerShippingLeadAdmitter: 'summer-shipping-lead-admitter.mjs',
  summerShippingLeadSource: 'summer-shipping-lead-source.mjs',
  summerBottleneckProducer: 'summer_bottleneck_producer.py',
  summerAdmissions: 'summer_admissions.py',
  summerExistingRepair: 'summer_existing_repair.py',
  summerCiAudit: 'summer_ci_audit.py',
};
function fixture(t, producerScript = null) {
  const root = mkdtempSync(join(tmpdir(), 'shipping-source-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const mirror = join(root, 'mirror');
  const workspace = join(root, 'gem');
  const privateRoot = join(workspace, 'state/summer-symphony-consumer');
  mkdirSync(mirror);
  mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  mkdirSync(join(workspace, 'scripts'));
  const paths = [
    ...readdirSync(join(repo, 'scripts/backlog-orchestrator'))
      .filter(name => /^[a-z0-9-]+\.(mjs|json)$/u.test(name))
      .map(name => `scripts/backlog-orchestrator/${name}`),
    'scripts/invariants/registry.mjs',
    'scripts/invariants/optimization-contract.mjs',
    'scripts/invariants/pr-lifecycle-contract.mjs',
    'scripts/lib/rolling-ci-handoff.mjs',
    'canon/invariants.jsonl',
    'scripts/symphony/config/model-registry.json',
    ...Object.values(INSTALLED).map(name => `scripts/symphony/${name}`),
  ];
  for (const path of paths) {
    mkdirSync(dirname(join(mirror, path)), { recursive: true });
    copyFileSync(join(repo, path), join(mirror, path));
  }
  if (producerScript)
    writeFileSync(
      join(mirror, 'scripts/symphony/summer_bottleneck_producer.py'),
      producerScript
    );
  const git = (...args) =>
    execFileSync('git', ['-C', mirror, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('add', '.');
  git('commit', '-qm', 'exact fixture source');
  const revision = git('rev-parse', 'HEAD');
  const receipt = {
    schema: 'gem-pr-rehabilitation-attestation/v1',
    sourceRevision: revision,
    artifacts: {},
  };
  for (const [key, filename] of Object.entries(INSTALLED)) {
    copyFileSync(
      join(mirror, 'scripts/symphony', filename),
      join(workspace, 'scripts', filename)
    );
    const sha = createHash('sha256')
      .update(readFileSync(join(workspace, 'scripts', filename)))
      .digest('hex');
    receipt.artifacts[key] = {
      sourceSha256: sha,
      installedSha256: sha,
      matches: true,
    };
  }
  const receiptPath = join(
    workspace,
    'state/gem-pr-rehabilitation-attestation.json'
  );
  const save = () => writeFileSync(receiptPath, JSON.stringify(receipt));
  save();
  return {
    root,
    mirror,
    workspace,
    privateRoot,
    git,
    revision,
    receipt,
    receiptPath,
    save,
  };
}

test('loads the complete real canonical module closure from its exact commit and cleans up', async t => {
  const f = fixture(t);
  // A mutable checkout edit must not enter the imported canonical code.
  writeFileSync(
    join(f.mirror, 'scripts/backlog-orchestrator/backlog-orchestrator.mjs'),
    'throw new Error("dirty source executed");'
  );
  const loaded = await loadCanonicalShippingAdmission(f);
  assert.equal(loaded.sourceRevision, f.revision);
  assert.equal(typeof loaded.admit, 'function');
  assert.equal(readdirSync(f.privateRoot).length, 1);
  loaded.cleanup();
  assert.deepEqual(readdirSync(f.privateRoot), []);
});

test('rejects missing or stale installed source before any import', async t => {
  const f = fixture(t);
  const path = join(f.workspace, 'scripts/summer-shipping-lead-admitter.mjs');
  writeFileSync(path, 'throw new Error("foreign installed source");');
  await assert.rejects(
    loadCanonicalShippingAdmission(f),
    /installed-source-mismatch/
  );
  assert.deepEqual(readdirSync(f.privateRoot), []);
  copyFileSync(
    join(f.mirror, 'scripts/symphony/summer-shipping-lead-admitter.mjs'),
    path
  );
  f.receipt.artifacts.summerShippingLeadAdmitter.matches = false;
  f.save();
  await assert.rejects(
    loadCanonicalShippingAdmission(f),
    /installed-source-mismatch/
  );
  f.receipt.artifacts.summerShippingLeadAdmitter.matches = true;
  f.receipt.artifacts.summerShippingLeadAdmitter.sourceSha256 = '0'.repeat(64);
  f.save();
  await assert.rejects(
    loadCanonicalShippingAdmission(f),
    /installed-source-mismatch/
  );
});

test('rejects unsafe directories, receipts, and symlinked installed modules', async t => {
  const f = fixture(t);
  await assert.rejects(
    loadCanonicalShippingAdmission({ ...f, workspace: 'relative' }),
    /path-invalid/
  );
  await assert.rejects(
    loadCanonicalShippingAdmission({ ...f, mirror: 'relative' }),
    /path-invalid/
  );
  chmodSync(f.privateRoot, 0o755);
  await assert.rejects(loadCanonicalShippingAdmission(f), /directory-invalid/);
  chmodSync(f.privateRoot, 0o700);
  chmodSync(f.receiptPath, 0o666);
  await assert.rejects(loadCanonicalShippingAdmission(f), /path-untrusted/);
  chmodSync(f.receiptPath, 0o600);
  const path = join(f.workspace, 'scripts/summer-shipping-lead-admitter.mjs');
  rmSync(path);
  symlinkSync(
    join(f.mirror, 'scripts/symphony/summer-shipping-lead-admitter.mjs'),
    path
  );
  await assert.rejects(loadCanonicalShippingAdmission(f), /path-untrusted/);
});

test('rejects malformed, oversized, or unavailable source identities', async t => {
  const f = fixture(t);
  for (const change of [
    { schema: 'foreign' },
    { sourceRevision: '' },
    { sourceRevision: 'a'.repeat(40) },
  ]) {
    writeFileSync(f.receiptPath, JSON.stringify({ ...f.receipt, ...change }));
    await assert.rejects(loadCanonicalShippingAdmission(f));
  }
  writeFileSync(f.receiptPath, ' '.repeat(128 * 1024 + 1));
  await assert.rejects(loadCanonicalShippingAdmission(f), /receipt-too-large/);
});

test('rejects an incomplete committed closure and removes failed staging directories', async t => {
  const f = fixture(t);
  f.git('rm', 'scripts/backlog-orchestrator/config.json');
  f.git('commit', '-qm', 'incomplete closure');
  f.receipt.sourceRevision = f.git('rev-parse', 'HEAD');
  f.save();
  await assert.rejects(loadCanonicalShippingAdmission(f), /closure-invalid/);
  assert.deepEqual(readdirSync(f.privateRoot), []);
});

test('rejects archive substitutions before code execution', async t => {
  const f = fixture(t);
  const entry = 'scripts/backlog-orchestrator/backlog-orchestrator.mjs';
  writeFileSync(
    join(f.mirror, entry),
    'export const replaced = "$Format:%H$";'
  );
  writeFileSync(join(f.mirror, '.gitattributes'), `${entry} export-subst\n`);
  f.git('add', '.');
  f.git('commit', '-qm', 'archive substitution fixture');
  f.receipt.sourceRevision = f.git('rev-parse', 'HEAD');
  f.save();
  await assert.rejects(loadCanonicalShippingAdmission(f), /content-mismatch/);
  assert.deepEqual(readdirSync(f.privateRoot), []);
});

test('rejects a source revision without the required entry export', async t => {
  const f = fixture(t);
  writeFileSync(
    join(f.mirror, 'scripts/backlog-orchestrator/backlog-orchestrator.mjs'),
    'export const unrelated = true;'
  );
  f.git('add', '.');
  f.git('commit', '-qm', 'missing entry fixture');
  f.receipt.sourceRevision = f.git('rev-parse', 'HEAD');
  f.save();
  await assert.rejects(loadCanonicalShippingAdmission(f), /entry-unavailable/);
  assert.deepEqual(readdirSync(f.privateRoot), []);
});

test('archive extraction remains private with a permissive caller umask', async t => {
  const f = fixture(t);
  const prior = process.umask(0);
  let loaded;
  try {
    loaded = await loadCanonicalShippingAdmission(f);
    assert.equal(typeof loaded.admit, 'function');
  } finally {
    process.umask(prior);
    loaded?.cleanup();
  }
});

test('executes the exact installed read-only runtime command and parses its result', async t => {
  const f = fixture(
    t,
    'import json,sys\nassert sys.argv[1:] == ["--observe-shipping-runtime"]\nprint(json.dumps({"schema":"fixture-runtime"}))\n'
  );
  const loaded = await loadCanonicalShippingAdmission(f);
  try {
    assert.deepEqual(await loaded.observeRuntime(), {
      schema: 'fixture-runtime',
    });
  } finally {
    loaded.cleanup();
  }
});

test('reconciliation accepts only an ancestor with the same signed contract, never a future or incompatible revision', async t => {
  const f = fixture(t);
  const path = 'scripts/symphony/summer-shipping-lead-contract.mjs';
  const original = readFileSync(join(f.mirror, path));
  writeFileSync(join(f.mirror, path), '// incompatible old contract\n');
  f.git('add', '.');
  f.git('commit', '-qm', 'old incompatible contract');
  const incompatible = f.git('rev-parse', 'HEAD');
  writeFileSync(join(f.mirror, path), original);
  f.git('add', '.');
  f.git('commit', '-qm', 'current supported contract');
  f.receipt.sourceRevision = f.git('rev-parse', 'HEAD');
  f.save();
  const loaded = await loadCanonicalShippingAdmission(f);
  t.after(loaded.cleanup);
  assert.equal(loaded.canReconcileSource(f.revision), true);
  assert.equal(loaded.canReconcileSource(f.receipt.sourceRevision), true);
  assert.equal(loaded.canReconcileSource(incompatible), false);
  assert.equal(loaded.canReconcileSource('bad'), false);
  assert.equal(loaded.canReconcileSource('a'.repeat(40)), false);
  f.git('commit', '--allow-empty', '-qm', 'future uninstalled source');
  assert.equal(loaded.canReconcileSource(f.git('rev-parse', 'HEAD')), false);
  assert.equal(typeof loaded.observeIssue, 'function');
});
