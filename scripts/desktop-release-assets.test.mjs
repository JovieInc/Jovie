import assert from 'node:assert/strict';
import test from 'node:test';
import { prepare } from './desktop-release-assets.mjs';

// JOV-12609: a production Desktop release run rejected by Apple notarization
// left a private, never-published, asset-less draft release whose
// target_commitish points at an older commit. Every later prepare then died
// with 'Release target is not the authorized commit' because the production
// path, unlike staging, never retargeted an existing exact-tag draft. These
// cases live apart from desktop-release-publisher.test.mjs to honor its
// size-500 budget (scripts/company-guards/size-baseline.json).
//
// Refusal cases assert a rejection under EITHER guard wording: the pre-fix
// envelope invariant ('Release target is not the authorized commit') and the
// post-fix retarget guard ('A non-empty or public release cannot be
// retargeted') both fail closed, so these tests pass before and after the
// retarget fix and pin the refusal against regression in either phase.

const AUTHORIZED = 'b'.repeat(40);
const STALE = 'a'.repeat(40);
const VERSION = '26.11.3';
const RETARGET_REJECTION = /cannot be retargeted|not the authorized commit/;

function draftClient(overrides = {}) {
  const client = {
    release: {
      id: 445189348,
      tag_name: `v${VERSION}`,
      target_commitish: STALE,
      name: VERSION,
      draft: true,
      prerelease: false,
      published_at: null,
      assets: [],
    },
    retargets: 0,
  };
  Object.assign(client.release, overrides);
  client.releaseOrDraftByTag = async () => client.release;
  client.retargetEmptyDraft = async (_id, releaseSha) => {
    client.retargets += 1;
    assert.equal(_id, client.release.id);
    client.release.target_commitish = releaseSha;
    return client.release;
  };
  client.createDraft = async () => {
    throw new Error('prepare must not create a draft for an existing tag');
  };
  client.updateReleaseMetadata = async () => {
    throw new Error('prepare must not rewrite release metadata here');
  };
  client.releaseById = async () => {
    throw new Error('prepare must not re-read the release here');
  };
  return client;
}

function prepareInput(client) {
  return {
    client,
    environment: 'production',
    installedVersion: VERSION,
    releaseSha: AUTHORIZED,
    version: VERSION,
  };
}

test('production prepare retargets a stale asset-less unpublished exact-tag draft', async () => {
  const client = draftClient();
  await prepare(prepareInput(client));
  assert.equal(client.retargets, 1);
  assert.equal(client.release.target_commitish, AUTHORIZED);
  assert.equal(client.release.draft, true);
  assert.equal(client.release.published_at, null);
  assert.deepEqual(client.release.assets, []);
});

test('production prepare retargets idempotently when the target already matches', async () => {
  const client = draftClient({ target_commitish: AUTHORIZED });
  await prepare(prepareInput(client));
  assert.equal(client.retargets, 0);
  assert.equal(client.release.target_commitish, AUTHORIZED);
});

test('production prepare still refuses a published release targeting an older commit', async () => {
  const client = draftClient({
    draft: false,
    published_at: '2026-11-14T09:52:00Z',
  });
  const before = structuredClone(client.release);
  await assert.rejects(prepare(prepareInput(client)), RETARGET_REJECTION);
  assert.deepEqual(client.release, before);
  assert.equal(client.retargets, 0);
});

test('production prepare still refuses a stale exact-tag draft that holds assets', async () => {
  const client = draftClient({
    assets: [{ id: 1, name: `Jovie-${VERSION}-universal.dmg` }],
  });
  const before = structuredClone(client.release);
  await assert.rejects(prepare(prepareInput(client)), RETARGET_REJECTION);
  assert.deepEqual(client.release, before);
  assert.equal(client.retargets, 0);
});
