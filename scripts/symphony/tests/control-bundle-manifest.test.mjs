import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  buildManifest,
  CONTROL_BUNDLE_POLICY,
  digestPath,
  verifyManifest,
} from '../control-bundle-manifest.mjs';

const SCRIPT = resolve(
  import.meta.dirname,
  '..',
  'control-bundle-manifest.mjs'
);
const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const SOURCE_SHA = 'a'.repeat(40);

async function fixture(t, prefix = 'symphony-control-bundle-') {
  const root = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts', 'symphony'), { recursive: true });
  await mkdir(join(root, 'scripts', 'backlog-orchestrator'), {
    recursive: true,
  });
  await writeFile(join(root, 'scripts', 'symphony', 'runtime.py'), 'runtime');
  await writeFile(
    join(root, 'scripts', 'backlog-orchestrator', 'worker.mjs'),
    'worker'
  );
  await writeFile(join(root, 'bundle.tar.gz'), 'unchanged artifact bytes');
  const options = {
    root,
    repository: CONTROL_BUNDLE_POLICY.repository,
    sourceSha: SOURCE_SHA,
    version: 'v0.0.0-jovie.1',
    artifactPath: 'bundle.tar.gz',
    componentPaths: [...CONTROL_BUNDLE_POLICY.components],
    testReceipt: { status: 'PASS', command: 'focused', runId: '12345' },
    toolchain: { node: 'v22.23.2', pnpm: '9.15.4' },
    signature: {
      type: 'github-artifact-attestation',
      identity: CONTROL_BUNDLE_POLICY.signatureIdentity,
    },
    compatibility: { ...CONTROL_BUNDLE_POLICY.compatibility },
  };
  const manifest = await buildManifest(options);
  await writeFile(
    join(root, 'control-bundle-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  return { root, options, manifest };
}

const acceptedEvidence = async input => ({
  verified: true,
  repository: CONTROL_BUNDLE_POLICY.repository,
  signerWorkflow: CONTROL_BUNDLE_POLICY.signerWorkflow,
  predicateType: CONTROL_BUNDLE_POLICY.predicateType,
  sourceSha: input.sourceSha,
  subjects: input.subjects,
});

function verifyOptions(root, overrides = {}) {
  return {
    root,
    sourceSha: SOURCE_SHA,
    artifactPath: 'bundle.tar.gz',
    manifestPath: 'control-bundle-manifest.json',
    attestationVerifier: acceptedEvidence,
    ...overrides,
  };
}

test('binds and verifies content plus authenticated provenance', async t => {
  const { root, manifest } = await fixture(t);
  assert.equal(await verifyManifest(manifest, verifyOptions(root)), true);
  assert.match(manifest.artifact.sha256, /^[0-9a-f]{64}$/);
  assert.equal(manifest.components.length, 2);
});

test('uses raw artifact SHA-256 and remains valid after download relocation', async t => {
  const { root, manifest } = await fixture(t);
  const expected = createHash('sha256')
    .update('unchanged artifact bytes')
    .digest('hex');
  assert.equal(manifest.artifact.sha256, expected);
  await mkdir(join(root, 'download'));
  await copyFile(
    join(root, 'bundle.tar.gz'),
    join(root, 'download', 'bundle.tar.gz')
  );
  assert.equal(
    await verifyManifest(
      manifest,
      verifyOptions(root, { artifactPath: 'download/bundle.tar.gz' })
    ),
    true
  );
});

test('canonical component tree digest is independent of checkout root', async t => {
  const first = await fixture(t, 'symphony-control-first-');
  const second = await fixture(t, 'symphony-control-second-');
  assert.equal(
    await digestPath('scripts/symphony', first.root),
    await digestPath('scripts/symphony', second.root)
  );
});

test('rejects source mismatch and altered artifact or component', async t => {
  const { root, manifest } = await fixture(t);
  await assert.rejects(
    verifyManifest(
      manifest,
      verifyOptions(root, { sourceSha: 'b'.repeat(40) })
    ),
    /sourceSha/
  );
  await writeFile(join(root, 'bundle.tar.gz'), 'altered');
  await assert.rejects(
    verifyManifest(manifest, verifyOptions(root)),
    /artifact digest/
  );
  await writeFile(join(root, 'bundle.tar.gz'), 'unchanged artifact bytes');
  await writeFile(join(root, 'scripts', 'symphony', 'runtime.py'), 'tampered');
  await assert.rejects(
    verifyManifest(manifest, verifyOptions(root)),
    /component digest/
  );
});

/** @type {Array<{ name: string, patch: Record<string, unknown>, pattern: RegExp }>} */
const POLICY_REJECTIONS = [
  { name: 'invalid schema', patch: { schema: 'forged' }, pattern: /schema/ },
  {
    name: 'failed test receipt',
    patch: { tests: { status: 'FAIL' } },
    pattern: /test receipt/,
  },
  { name: 'absent toolchain', patch: { toolchain: {} }, pattern: /toolchain/ },
  {
    name: 'incompatible runtime',
    patch: {
      compatibility: { workflow: 'wrong/v999', runtime: 'unrelated/runtime' },
    },
    pattern: /compatibility/,
  },
  {
    name: 'forged attestation identity',
    patch: { signature: { type: 'unsigned', identity: 'attacker' } },
    pattern: /signature identity/,
  },
  {
    name: 'absent component bindings',
    patch: { components: [] },
    pattern: /component bindings/,
  },
  {
    name: 'missing repository identity',
    patch: { repository: '' },
    pattern: /repository/,
  },
  {
    name: 'nonportable artifact path',
    patch: { artifact: { path: '../bundle.tar.gz', sha256: 'a'.repeat(64) } },
    pattern: /artifact binding/,
  },
];
for (const { name, patch, pattern } of POLICY_REJECTIONS) {
  test(`rejects ${name}`, async t => {
    const { root, manifest } = await fixture(t);
    await assert.rejects(
      verifyManifest({ ...manifest, ...patch }, verifyOptions(root)),
      pattern
    );
  });
}

test('rejects intermediate-length source identities while building', async t => {
  const { options } = await fixture(t);
  await assert.rejects(
    buildManifest({ ...options, sourceSha: 'a'.repeat(41) }),
    /40- or 64-character/
  );
});

test('rejects a manifest object that differs from the attested file', async t => {
  const { root, manifest } = await fixture(t);
  await assert.rejects(
    verifyManifest(
      { ...manifest, version: 'v0.0.0-jovie.forged' },
      verifyOptions(root)
    ),
    /attested manifest file/
  );
});

test('requires cryptographic attestation verification for both subjects', async t => {
  const { root, manifest } = await fixture(t);
  await assert.rejects(
    verifyManifest(
      manifest,
      verifyOptions(root, { attestationVerifier: undefined })
    ),
    /attestation bundle path/
  );
  await assert.rejects(
    verifyManifest(
      manifest,
      verifyOptions(root, {
        attestationVerifier: async input => ({
          ...(await acceptedEvidence(input)),
          signerWorkflow: 'attacker/example/.github/workflows/forged.yml',
        }),
      })
    ),
    /authenticated attestation evidence/
  );
});

test('default verifier checks both subjects with the pinned GitHub policy', async t => {
  const { root, manifest } = await fixture(t);
  const bin = join(root, 'bin');
  const bundle = join(root, 'attestation.jsonl');
  await mkdir(bin);
  await writeFile(bundle, '{}\n');
  await writeFile(join(bin, 'gh'), '#!/bin/sh\nprintf "[{}]\\n"\n');
  await chmod(join(bin, 'gh'), 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${bin}:${originalPath}`;
  t.after(() => {
    process.env.PATH = originalPath;
  });
  assert.equal(
    await verifyManifest(
      manifest,
      verifyOptions(root, {
        attestationBundlePath: bundle,
        attestationVerifier: undefined,
      })
    ),
    true
  );
  await writeFile(join(bin, 'gh'), '#!/bin/sh\nprintf "[]\\n"\n');
  await assert.rejects(
    verifyManifest(
      manifest,
      verifyOptions(root, {
        attestationBundlePath: bundle,
        attestationVerifier: undefined,
      })
    ),
    /no verified GitHub attestation/
  );
});

test('rejects component symlinks instead of hashing outside the tree', async t => {
  const { root, options } = await fixture(t);
  await symlink(
    join(root, 'bundle.tar.gz'),
    join(root, 'scripts', 'symphony', 'external-link')
  );
  await assert.rejects(buildManifest(options), /may not contain symlinks/);
});

test('real build CLI rejects failed evidence and forged identity', async t => {
  const { root } = await fixture(t);
  const result = spawnSync(
    process.execPath,
    [
      SCRIPT,
      'build',
      '--repository',
      CONTROL_BUNDLE_POLICY.repository,
      '--sourceSha',
      SOURCE_SHA,
      '--version',
      'v1',
      '--artifact',
      join(root, 'bundle.tar.gz'),
      '--components',
      CONTROL_BUNDLE_POLICY.components.join(','),
      '--tests',
      JSON.stringify({ status: 'FAIL' }),
      '--toolchain',
      JSON.stringify({ node: 'v22.23.2', pnpm: '9.15.4' }),
      '--signature',
      JSON.stringify({ type: 'unsigned', identity: 'attacker' }),
      '--compatibility',
      JSON.stringify(CONTROL_BUNDLE_POLICY.compatibility),
    ],
    { cwd: root, encoding: 'utf8' }
  );
  assert.notEqual(result.status, 0, result.stdout);
});

test('real verify CLI fails closed when provenance is absent', async t => {
  const { root } = await fixture(t);
  const result = spawnSync(
    process.execPath,
    [
      SCRIPT,
      'verify',
      '--manifest',
      join(root, 'control-bundle-manifest.json'),
      '--artifact',
      join(root, 'bundle.tar.gz'),
      '--sourceSha',
      SOURCE_SHA,
      '--attestationBundle',
      join(root, 'missing-attestation.jsonl'),
    ],
    { cwd: root, encoding: 'utf8' }
  );
  assert.notEqual(result.status, 0, result.stdout);
});

test('release attests and verifies both subjects before publication', async () => {
  const workflow = await readFile(
    join(REPO_ROOT, '.github', 'workflows', 'symphony-control-release.yml'),
    'utf8'
  );
  const attest = workflow.indexOf(
    'name: Attest control bundle and manifest provenance'
  );
  const verify = workflow.indexOf(
    'name: Verify bundle and manifest provenance'
  );
  const upload = workflow.indexOf('name: Upload versioned control bundle');
  assert.ok(attest > 0 && verify > attest && upload > verify);
  assert.match(
    workflow,
    /actions\/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8/
  );
  assert.match(
    workflow,
    /control-bundle\.tar\.gz[\s\S]*control-bundle-manifest\.json/
  );
  assert.match(workflow, /control-bundle-manifest\.mjs verify/);

  const packageJson = JSON.parse(
    await readFile(join(REPO_ROOT, 'package.json'), 'utf8')
  );
  assert.match(
    packageJson.scripts['ci:control:test'],
    /control-bundle-manifest\.test\.mjs/
  );
  const ciWorkflow = await readFile(
    join(REPO_ROOT, '.github', 'workflows', 'ci.yml'),
    'utf8'
  );
  assert.match(ciWorkflow, /control-bundle-manifest\\\.mjs\$/);
  assert.match(ciWorkflow, /control-bundle-manifest\\\.test\\\.mjs\$/);
});
