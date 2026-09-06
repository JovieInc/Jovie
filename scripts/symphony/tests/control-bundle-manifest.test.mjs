import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildManifest, verifyManifest } from '../control-bundle-manifest.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'symphony-control-bundle-'));
  await writeFile(join(root, 'bundle.tar.gz'), 'bundle');
  await writeFile(join(root, 'component.txt'), 'component');
  return root;
}

test('binds source, component, artifact, test, toolchain, and signature evidence', async () => {
  const root = await fixture();
  const sourceSha = 'a'.repeat(40);
  const manifest = await buildManifest({
    root,
    repository: 'JovieInc/Jovie',
    sourceSha,
    version: 'v0.0.0-jovie.1',
    artifactPath: 'bundle.tar.gz',
    componentPaths: ['component.txt'],
    testReceipt: { status: 'PASS', command: 'focused' },
    toolchain: { node: '22.23.2', pnpm: '9.15.4' },
    signature: {
      type: 'github-artifact-attestation',
      identity: 'github-actions',
    },
    compatibility: {
      workflow: 'jovie-ui-pilot/v1',
      runtime: 'openai/symphony',
    },
  });
  assert.equal(await verifyManifest(manifest, { root, sourceSha }), true);
  assert.match(manifest.components[0].sha256, /^[0-9a-f]{64}$/);
});

test('rejects a source SHA mismatch and altered artifact', async () => {
  const root = await fixture();
  const manifest = await buildManifest({
    root,
    repository: 'JovieInc/Jovie',
    sourceSha: 'b'.repeat(40),
    version: 'v0.0.0-jovie.1',
    artifactPath: 'bundle.tar.gz',
    componentPaths: ['component.txt'],
    signature: {
      type: 'github-artifact-attestation',
      identity: 'github-actions',
    },
  });
  await assert.rejects(
    verifyManifest(manifest, { root, sourceSha: 'c'.repeat(40) }),
    /sourceSha/
  );
  await writeFile(join(root, 'bundle.tar.gz'), 'altered');
  await assert.rejects(verifyManifest(manifest, { root }), /artifact digest/);
});
